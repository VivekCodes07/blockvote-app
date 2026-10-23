const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Voter = require("../models/Voter");

const router = express.Router();

// Email format validator
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === "string" && emailRegex.test(email.trim());
};

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    // Check database connection readiness
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database service is currently unavailable. Please try again shortly.",
      });
    }

    const { fullName, email, password } = req.body || {};

    // Validate presence and types
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password is required and must be at least 6 characters long.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanFullName = fullName.trim();

    // Check if voter email is already registered
    const existingVoter = await Voter.findOne({ email: normalizedEmail });
    if (existingVoter) {
      return res.status(409).json({
        success: false,
        message: "A voter with this email is already registered.",
      });
    }

    // Hash password with bcryptjs (10 salt rounds)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Public registration always assigns the "voter" role
    const newVoter = await Voter.create({
      fullName: cleanFullName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "voter",
    });

    // Return response without any password information
    return res.status(201).json({
      success: true,
      message: "Voter registered successfully.",
      voter: {
        id: newVoter._id,
        fullName: newVoter.fullName,
        email: newVoter.email,
        role: newVoter.role,
        createdAt: newVoter.createdAt,
      },
    });
  } catch (error) {
    // Handle MongoDB duplicate key race condition (code 11000)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A voter with this email is already registered.",
      });
    }

    // Handle Mongoose validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
      });
    }

    // Generic server error (do not leak internal details)
    console.error("[Auth] Registration error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred during registration.",
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    // Check database connection readiness
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database service is currently unavailable. Please try again shortly.",
      });
    }

    const { email, password } = req.body || {};

    // Validate presence
    if (!email || typeof email !== "string" || !email.trim() || !password || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query voter by normalized email
    const voter = await Voter.findOne({ email: normalizedEmail });
    if (!voter) {
      // Generic 401 response prevents user enumeration
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Verify password against stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(password, voter.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Validate JWT configuration
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("[Auth] ERROR: JWT_SECRET is not configured in server/.env.");
      return res.status(500).json({
        success: false,
        message: "Authentication service misconfiguration. Please contact administrator.",
      });
    }

    // Sign JWT with 24h expiration
    const payload = {
      id: voter._id,
      email: voter.email,
      fullName: voter.fullName,
      role: voter.role,
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: "24h" });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      voter: {
        id: voter._id,
        fullName: voter.fullName,
        email: voter.email,
        role: voter.role,
        createdAt: voter.createdAt,
      },
    });
  } catch (error) {
    console.error("[Auth] Login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred during login.",
    });
  }
});

// GET /api/auth/me (Verify active session token)
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        message: "Authentication service misconfiguration.",
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const voter = await Voter.findById(decoded.id);
    if (!voter) {
      return res.status(404).json({
        success: false,
        message: "Voter not found.",
      });
    }

    return res.status(200).json({
      success: true,
      voter: {
        id: voter._id,
        fullName: voter.fullName,
        email: voter.email,
        role: voter.role,
        createdAt: voter.createdAt,
      },
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session token.",
    });
  }
});

module.exports = router;
