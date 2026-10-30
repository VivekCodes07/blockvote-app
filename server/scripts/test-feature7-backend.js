const path = require("path");
const dns = require("dns");
const mongoose = require("mongoose");
const http = require("http");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// DNS fallback
const rawDns = process.env.DNS_SERVERS;
if (rawDns && ["system", "none", "false"].includes(rawDns.trim().toLowerCase())) {
} else {
  const dnsServers = rawDns
    ? rawDns.split(",").map((s) => s.trim()).filter(Boolean)
    : ["1.1.1.1", "1.0.0.1"];
  if (dnsServers.length > 0) {
    try {
      dns.setServers(dnsServers);
    } catch {}
  }
}

const Voter = require("../models/Voter");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const Participation = require("../models/Participation");
const Ballot = require("../models/Ballot");

const authRoutes = require("../routes/auth");
const electionRoutes = require("../routes/elections");
const voteRoutes = require("../routes/votes");

async function runFeature7Tests() {
  console.log("=== Feature 7: One Vote Per Election — Verification Suite ===");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI missing!");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("[Setup] Connected to MongoDB Atlas.");

  // Ensure Participation indexes are created
  await Participation.init();
  console.log("[Setup] Participation indexes initialized.");

  // Create test express app
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/elections", electionRoutes);
  app.use("/api/votes", voteRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5001, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:5001";
  console.log("[Setup] Test server listening on http://127.0.0.1:5001");

  const timestamp = Date.now();
  const voter1Email = `voter1_${timestamp}@college.edu`;
  const voter2Email = `voter2_${timestamp}@college.edu`;
  const adminEmail = `admin_${timestamp}@college.edu`;
  const testPassword = "Password123!";

  let voter1Token = null;
  let voter2Token = null;
  let adminToken = null;
  let voter1Id = null;
  let voter2Id = null;
  let adminId = null;

  let activeElection1 = null;
  let activeElection2 = null;
  let scheduledElection = null;
  let completedElection = null;
  let draftElection = null;

  let candidate1A = null;
  let candidate1B = null;
  let candidate2A = null;

  try {
    // 1. Setup Users
    console.log("\n--- Setting up test voters and admin ---");
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(testPassword, salt);

    const v1 = await Voter.create({
      fullName: "Voter One",
      email: voter1Email,
      password: hash,
      role: "voter",
    });
    voter1Id = v1._id;
    voter1Token = jwt.sign(
      { id: v1._id, email: v1.email, fullName: v1.fullName, role: "voter" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    const v2 = await Voter.create({
      fullName: "Voter Two",
      email: voter2Email,
      password: hash,
      role: "voter",
    });
    voter2Id = v2._id;
    voter2Token = jwt.sign(
      { id: v2._id, email: v2.email, fullName: v2.fullName, role: "voter" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    const adm = await Voter.create({
      fullName: "Admin Officer",
      email: adminEmail,
      password: hash,
      role: "admin",
    });
    adminId = adm._id;
    adminToken = jwt.sign(
      { id: adm._id, email: adm.email, fullName: adm.fullName, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    console.log("Voters & Admin created successfully.");

    // 2. Setup Elections
    console.log("\n--- Setting up test elections ---");
    const now = Date.now();

    activeElection1 = await Election.create({
      title: `Active Election 1 (${timestamp})`,
      description: "First active election for presidential voting.",
      startDate: new Date(now - 3600000), // 1 hour ago
      endDate: new Date(now + 86400000), // 24 hours from now
      isDraft: false,
    });

    activeElection2 = await Election.create({
      title: `Active Election 2 (${timestamp})`,
      description: "Second active election for council representatives.",
      startDate: new Date(now - 3600000),
      endDate: new Date(now + 86400000),
      isDraft: false,
    });

    scheduledElection = await Election.create({
      title: `Scheduled Election (${timestamp})`,
      description: "Scheduled election in the future.",
      startDate: new Date(now + 86400000), // Tomorrow
      endDate: new Date(now + 172800000),
      isDraft: false,
    });

    completedElection = await Election.create({
      title: `Completed Election (${timestamp})`,
      description: "Election in the past.",
      startDate: new Date(now - 172800000), // 2 days ago
      endDate: new Date(now - 86400000), // 1 day ago
      isDraft: false,
    });

    draftElection = await Election.create({
      title: `Draft Election (${timestamp})`,
      description: "Unpublished draft election.",
      startDate: new Date(now - 3600000),
      endDate: new Date(now + 86400000),
      isDraft: true,
    });

    candidate1A = await Candidate.create({
      name: "Alice Johnson",
      party: "Progressive Student Coalition",
      electionId: activeElection1._id,
    });

    candidate1B = await Candidate.create({
      name: "Bob Smith",
      party: "Campus Innovation Party",
      electionId: activeElection1._id,
    });

    candidate2A = await Candidate.create({
      name: "Charlie Brown",
      party: "Independent Voice",
      electionId: activeElection2._id,
    });

    console.log("Test elections and candidates created.");

    // Test 1: Valid vote accepted
    console.log("\n[Test 1] Valid voter casts vote in Active Election 1");
    const res1 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter1Token}`,
      },
      body: JSON.stringify({
        electionId: activeElection1._id.toString(),
        candidateId: candidate1A._id.toString(),
      }),
    });
    const data1 = await res1.json();
    console.log("Status:", res1.status, "Response:", data1);
    if (res1.status !== 201 || !data1.success) {
      throw new Error(`FAIL Test 1: Expected 201, got ${res1.status}`);
    }
    console.log("PASS: Valid vote recorded with 201.");

    // Verify participation record exists
    const part1 = await Participation.findOne({
      voterId: voter1Id,
      electionId: activeElection1._id,
    });
    if (!part1) throw new Error("FAIL Test 1: Participation record was not created!");

    // Verify ballot record exists and does NOT contain voterId
    const ballot1 = await Ballot.findOne({
      electionId: activeElection1._id,
      candidateId: candidate1A._id,
    });
    if (!ballot1) throw new Error("FAIL Test 1: Ballot record was not created!");
    if (ballot1.voterId) throw new Error("FAIL Test 1: Ballot contains voterId!");

    // Verify voteCounts
    const el1 = await Election.findById(activeElection1._id);
    const cand1A = await Candidate.findById(candidate1A._id);
    if (el1.voteCount !== 1 || cand1A.voteCount !== 1) {
      throw new Error(`FAIL Test 1: Counts not updated! Election: ${el1.voteCount}, Candidate: ${cand1A.voteCount}`);
    }
    console.log("PASS: Counts correctly updated (Election=1, Candidate=1).");

    // Test 2: Same voter attempts to vote twice in the same election
    console.log("\n[Test 2] Same voter attempts duplicate vote in Election 1");
    const res2 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter1Token}`,
      },
      body: JSON.stringify({
        electionId: activeElection1._id.toString(),
        candidateId: candidate1B._id.toString(),
      }),
    });
    const data2 = await res2.json();
    console.log("Status:", res2.status, "Message:", data2.message);
    if (res2.status !== 409) {
      throw new Error(`FAIL Test 2: Expected 409 Conflict, got ${res2.status}`);
    }
    console.log("PASS: Duplicate vote rejected with 409 Conflict.");

    // Test 3: Same voter can vote in a DIFFERENT active election
    console.log("\n[Test 3] Same voter casts vote in a different Active Election 2");
    const res3 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter1Token}`,
      },
      body: JSON.stringify({
        electionId: activeElection2._id.toString(),
        candidateId: candidate2A._id.toString(),
      }),
    });
    const data3 = await res3.json();
    console.log("Status:", res3.status, "Response:", data3);
    if (res3.status !== 201) {
      throw new Error(`FAIL Test 3: Expected 201, got ${res3.status}`);
    }
    console.log("PASS: Voter successfully voted in Election 2.");

    // Test 4: Unauthenticated user attempts to vote
    console.log("\n[Test 4] Unauthenticated request to /api/votes");
    const res4 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        electionId: activeElection1._id.toString(),
        candidateId: candidate1B._id.toString(),
      }),
    });
    console.log("Status:", res4.status);
    if (res4.status !== 401) {
      throw new Error(`FAIL Test 4: Expected 401, got ${res4.status}`);
    }
    console.log("PASS: Unauthenticated vote rejected with 401.");

    // Test 5: Admin attempts to vote
    console.log("\n[Test 5] Administrator attempts to vote");
    const res5 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        electionId: activeElection1._id.toString(),
        candidateId: candidate1B._id.toString(),
      }),
    });
    const data5 = await res5.json();
    console.log("Status:", res5.status, "Message:", data5.message);
    if (res5.status !== 403) {
      throw new Error(`FAIL Test 5: Expected 403 Forbidden, got ${res5.status}`);
    }
    console.log("PASS: Admin vote rejected with 403 Forbidden.");

    // Test 6: Nonexistent election ID
    console.log("\n[Test 6] Nonexistent election ID");
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res6 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter2Token}`,
      },
      body: JSON.stringify({
        electionId: fakeId,
        candidateId: candidate1A._id.toString(),
      }),
    });
    console.log("Status:", res6.status);
    if (res6.status !== 404) {
      throw new Error(`FAIL Test 6: Expected 404, got ${res6.status}`);
    }
    console.log("PASS: Nonexistent election rejected with 404.");

    // Test 7: Nonexistent candidate ID
    console.log("\n[Test 7] Nonexistent candidate ID");
    const res7 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter2Token}`,
      },
      body: JSON.stringify({
        electionId: activeElection1._id.toString(),
        candidateId: fakeId,
      }),
    });
    console.log("Status:", res7.status);
    if (res7.status !== 400) {
      throw new Error(`FAIL Test 7: Expected 400, got ${res7.status}`);
    }
    console.log("PASS: Nonexistent candidate rejected with 400.");

    // Test 8: Candidate belonging to another election
    console.log("\n[Test 8] Candidate belonging to Election 2 submitted for Election 1");
    const res8 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter2Token}`,
      },
      body: JSON.stringify({
        electionId: activeElection1._id.toString(),
        candidateId: candidate2A._id.toString(), // Candidate 2A belongs to Election 2
      }),
    });
    const data8 = await res8.json();
    console.log("Status:", res8.status, "Message:", data8.message);
    if (res8.status !== 400) {
      throw new Error(`FAIL Test 8: Expected 400, got ${res8.status}`);
    }
    console.log("PASS: Mismatched candidate rejected with 400.");

    // Test 9: Draft election
    console.log("\n[Test 9] Voting in Draft election");
    const res9 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter2Token}`,
      },
      body: JSON.stringify({
        electionId: draftElection._id.toString(),
        candidateId: candidate1A._id.toString(),
      }),
    });
    console.log("Status:", res9.status);
    if (res9.status !== 400) {
      throw new Error(`FAIL Test 9: Expected 400, got ${res9.status}`);
    }
    console.log("PASS: Draft election vote rejected with 400.");

    // Test 10: Scheduled election
    console.log("\n[Test 10] Voting in Scheduled election");
    const res10 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter2Token}`,
      },
      body: JSON.stringify({
        electionId: scheduledElection._id.toString(),
        candidateId: candidate1A._id.toString(),
      }),
    });
    console.log("Status:", res10.status);
    if (res10.status !== 400) {
      throw new Error(`FAIL Test 10: Expected 400, got ${res10.status}`);
    }
    console.log("PASS: Scheduled election vote rejected with 400.");

    // Test 11: Completed election
    console.log("\n[Test 11] Voting in Completed election");
    const res11 = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voter2Token}`,
      },
      body: JSON.stringify({
        electionId: completedElection._id.toString(),
        candidateId: candidate1A._id.toString(),
      }),
    });
    console.log("Status:", res11.status);
    if (res11.status !== 400) {
      throw new Error(`FAIL Test 11: Expected 400, got ${res11.status}`);
    }
    console.log("PASS: Completed election vote rejected with 400.");

    // Test 12: Concurrent duplicate voting requests (voter2 concurrently votes 5 times in Election 1)
    console.log("\n[Test 12] Concurrent duplicate voting requests for Voter 2");
    const concurrentRequests = Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/api/votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${voter2Token}`,
        },
        body: JSON.stringify({
          electionId: activeElection1._id.toString(),
          candidateId: candidate1B._id.toString(),
        }),
      }).then((r) => r.status)
    );

    const statuses = await Promise.all(concurrentRequests);
    console.log("Concurrent request statuses:", statuses);
    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    console.log(`Accepted: ${successCount}, Rejected (409): ${conflictCount}`);
    if (successCount !== 1) {
      throw new Error(`FAIL Test 12: Expected exactly 1 accepted vote, got ${successCount}!`);
    }
    if (conflictCount !== 4) {
      throw new Error(`FAIL Test 12: Expected 4 conflicts, got ${conflictCount}`);
    }
    console.log("PASS: Concurrency test passed with exactly 1 accepted vote.");

    // Test 13: Vote counts remain consistent
    console.log("\n[Test 13] Verifying election and candidate vote count consistency");
    const finalElection1 = await Election.findById(activeElection1._id);
    const finalCand1A = await Candidate.findById(candidate1A._id);
    const finalCand1B = await Candidate.findById(candidate1B._id);
    const ballotsElection1 = await Ballot.countDocuments({ electionId: activeElection1._id });
    const participationsElection1 = await Participation.countDocuments({ electionId: activeElection1._id });

    console.log("Election 1 voteCount:", finalElection1.voteCount);
    console.log("Candidate 1A voteCount:", finalCand1A.voteCount);
    console.log("Candidate 1B voteCount:", finalCand1B.voteCount);
    console.log("Total ballots in DB:", ballotsElection1);
    console.log("Total participations in DB:", participationsElection1);

    if (
      finalElection1.voteCount !== 2 ||
      finalCand1A.voteCount !== 1 ||
      finalCand1B.voteCount !== 1 ||
      ballotsElection1 !== 2 ||
      participationsElection1 !== 2
    ) {
      throw new Error("FAIL Test 13: Inconsistent vote counts across documents!");
    }
    console.log("PASS: Vote counts and ballot counts are 100% consistent.");

    // Test 14: Participation status endpoint
    console.log("\n[Test 14] Participation status endpoint check");
    const statusResV1 = await fetch(`${baseUrl}/api/votes/status/${activeElection1._id}`, {
      headers: { Authorization: `Bearer ${voter1Token}` },
    });
    const statusDataV1 = await statusResV1.json();
    console.log("Voter 1 status for Election 1:", statusDataV1);
    if (!statusDataV1.hasVoted) throw new Error("FAIL Test 14: Voter 1 should have hasVoted=true");

    const statusResV1E3 = await fetch(`${baseUrl}/api/votes/status/${scheduledElection._id}`, {
      headers: { Authorization: `Bearer ${voter1Token}` },
    });
    const statusDataV1E3 = await statusResV1E3.json();
    console.log("Voter 1 status for Scheduled Election:", statusDataV1E3);
    if (statusDataV1E3.hasVoted) throw new Error("FAIL Test 14: Voter 1 should have hasVoted=false for scheduled election");

    const myPartsRes = await fetch(`${baseUrl}/api/votes/my-participations`, {
      headers: { Authorization: `Bearer ${voter1Token}` },
    });
    const myPartsData = await myPartsRes.json();
    console.log("Voter 1 participated election IDs:", myPartsData.participatedElectionIds);
    if (
      !myPartsData.participatedElectionIds.includes(activeElection1._id.toString()) ||
      !myPartsData.participatedElectionIds.includes(activeElection2._id.toString())
    ) {
      throw new Error("FAIL Test 14: my-participations missing expected election IDs");
    }
    console.log("PASS: Participation status endpoints functioning correctly.");

    // Test 15: Existing admin and deletion protections
    console.log("\n[Test 15] Deletion and unsafe edits protection on election with votes");
    // Attempt to delete election with votes
    const delElRes = await fetch(`${baseUrl}/api/elections/${activeElection1._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log("Delete election status:", delElRes.status);
    if (delElRes.status !== 400) {
      throw new Error(`FAIL Test 15: Expected 400 on deleting election with votes, got ${delElRes.status}`);
    }

    // Attempt to remove candidate with votes
    const delCandRes = await fetch(`${baseUrl}/api/elections/${activeElection1._id}/candidates/${candidate1A._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log("Delete candidate status:", delCandRes.status);
    if (delCandRes.status !== 400) {
      throw new Error(`FAIL Test 15: Expected 400 on deleting candidate with votes, got ${delCandRes.status}`);
    }

    // Attempt to revert election to draft
    const editDraftRes = await fetch(`${baseUrl}/api/elections/${activeElection1._id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ isDraft: true }),
    });
    console.log("Revert to draft status:", editDraftRes.status);
    if (editDraftRes.status !== 400) {
      throw new Error(`FAIL Test 15: Expected 400 on reverting election with votes to draft, got ${editDraftRes.status}`);
    }

    // Attempt to rename candidate after votes
    const editCandRes = await fetch(`${baseUrl}/api/elections/${activeElection1._id}/candidates/${candidate1A._id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: "Renamed Alice" }),
    });
    console.log("Rename candidate status:", editCandRes.status);
    if (editCandRes.status !== 400) {
      throw new Error(`FAIL Test 15: Expected 400 on renaming candidate with votes, got ${editCandRes.status}`);
    }
    console.log("PASS: All deletion and unsafe edit protections intact!");

    console.log("\n ALL 15 BACKEND TESTS COMPLETED SUCCESSFULLY!");
  } finally {
    // Clean up test data
    console.log("\n--- Cleaning up test records ---");
    const testElectionIds = [
      activeElection1?._id,
      activeElection2?._id,
      scheduledElection?._id,
      completedElection?._id,
      draftElection?._id,
    ].filter(Boolean);

    await Ballot.deleteMany({ electionId: { $in: testElectionIds } });
    await Participation.deleteMany({ electionId: { $in: testElectionIds } });
    await Candidate.deleteMany({ electionId: { $in: testElectionIds } });
    await Election.deleteMany({ _id: { $in: testElectionIds } });
    await Voter.deleteMany({ _id: { $in: [voter1Id, voter2Id, adminId].filter(Boolean) } });

    console.log("Test records cleaned up.");
    server.close();
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB Atlas.");
  }
}

runFeature7Tests().catch((err) => {
  console.error("\nTEST SUITE FAILED:", err);
  process.exit(1);
});
