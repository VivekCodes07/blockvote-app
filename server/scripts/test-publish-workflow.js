const path = require("path");
const dns = require("dns");
dns.setServers(["1.1.1.1", "1.0.0.1"]);
const http = require("http");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const Voter = require("../models/Voter");

const authRoutes = require("../routes/auth");
const electionRoutes = require("../routes/elections");

async function runPublishWorkflowTest() {
  console.log("=== Testing Publish Election Workflow ===");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[Setup] Connected to Atlas.");

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/elections", electionRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5002, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:5002";

  // Create temporary test admin & voter
  const timestamp = Date.now();
  const testAdmin = await Voter.create({
    fullName: "Temp Admin",
    email: `tmpadmin_${timestamp}@college.edu`,
    password: "hashedpassword",
    role: "admin",
  });
  const adminToken = jwt.sign(
    { id: testAdmin._id, email: testAdmin.email, fullName: testAdmin.fullName, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const testVoter = await Voter.create({
    fullName: "Temp Voter",
    email: `tmpvoter_${timestamp}@college.edu`,
    password: "hashedpassword",
    role: "voter",
  });
  const voterToken = jwt.sign(
    { id: testVoter._id, email: testVoter.email, fullName: testVoter.fullName, role: "voter" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  let tempElection = null;
  let tempCandidate = null;

  try {
    // 1. Create a draft election with future dates
    const now = Date.now();
    tempElection = await Election.create({
      title: `Publish Test Draft (${timestamp})`,
      description: "Testing publish requirements",
      startDate: new Date(now + 86400000), // Tomorrow
      endDate: new Date(now + 172800000), // 2 days from now
      isDraft: true,
    });
    console.log("[Step 1] Draft election created:", tempElection.title, "Status:", tempElection.getDerivedStatus());

    // 2. Attempt publish without candidates -> should fail with 400
    console.log("[Step 2] Attempting to publish draft with 0 candidates...");
    const resNoCand = await fetch(`${baseUrl}/api/elections/${tempElection._id}/publish`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataNoCand = await resNoCand.json();
    console.log("Status:", resNoCand.status, "Message:", dataNoCand.message);
    if (resNoCand.status !== 400 || dataNoCand.success) {
      throw new Error("FAIL: Expected 400 for publishing without candidates!");
    }
    console.log("PASS: 0-candidate publish rejected.");

    // 3. Add a candidate
    tempCandidate = await Candidate.create({
      name: "Test Candidate",
      party: "Test Party",
      electionId: tempElection._id,
    });
    console.log("[Step 3] Nominated candidate for election.");

    // 4. Attempt publish with ordinary voter token -> should fail with 403
    console.log("[Step 4] Attempting publish with voter token...");
    const resVoter = await fetch(`${baseUrl}/api/elections/${tempElection._id}/publish`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    console.log("Status:", resVoter.status);
    if (resVoter.status !== 403) {
      throw new Error(`FAIL: Expected 403 Forbidden for voter publish, got ${resVoter.status}`);
    }
    console.log("PASS: Non-admin rejected with 403.");

    // 5. Publish as admin -> should succeed and derive Scheduled status
    console.log("[Step 5] Publishing as admin...");
    const resAdmin = await fetch(`${baseUrl}/api/elections/${tempElection._id}/publish`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataAdmin = await resAdmin.json();
    console.log("Status:", resAdmin.status, "Response:", dataAdmin);
    if (resAdmin.status !== 200 || !dataAdmin.success) {
      throw new Error("FAIL: Admin publish failed!");
    }
    if (dataAdmin.election.status !== "Scheduled") {
      throw new Error(`FAIL: Expected status 'Scheduled', got '${dataAdmin.election.status}'`);
    }
    if (dataAdmin.election.isDraft !== false) {
      throw new Error("FAIL: isDraft should be false!");
    }
    console.log("PASS: Election published and derived 'Scheduled' status correctly!");

    // 6. Verify already-published election cannot be published again
    console.log("[Step 6] Attempting to re-publish already published election...");
    const resRePub = await fetch(`${baseUrl}/api/elections/${tempElection._id}/publish`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log("Status:", resRePub.status);
    if (resRePub.status !== 400) {
      throw new Error("FAIL: Expected 400 when republishing an already published election.");
    }
    console.log("PASS: Re-publish rejected.");

    // 7. Test PUT /api/elections/:id update endpoint preserves validation
    console.log("[Step 7] Testing PUT /:id updates...");
    const resPut = await fetch(`${baseUrl}/api/elections/${tempElection._id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        description: "Updated description via PUT",
      }),
    });
    const dataPut = await resPut.json();
    console.log("Status:", resPut.status, "Updated description:", dataPut.election.description);
    if (resPut.status !== 200 || dataPut.election.description !== "Updated description via PUT") {
      throw new Error("FAIL: PUT update failed!");
    }
    console.log("PASS: PUT update works cleanly.");

    console.log("\nALL PUBLISH WORKFLOW TESTS PASSED!");
  } finally {
    console.log("[Cleanup] Cleaning up temporary test records...");
    if (tempCandidate) await Candidate.deleteOne({ _id: tempCandidate._id });
    if (tempElection) await Election.deleteOne({ _id: tempElection._id });
    await Voter.deleteMany({ _id: { $in: [testAdmin._id, testVoter._id] } });
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    console.log("[Cleanup] Complete and disconnected.");
  }
}

runPublishWorkflowTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
