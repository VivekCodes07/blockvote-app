const jwt = require("jsonwebtoken");
const Voter = require("../models/Voter");

// Middleware to verify active session JWT
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please sign in.",
    });
  }

  const token = authHeader.split(" ")[1];
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error("[Auth Middleware] JWT_SECRET is not configured.");
    return res.status(500).json({
      success: false,
      message: "Authentication service misconfiguration.",
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session token.",
    });
  }
};

// Middleware to require admin authorization, validated against live database
const requireAdmin = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const freshVoter = await Voter.findById(req.user.id);
    if (!freshVoter || freshVoter.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Administrator authorization required.",
      });
    }

    req.voter = freshVoter;
    next();
  } catch (err) {
    console.error("[Auth Middleware] requireAdmin error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Authorization verification failed.",
    });
  }
};

module.exports = {
  verifyToken,
  requireAdmin,
};
