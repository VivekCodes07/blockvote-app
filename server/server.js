const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dns = require("dns");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// Configure DNS resolvers before connecting to MongoDB Atlas
// Helps environments where local resolver (e.g. 127.0.0.1) fails SRV record resolution
const rawDns = process.env.DNS_SERVERS;
if (rawDns && ["system", "none", "false"].includes(rawDns.trim().toLowerCase())) {
  // Use system default DNS resolver
} else {
  const dnsServers = rawDns
    ? rawDns.split(",").map((s) => s.trim()).filter(Boolean)
    : ["1.1.1.1", "1.0.0.1"];

  if (dnsServers.length > 0) {
    try {
      dns.setServers(dnsServers);
    } catch (err) {
      console.warn("[DNS] Failed to set custom DNS servers:", err.message);
    }
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Routes
const authRoutes = require("./routes/auth");
const electionRoutes = require("./routes/elections");
const voteRoutes = require("./routes/votes");
const auditRoutes = require("./routes/audit");

// Middleware
app.use(cors());
app.use(express.json());

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/votes", voteRoutes);
app.use("/api/audit", auditRoutes);

// Helper function to return Mongoose connection state name
const getDbState = () => {
  switch (mongoose.connection.readyState) {
    case 0:
      return "disconnected";
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "unknown";
  }
};

// Track latest sanitized database error for diagnostics
let lastDbError = null;

const formatDbError = (err) => {
  if (!err) return null;
  const info = {
    name: err.name,
    message: err.message,
    timestamp: new Date().toISOString(),
  };

  // Extract per-server error details without exposing credentials or full URIs
  if (err.reason && err.reason.servers) {
    info.hosts = {};
    for (const [address, serverDesc] of err.reason.servers.entries()) {
      info.hosts[address] = {
        type: serverDesc.type,
        error: serverDesc.error ? serverDesc.error.message : null,
      };
    }
  }
  return info;
};

// MongoDB Connection Setup
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.warn(
    "[MongoDB] WARNING: MONGODB_URI is not defined in server/.env. Database features will remain offline until configured."
  );
} else {
  mongoose.connection.on("connected", () => {
    lastDbError = null;
    console.log("[MongoDB] Connected successfully to Atlas.");
  });

  mongoose.connection.on("error", (err) => {
    lastDbError = formatDbError(err);
    console.error("[MongoDB] Connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[MongoDB] Connection disconnected.");
  });

  mongoose
    .connect(mongoUri)
    .catch((err) => {
      lastDbError = formatDbError(err);
      console.error(`[MongoDB] Initial connection failed (${err.name}):`, err.message);
      if (err.reason && err.reason.servers) {
        for (const [address, serverDesc] of err.reason.servers.entries()) {
          if (serverDesc.error) {
            console.error(`[MongoDB] Host ${address} error:`, serverDesc.error.message);
          }
        }
      }
    });
}

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BlockVote API is running!",
  });
});

// Health check (independent of database state)
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    service: "BlockVote Backend",
  });
});

// Database status check with diagnostics
app.get("/api/db-status", (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  const state = getDbState();

  res.json({
    success: true,
    configured: Boolean(mongoUri),
    connected: isConnected,
    state,
    database: isConnected ? mongoose.connection.name : null,
    diagnosticError: isConnected ? null : lastDbError,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`BlockVote server running at http://localhost:${PORT}`);
});
