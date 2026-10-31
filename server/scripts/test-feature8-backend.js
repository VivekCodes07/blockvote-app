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

async function runFeature8Tests() {
  console.log("=== Feature 8: Election Results & Post-Election Analytics Verification ===");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI missing!");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("[Setup] Connected to MongoDB Atlas.");

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/elections", electionRoutes);
  app.use("/api/votes", voteRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5003, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:5003";
  console.log("[Setup] Ephemeral test server running at", baseUrl);

  const testRecordIds = {
    voters: [],
    elections: [],
    candidates: [],
    participations: [],
    ballots: [],
  };

  try {
    const timestamp = Date.now();
    const hashedPassword = await bcrypt.hash("Password123!", 10);

    // Create test admin
    const testAdmin = await Voter.create({
      fullName: `F8 Admin ${timestamp}`,
      email: `f8admin_${timestamp}@college.edu`,
      password: hashedPassword,
      role: "admin",
    });
    testRecordIds.voters.push(testAdmin._id);
    const adminToken = jwt.sign(
      { id: testAdmin._id, email: testAdmin.email, fullName: testAdmin.fullName, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Create test voter
    const testVoter = await Voter.create({
      fullName: `F8 Voter ${timestamp}`,
      email: `f8voter_${timestamp}@college.edu`,
      password: hashedPassword,
      role: "voter",
    });
    testRecordIds.voters.push(testVoter._id);
    const voterToken = jwt.sign(
      { id: testVoter._id, email: testVoter.email, fullName: testVoter.fullName, role: "voter" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Create a 2nd voter for multi-vote tests
    const testVoter2 = await Voter.create({
      fullName: `F8 Voter2 ${timestamp}`,
      email: `f8voter2_${timestamp}@college.edu`,
      password: hashedPassword,
      role: "voter",
    });
    testRecordIds.voters.push(testVoter2._id);
    const voter2Token = jwt.sign(
      { id: testVoter2._id, email: testVoter2.email, fullName: testVoter2.fullName, role: "voter" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log("[Setup] Test accounts initialized.");

    // Helper to create candidates
    async function createTestCandidate(electionId, name, party, voteCount = 0) {
      const c = await Candidate.create({
        name,
        party,
        biography: `Biography for ${name}`,
        electionId,
        voteCount,
      });
      testRecordIds.candidates.push(c._id);
      return c;
    }

    // --- TEST 1: Results are unavailable for Draft elections ---
    console.log("\n[Test 1] Verifying results are unavailable for Draft elections...");
    const draftElection = await Election.create({
      title: `Draft Election ${timestamp}`,
      description: "Draft election description",
      startDate: new Date(Date.now() + 86400000),
      endDate: new Date(Date.now() + 172800000),
      isDraft: true,
      voteCount: 0,
    });
    testRecordIds.elections.push(draftElection._id);
    await createTestCandidate(draftElection._id, "Draft Cand A", "Party X");

    const draftRes = await fetch(`${baseUrl}/api/elections/${draftElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const draftData = await draftRes.json();
    console.log("Draft election results response status:", draftRes.status);
    if (draftRes.status !== 403 || draftData.success !== false) {
      throw new Error(`FAIL Test 1: Expected 403 for Draft election, got ${draftRes.status}`);
    }
    console.log("PASS Test 1: Results correctly rejected with 403 for Draft elections.");

    // --- TEST 2: Results are unavailable for Scheduled elections ---
    console.log("\n[Test 2] Verifying results are unavailable for Scheduled elections...");
    const scheduledElection = await Election.create({
      title: `Scheduled Election ${timestamp}`,
      description: "Scheduled election description",
      startDate: new Date(Date.now() + 86400000), // starts in 1 day
      endDate: new Date(Date.now() + 172800000),   // ends in 2 days
      isDraft: false,
      voteCount: 0,
    });
    testRecordIds.elections.push(scheduledElection._id);
    await createTestCandidate(scheduledElection._id, "Scheduled Cand A", "Party Y");

    const schedRes = await fetch(`${baseUrl}/api/elections/${scheduledElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const schedData = await schedRes.json();
    console.log("Scheduled election results response status:", schedRes.status);
    if (schedRes.status !== 403 || schedData.success !== false) {
      throw new Error(`FAIL Test 2: Expected 403 for Scheduled election, got ${schedRes.status}`);
    }
    console.log("PASS Test 2: Results correctly rejected with 403 for Scheduled elections.");

    // --- TEST 3: Results are unavailable for Active elections ---
    console.log("\n[Test 3] Verifying results are unavailable for Active elections...");
    const activeElection = await Election.create({
      title: `Active Election ${timestamp}`,
      description: "Active election description",
      startDate: new Date(Date.now() - 3600000), // started 1 hour ago
      endDate: new Date(Date.now() + 86400000),  // ends in 1 day
      isDraft: false,
      voteCount: 0,
    });
    testRecordIds.elections.push(activeElection._id);
    await createTestCandidate(activeElection._id, "Active Cand A", "Party Z");

    const activeRes = await fetch(`${baseUrl}/api/elections/${activeElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const activeData = await activeRes.json();
    console.log("Active election results response status:", activeRes.status);
    if (activeRes.status !== 403 || activeData.success !== false) {
      throw new Error(`FAIL Test 3: Expected 403 for Active election, got ${activeRes.status}`);
    }
    console.log("PASS Test 3: Results correctly rejected with 403 for Active elections.");

    // --- TEST 4: Results become accessible after election completion ---
    console.log("\n[Test 4] Verifying results become accessible after election completion...");
    const completedElection = await Election.create({
      title: `Completed Election ${timestamp}`,
      description: "Completed election description",
      startDate: new Date(Date.now() - 7200000), // started 2 hours ago
      endDate: new Date(Date.now() - 3600000),   // ended 1 hour ago
      isDraft: false,
      voteCount: 0,
    });
    testRecordIds.elections.push(completedElection._id);
    const compCandA = await createTestCandidate(completedElection._id, "Alice Wonder", "Tech Party");
    const compCandB = await createTestCandidate(completedElection._id, "Bob Builder", "Design Party");

    const compRes = await fetch(`${baseUrl}/api/elections/${completedElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const compData = await compRes.json();
    console.log("Completed election results response status:", compRes.status);
    if (compRes.status !== 200 || !compData.success || compData.election.status !== "Completed") {
      throw new Error(`FAIL Test 4: Expected 200 and Completed status, got ${compRes.status}`);
    }
    console.log("PASS Test 4: Results accessible with 200 OK after completion.");

    // --- TEST 5, 6, 7, 8: Votes, percentages, candidate tally, and winner identification ---
    console.log("\n[Tests 5-8] Testing vote counts, percentages, and winner declaration...");
    // Simulate votes in completedElection: 3 votes total (Alice: 2, Bob: 1)
    const b1 = await Ballot.create({ electionId: completedElection._id, candidateId: compCandA._id });
    const b2 = await Ballot.create({ electionId: completedElection._id, candidateId: compCandA._id });
    const b3 = await Ballot.create({ electionId: completedElection._id, candidateId: compCandB._id });
    testRecordIds.ballots.push(b1._id, b2._id, b3._id);

    compCandA.voteCount = 2;
    await compCandA.save();
    compCandB.voteCount = 1;
    await compCandB.save();
    completedElection.voteCount = 3;
    await completedElection.save();

    const tallyRes = await fetch(`${baseUrl}/api/elections/${completedElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const tallyData = await tallyRes.json();

    // 5. Total votes
    console.log("Reported total votes:", tallyData.results.totalVotes);
    if (tallyData.results.totalVotes !== 3) {
      throw new Error(`FAIL Test 5: Expected 3 total votes, got ${tallyData.results.totalVotes}`);
    }
    console.log("PASS Test 5: Total votes verified (3).");

    // 6. Candidate vote counts
    const aliceResult = tallyData.results.candidates.find((c) => c.name === "Alice Wonder");
    const bobResult = tallyData.results.candidates.find((c) => c.name === "Bob Builder");
    console.log("Alice votes:", aliceResult?.voteCount, "Bob votes:", bobResult?.voteCount);
    if (!aliceResult || aliceResult.voteCount !== 2 || !bobResult || bobResult.voteCount !== 1) {
      throw new Error("FAIL Test 6: Candidate vote counts do not match expected tallies.");
    }
    console.log("PASS Test 6: Candidate vote counts verified (Alice: 2, Bob: 1).");

    // 7. Candidate percentages
    // Alice: 2/3 = 66.67%, Bob: 1/3 = 33.33%
    console.log("Alice %:", aliceResult.votePercentage, "Bob %:", bobResult.votePercentage);
    if (aliceResult.votePercentage !== 66.67 || bobResult.votePercentage !== 33.33) {
      throw new Error(`FAIL Test 7: Expected 66.67% and 33.33%, got ${aliceResult.votePercentage}% and ${bobResult.votePercentage}%`);
    }
    console.log("PASS Test 7: Candidate percentages calculated accurately.");

    // 8. Winning candidate identified
    console.log("Winner declared:", tallyData.results.winner?.name, "isTie:", tallyData.results.isTie);
    if (tallyData.results.isTie !== false || tallyData.results.winner?.name !== "Alice Wonder") {
      throw new Error("FAIL Test 8: Alice Wonder was not correctly identified as winner.");
    }
    if (!Array.isArray(tallyData.results.winners) || tallyData.results.winners.length !== 1) {
      throw new Error("FAIL Test 8: winners array did not contain exactly 1 winner.");
    }
    console.log("PASS Test 8: Winning candidate correctly identified (Alice Wonder, isTie: false).");

    // --- TEST 9: Tied results handling ---
    console.log("\n[Test 9] Testing tied results handling...");
    const tiedElection = await Election.create({
      title: `Tied Election ${timestamp}`,
      description: "Tied election description",
      startDate: new Date(Date.now() - 7200000),
      endDate: new Date(Date.now() - 3600000),
      isDraft: false,
      voteCount: 2,
    });
    testRecordIds.elections.push(tiedElection._id);
    const tieCandA = await createTestCandidate(tiedElection._id, "Tie Cand Alpha", "Alpha Party", 1);
    const tieCandB = await createTestCandidate(tiedElection._id, "Tie Cand Beta", "Beta Party", 1);

    const tb1 = await Ballot.create({ electionId: tiedElection._id, candidateId: tieCandA._id });
    const tb2 = await Ballot.create({ electionId: tiedElection._id, candidateId: tieCandB._id });
    testRecordIds.ballots.push(tb1._id, tb2._id);

    const tieRes = await fetch(`${baseUrl}/api/elections/${tiedElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const tieData = await tieRes.json();
    console.log("Tie test: isTie:", tieData.results.isTie, "winners length:", tieData.results.winners?.length);
    if (tieData.results.isTie !== true || tieData.results.winners?.length !== 2) {
      throw new Error(`FAIL Test 9: Expected isTie: true and 2 winners, got isTie: ${tieData.results.isTie}`);
    }
    console.log("PASS Test 9: Tied results correctly identified (isTie: true, 2 winners).");

    // --- TEST 10: Zero-vote election handling ---
    console.log("\n[Test 10] Testing zero-vote election handling...");
    const zeroVoteElection = await Election.create({
      title: `Zero Vote Election ${timestamp}`,
      description: "Zero vote election description",
      startDate: new Date(Date.now() - 7200000),
      endDate: new Date(Date.now() - 3600000),
      isDraft: false,
      voteCount: 0,
    });
    testRecordIds.elections.push(zeroVoteElection._id);
    const zCandA = await createTestCandidate(zeroVoteElection._id, "Zero Cand 1", "Party A", 0);
    const zCandB = await createTestCandidate(zeroVoteElection._id, "Zero Cand 2", "Party B", 0);

    const zeroRes = await fetch(`${baseUrl}/api/elections/${zeroVoteElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const zeroData = await zeroRes.json();
    console.log("Zero-vote test: totalVotes:", zeroData.results.totalVotes, "isTie:", zeroData.results.isTie);
    if (zeroRes.status !== 200 || zeroData.results.totalVotes !== 0) {
      throw new Error(`FAIL Test 10: Expected 200 with 0 votes, got status ${zeroRes.status}`);
    }
    for (const c of zeroData.results.candidates) {
      if (c.votePercentage !== 0 || isNaN(c.votePercentage)) {
        throw new Error(`FAIL Test 10: Division by zero produced NaN or invalid percentage: ${c.votePercentage}`);
      }
    }
    if (zeroData.results.winner !== null || zeroData.results.winners.length !== 0) {
      throw new Error("FAIL Test 10: Expected null winner for zero-vote election.");
    }
    console.log("PASS Test 10: Zero-vote election handled cleanly without division-by-zero.");

    // --- TEST 11: Unauthenticated requests are rejected ---
    console.log("\n[Test 11] Testing unauthenticated access rejection...");
    const unauthRes = await fetch(`${baseUrl}/api/elections/${completedElection._id}/results`);
    console.log("Unauthenticated response status:", unauthRes.status);
    if (unauthRes.status !== 401) {
      throw new Error(`FAIL Test 11: Expected 401 Unauthorized, got ${unauthRes.status}`);
    }
    console.log("PASS Test 11: Unauthenticated request rejected with 401.");

    // --- TEST 12: Voter and admin permissions handled correctly ---
    console.log("\n[Test 12] Testing voter and admin permissions...");
    // 12a. Voter can access completed election results
    const voterAccRes = await fetch(`${baseUrl}/api/elections/${completedElection._id}/results`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    if (voterAccRes.status !== 200) {
      throw new Error(`FAIL Test 12a: Voter was denied access to completed election results (status: ${voterAccRes.status})`);
    }

    // 12b. Admin can access completed election results
    const adminAccRes = await fetch(`${baseUrl}/api/elections/${completedElection._id}/results`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (adminAccRes.status !== 200) {
      throw new Error(`FAIL Test 12b: Admin was denied access to completed election results (status: ${adminAccRes.status})`);
    }

    // 12c. Admin CANNOT bypass restriction on active election
    const adminActiveRes = await fetch(`${baseUrl}/api/elections/${activeElection._id}/results`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (adminActiveRes.status !== 403) {
      throw new Error(`FAIL Test 12c: Admin bypassed active election results restriction! Status: ${adminActiveRes.status}`);
    }

    // 12d. Admin CANNOT bypass restriction on draft election
    const adminDraftRes = await fetch(`${baseUrl}/api/elections/${draftElection._id}/results`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (adminDraftRes.status !== 403) {
      throw new Error(`FAIL Test 12d: Admin bypassed draft election results restriction! Status: ${adminDraftRes.status}`);
    }
    console.log("PASS Test 12: Role permissions verified (both access completed; neither bypasses non-completed restriction).");

    // --- TEST 13: Privacy & Anonymity Verification ---
    console.log("\n[Test 13] Verifying no voter identity or candidate linkage is exposed...");
    // Verify response string has no voter IDs or names
    const resultsJson = JSON.stringify(tallyData);
    if (resultsJson.includes(testVoter._id.toString()) ||
        resultsJson.includes(testVoter.email) ||
        resultsJson.includes(testVoter.fullName)) {
      throw new Error("FAIL Test 13: Voter personal data leaked in results payload!");
    }
    // Verify that GET /api/elections/:id does NOT disclose candidate-wise votes when Active
    const activeDetailRes = await fetch(`${baseUrl}/api/elections/${activeElection._id}`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const activeDetailData = await activeDetailRes.json();
    for (const cand of activeDetailData.candidates) {
      if (cand.voteCount !== 0) {
        throw new Error(`FAIL Test 13: Live candidate vote count exposed in GET /api/elections/:id for Active election: ${cand.voteCount}`);
      }
    }
    console.log("PASS Test 13: Absolute voter anonymity and candidate tally confidentiality verified.");

    console.log("\n=======================================================");
    console.log("ALL 13 FEATURE 8 TESTS PASSED SUCCESSFULLY (100%)!");
    console.log("=======================================================");
  } finally {
    console.log("\n[Cleanup] Cleaning up isolated test records...");
    if (testRecordIds.ballots.length) {
      await Ballot.deleteMany({ _id: { $in: testRecordIds.ballots } });
    }
    if (testRecordIds.participations.length) {
      await Participation.deleteMany({ _id: { $in: testRecordIds.participations } });
    }
    if (testRecordIds.candidates.length) {
      await Candidate.deleteMany({ _id: { $in: testRecordIds.candidates } });
    }
    if (testRecordIds.elections.length) {
      await Election.deleteMany({ _id: { $in: testRecordIds.elections } });
    }
    if (testRecordIds.voters.length) {
      await Voter.deleteMany({ _id: { $in: testRecordIds.voters } });
    }
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    console.log("[Cleanup] Finished. Database restored cleanly.");
  }
}

runFeature8Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
