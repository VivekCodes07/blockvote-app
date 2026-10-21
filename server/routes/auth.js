const express = require("express");
const bcrypt = require("bcryptjs");
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

    // Persist new voter
    const newVoter = await Voter.create({
      fullName: cleanFullName,
      email: normalizedEmail,
      password: hashedPassword,
    });

    // Return response without any password information
    return res.status(201).json({
      success: true,
      message: "Voter registered successfully.",
      voter: {
        id: newVoter._id,
        fullName: newVoter.fullName,
        email: newVoter.email,
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

module.exports = router;
