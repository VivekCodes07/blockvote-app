const path = require("path");
const dns = require("dns");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const Voter = require("../models/Voter");

// Optional DNS resolvers to assist environments with local DNS issues
const rawDns = process.env.DNS_SERVERS;
if (rawDns && ["system", "none", "false"].includes(rawDns.trim().toLowerCase())) {
  // Use system default resolver
} else {
  const dnsServers = rawDns
    ? rawDns.split(",").map((s) => s.trim()).filter(Boolean)
    : ["1.1.1.1", "1.0.0.1"];

  if (dnsServers.length > 0) {
    try {
      dns.setServers(dnsServers);
    } catch {
      // Ignore
    }
  }
}

async function promoteAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!adminEmail) {
    console.error("[BlockVote Admin Setup] ERROR: ADMIN_EMAIL is not configured in server/.env.");
    console.error("Please add ADMIN_EMAIL=admin@college.edu to server/.env and run this script again.");
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("[BlockVote Admin Setup] ERROR: MONGODB_URI is not configured in server/.env.");
    process.exit(1);
  }

  try {
    console.log("[BlockVote Admin Setup] Connecting to MongoDB...");
    await mongoose.connect(mongoUri);

    const voter = await Voter.findOne({ email: adminEmail });

    if (!voter) {
      console.error(`[BlockVote Admin Setup] Account not found: No voter account with email "${adminEmail}" exists.`);
      console.error("[BlockVote Admin Setup] The user must register an account first before running this promotion script.");
      await mongoose.disconnect();
      process.exit(1);
    }

    if (voter.role === "admin") {
      console.log(`[BlockVote Admin Setup] Account "${adminEmail}" (${voter.fullName}) is already configured with admin privileges.`);
      await mongoose.disconnect();
      process.exit(0);
    }

    voter.role = "admin";
    await voter.save();

    console.log(`[BlockVote Admin Setup] SUCCESS: Account "${adminEmail}" (${voter.fullName}) has been promoted to administrator.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[BlockVote Admin Setup] An error occurred:", error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
    process.exit(1);
  }
}

promoteAdmin();
