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
const AuditBlock = require("../models/AuditBlock");

const {
  calculateBlockHash,
  ensureGenesisBlock,
  appendAuditBlock,
  verifyAuditChain,
  GENESIS_PREVIOUS_HASH,
  GENESIS_TIMESTAMP,
} = require("../utils/blockchain");

const authRoutes = require("../routes/auth");
const electionRoutes = require("../routes/elections");
const voteRoutes = require("../routes/votes");
const auditRoutes = require("../routes/audit");

async function runFeature9Tests() {
  console.log("=== Feature 9: Blockchain Audit Trail & Tamper Verification Suite ===");
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
  app.use("/api/audit", auditRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(5004, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:5004";
  console.log("[Setup] Ephemeral test server running at", baseUrl);

  const testRecordIds = {
    voters: [],
    elections: [],
    candidates: [],
    participations: [],
    ballots: [],
    auditBlocks: [],
  };

  try {
    const timestamp = Date.now();
    const hashedPassword = await bcrypt.hash("Password123!", 10);

    // Create test admin
    const testAdmin = await Voter.create({
      fullName: `F9 Admin ${timestamp}`,
      email: `f9admin_${timestamp}@college.edu`,
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
      fullName: `F9 Voter ${timestamp}`,
      email: `f9voter_${timestamp}@college.edu`,
      password: hashedPassword,
      role: "voter",
    });
    testRecordIds.voters.push(testVoter._id);
    const voterToken = jwt.sign(
      { id: testVoter._id, email: testVoter.email, fullName: testVoter.fullName, role: "voter" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log("[Setup] Test accounts initialized.");

    // --- TEST 1: Genesis Block Creation & Persistence ---
    console.log("\n[Test 1] Testing Genesis Block initialization...");
    const genesisBlock = await ensureGenesisBlock();
    console.log("Genesis block index:", genesisBlock.index, "hash:", genesisBlock.hash.substring(0, 16) + "...");
    if (genesisBlock.index !== 0 || genesisBlock.previousHash !== GENESIS_PREVIOUS_HASH) {
      throw new Error("FAIL Test 1: Genesis block missing or previousHash invalid.");
    }
    console.log("PASS Test 1: Genesis block confirmed with index 0 and fixed previous hash.");

    // --- TEST 2: Deterministic Hash Generation ---
    console.log("\n[Test 2] Testing deterministic SHA-256 block hashing...");
    const samplePayload = {
      index: 1,
      timestamp: new Date("2026-01-01T12:00:00.000Z"),
      eventType: "TEST_EVENT",
      electionId: new mongoose.Types.ObjectId("6ae57c216c8865b1aca52e23"),
      previousHash: genesisBlock.hash,
      metadata: { action: "verified", count: 42, details: { nested: true } },
    };
    const hash1 = calculateBlockHash(samplePayload);
    // Reverse key order in metadata
    const samplePayloadReordered = {
      ...samplePayload,
      metadata: { details: { nested: true }, count: 42, action: "verified" },
    };
    const hash2 = calculateBlockHash(samplePayloadReordered);
    console.log("Hash 1:", hash1.substring(0, 16) + "...");
    console.log("Hash 2:", hash2.substring(0, 16) + "...");
    if (hash1 !== hash2 || hash1.length !== 64) {
      throw new Error("FAIL Test 2: Hash calculation is not deterministic or not 64-char hex!");
    }
    console.log("PASS Test 2: SHA-256 hash is deterministic and invariant to JSON key order.");

    // --- TEST 3 & 4: Sequential Block Creation & Previous-Hash Linking ---
    console.log("\n[Tests 3 & 4] Testing sequential block creation and cryptographic hash linkage...");
    const blockA = await appendAuditBlock({
      eventType: "TEST_EVENT_A",
      metadata: { step: 1, label: "Alpha" },
    });
    testRecordIds.auditBlocks.push(blockA._id);

    const blockB = await appendAuditBlock({
      eventType: "TEST_EVENT_B",
      metadata: { step: 2, label: "Beta" },
    });
    testRecordIds.auditBlocks.push(blockB._id);

    console.log(`Block A: Index ${blockA.index}, Hash: ${blockA.hash.substring(0, 12)}..., Prev: ${blockA.previousHash.substring(0, 12)}...`);
    console.log(`Block B: Index ${blockB.index}, Hash: ${blockB.hash.substring(0, 12)}..., Prev: ${blockB.previousHash.substring(0, 12)}...`);

    if (blockB.index !== blockA.index + 1) {
      throw new Error(`FAIL Test 3: Block B index (${blockB.index}) is not block A index + 1 (${blockA.index + 1})`);
    }
    if (blockB.previousHash !== blockA.hash) {
      throw new Error("FAIL Test 4: Block B previousHash does not match Block A hash!");
    }
    console.log("PASS Tests 3 & 4: Blocks are strictly sequential and cryptographically linked.");

    // --- TEST 5: Valid Chain Verification ---
    console.log("\n[Test 5] Testing valid chain verification...");
    const verifyResult = await verifyAuditChain();
    console.log("Chain verification status: isValid =", verifyResult.isValid, "totalBlocks =", verifyResult.totalBlocks);
    if (!verifyResult.isValid) {
      throw new Error(`FAIL Test 5: Real chain failed verification: ${verifyResult.reason}`);
    }
    console.log("PASS Test 5: Live audit chain verified valid.");

    // --- TEST 6, 7, 8: TAMPERING DEMONSTRATION ON ISOLATED TEST CHAIN ---
    console.log("\n[Tests 6-8] Testing tamper detection on isolated test blocks...");
    // Create an isolated sequence of 4 valid test blocks
    const tGen = {
      index: 0,
      timestamp: GENESIS_TIMESTAMP,
      eventType: "GENESIS",
      electionId: null,
      previousHash: GENESIS_PREVIOUS_HASH,
      metadata: { system: "TestChain" },
    };
    tGen.hash = calculateBlockHash(tGen);

    const t1 = {
      index: 1,
      timestamp: new Date("2026-02-01T10:00:00.000Z"),
      eventType: "ELECTION_CREATED",
      electionId: new mongoose.Types.ObjectId(),
      previousHash: tGen.hash,
      metadata: { title: "Original Election" },
    };
    t1.hash = calculateBlockHash(t1);

    const t2 = {
      index: 2,
      timestamp: new Date("2026-02-01T11:00:00.000Z"),
      eventType: "VOTE_RECORDED",
      electionId: t1.electionId,
      previousHash: t1.hash,
      metadata: { event: "VOTE_RECORDED" },
    };
    t2.hash = calculateBlockHash(t2);

    const t3 = {
      index: 3,
      timestamp: new Date("2026-02-01T12:00:00.000Z"),
      eventType: "ELECTION_COMPLETED",
      electionId: t1.electionId,
      previousHash: t2.hash,
      metadata: { totalVotes: 1 },
    };
    t3.hash = calculateBlockHash(t3);

    // Verify baseline test chain is valid
    const baselineVerify = await verifyAuditChain([tGen, t1, t2, t3]);
    if (!baselineVerify.isValid) {
      throw new Error("FAIL: Baseline test chain should be valid!");
    }
    console.log("Baseline isolated test chain verified valid (4 blocks).");

    // 6. Test Metadata Tampering
    console.log("Simulating unauthorized metadata tampering on block #1...");
    const tamperedBlock1 = {
      ...t1,
      metadata: { title: "HACKED Election Title!" }, // Tampered metadata without recomputing hash
    };
    const tamperResult1 = await verifyAuditChain([tGen, tamperedBlock1, t2, t3]);
    console.log("Tamper detection result: isValid =", tamperResult1.isValid, "brokenIndex =", tamperResult1.brokenBlockIndex);
    if (tamperResult1.isValid !== false || tamperResult1.brokenBlockIndex !== 1) {
      throw new Error("FAIL Test 6: Metadata tampering was not detected!");
    }
    console.log("PASS Test 6: Content tampering immediately detected via SHA-256 mismatch.");

    // 7. Test Broken Previous-Hash Reference
    console.log("Simulating broken previousHash link on block #2...");
    const tamperedBlock2 = {
      ...t2,
      previousHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    };
    // Recompute hash so content matches, but link is broken
    tamperedBlock2.hash = calculateBlockHash(tamperedBlock2);
    const tamperResult2 = await verifyAuditChain([tGen, t1, tamperedBlock2, t3]);
    console.log("Broken link result: isValid =", tamperResult2.isValid, "brokenIndex =", tamperResult2.brokenBlockIndex);
    if (tamperResult2.isValid !== false || tamperResult2.brokenBlockIndex !== 2) {
      throw new Error("FAIL Test 7: Broken previousHash was not detected!");
    }
    console.log("PASS Test 7: Broken cryptographic previous-hash pointer detected.");

    // 8. Test Missing/Deleted Block
    console.log("Simulating block deletion (block #2 omitted)...");
    const tamperResult3 = await verifyAuditChain([tGen, t1, t3]);
    console.log("Missing block result: isValid =", tamperResult3.isValid, "brokenIndex =", tamperResult3.brokenBlockIndex);
    if (tamperResult3.isValid !== false || tamperResult3.brokenBlockIndex !== 3) {
      throw new Error("FAIL Test 8: Missing block sequence jump was not detected!");
    }
    console.log("PASS Test 8: Missing block detected via sequential index check.");

    // --- TEST 9: Duplicate Block Prevention ---
    console.log("\n[Test 9] Testing duplicate block index prevention in MongoDB...");
    let duplicateRejected = false;
    try {
      await AuditBlock.create({
        index: blockA.index, // Same index as existing blockA
        timestamp: new Date(),
        eventType: "DUPLICATE_ATTEMPT",
        previousHash: blockA.previousHash,
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicateRejected = true;
      }
    }
    if (!duplicateRejected) {
      throw new Error("FAIL Test 9: Duplicate block index was not rejected by unique constraint!");
    }
    console.log("PASS Test 9: Duplicate block index rejected with code 11000.");

    // --- TEST 10 & 11: API Access & Role Permissions ---
    console.log("\n[Tests 10 & 11] Testing API access control and admin authorization...");
    // 10a. Unauthenticated access to /api/audit/chain
    const unauthChainRes = await fetch(`${baseUrl}/api/audit/chain`);
    if (unauthChainRes.status !== 401) {
      throw new Error(`FAIL Test 10: Expected 401 for unauthenticated /chain, got ${unauthChainRes.status}`);
    }

    // 10b. Unauthenticated access to /api/audit/verify
    const unauthVerifyRes = await fetch(`${baseUrl}/api/audit/verify`);
    if (unauthVerifyRes.status !== 401) {
      throw new Error(`FAIL Test 10: Expected 401 for unauthenticated /verify, got ${unauthVerifyRes.status}`);
    }
    console.log("PASS Test 10: Unauthenticated requests rejected with 401.");

    // 11a. Voter forbidden from /api/audit/chain
    const voterChainRes = await fetch(`${baseUrl}/api/audit/chain`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    if (voterChainRes.status !== 403) {
      throw new Error(`FAIL Test 11a: Expected 403 for voter /chain, got ${voterChainRes.status}`);
    }

    // 11b. Voter forbidden from /api/audit/verify
    const voterVerifyRes = await fetch(`${baseUrl}/api/audit/verify`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    if (voterVerifyRes.status !== 403) {
      throw new Error(`FAIL Test 11b: Expected 403 for voter /verify, got ${voterVerifyRes.status}`);
    }

    // 11c. Admin allowed on /api/audit/chain
    const adminChainRes = await fetch(`${baseUrl}/api/audit/chain`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const chainData = await adminChainRes.json();
    if (adminChainRes.status !== 200 || !chainData.success || !Array.isArray(chainData.blocks)) {
      throw new Error(`FAIL Test 11c: Admin denied access to /chain, status: ${adminChainRes.status}`);
    }

    // 11d. Admin allowed on /api/audit/verify
    const adminVerifyRes = await fetch(`${baseUrl}/api/audit/verify`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const verifyApiData = await adminVerifyRes.json();
    if (adminVerifyRes.status !== 200 || !verifyApiData.success || !verifyApiData.verification.isValid) {
      throw new Error(`FAIL Test 11d: Admin verify endpoint failed, status: ${adminVerifyRes.status}`);
    }

    // 11e. Both voter and admin can access /api/audit/summary
    const voterSummaryRes = await fetch(`${baseUrl}/api/audit/summary`, {
      headers: { Authorization: `Bearer ${voterToken}` },
    });
    const summaryData = await voterSummaryRes.json();
    if (voterSummaryRes.status !== 200 || !summaryData.success || typeof summaryData.totalBlocks !== "number") {
      throw new Error(`FAIL Test 11e: Voter could not access /summary, status: ${voterSummaryRes.status}`);
    }
    console.log("PASS Test 11: Role permissions verified (voters restricted from full ledger; both can access summary).");

    // --- TEST 12, 13, 14: Vote Audit Integration & Rollback Safety ---
    console.log("\n[Tests 12-14] Testing vote audit integration...");
    // Create an active election with a candidate
    const activeElection = await Election.create({
      title: `Audit Vote Election ${timestamp}`,
      description: "Testing audit integration during voting",
      startDate: new Date(Date.now() - 3600000), // started 1h ago
      endDate: new Date(Date.now() + 86400000),  // ends in 24h
      isDraft: false,
      voteCount: 0,
    });
    testRecordIds.elections.push(activeElection._id);

    const candA = await Candidate.create({
      name: "Candidate Alpha",
      party: "Audit Party",
      electionId: activeElection._id,
      voteCount: 0,
    });
    testRecordIds.candidates.push(candA._id);

    const blocksBeforeVote = await AuditBlock.countDocuments();

    // 12. Successful vote creates VOTE_RECORDED block
    const voteRes = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voterToken}`,
      },
      body: JSON.stringify({
        electionId: activeElection._id,
        candidateId: candA._id,
      }),
    });
    const voteData = await voteRes.json();
    if (voteRes.status !== 201 || !voteData.success) {
      throw new Error(`FAIL Test 12: Vote creation failed with status ${voteRes.status}`);
    }

    const blocksAfterVote = await AuditBlock.countDocuments();
    if (blocksAfterVote !== blocksBeforeVote + 1) {
      throw new Error(`FAIL Test 12: Expected ${blocksBeforeVote + 1} blocks after vote, found ${blocksAfterVote}`);
    }

    const latestVoteBlock = await AuditBlock.findOne().sort({ index: -1 });
    testRecordIds.auditBlocks.push(latestVoteBlock._id);

    if (latestVoteBlock.eventType !== "VOTE_RECORDED") {
      throw new Error(`FAIL Test 12: Latest block eventType is ${latestVoteBlock.eventType}, expected VOTE_RECORDED`);
    }
    console.log("PASS Test 12: Successful vote automatically appended VOTE_RECORDED block (#" + latestVoteBlock.index + ").");

    // 13. Failed vote does not create a block
    console.log("Testing that failed vote does not create an audit block...");
    const blocksBeforeFail = await AuditBlock.countDocuments();
    const badCandidateId = new mongoose.Types.ObjectId();
    const failVoteRes = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`, // Admin voting fails with 403
      },
      body: JSON.stringify({
        electionId: activeElection._id,
        candidateId: badCandidateId,
      }),
    });
    if (failVoteRes.status === 201) {
      throw new Error("FAIL Test 13: Admin vote was accepted unexpectedly!");
    }
    const blocksAfterFail = await AuditBlock.countDocuments();
    if (blocksAfterFail !== blocksBeforeFail) {
      throw new Error("FAIL Test 13: Failed vote created an audit block!");
    }
    console.log("PASS Test 13: Failed vote did not produce phantom audit block.");

    // 14. Duplicate vote does not create a block
    console.log("Testing that duplicate vote does not create an audit block...");
    const blocksBeforeDup = await AuditBlock.countDocuments();
    const dupVoteRes = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voterToken}`, // Voter already voted in activeElection
      },
      body: JSON.stringify({
        electionId: activeElection._id,
        candidateId: candA._id,
      }),
    });
    if (dupVoteRes.status !== 409) {
      throw new Error(`FAIL Test 14: Expected 409 for duplicate vote, got ${dupVoteRes.status}`);
    }
    const blocksAfterDup = await AuditBlock.countDocuments();
    if (blocksAfterDup !== blocksBeforeDup) {
      throw new Error("FAIL Test 14: Duplicate vote created an audit block!");
    }
    console.log("PASS Test 14: Duplicate vote attempt rejected with 409 and created zero audit entries.");

    // --- TEST 15: Voter Privacy & Anonymity in Audit Records ---
    console.log("\n[Test 15] Verifying no voter identity or candidate selection in audit blocks...");
    const allAuditBlocks = await AuditBlock.find();
    for (const b of allAuditBlocks) {
      const bStr = JSON.stringify(b);
      if (bStr.includes(testVoter._id.toString()) ||
          bStr.includes(testVoter.email) ||
          bStr.includes(testVoter.fullName)) {
        throw new Error(`FAIL Test 15: Block #${b.index} leaked voter personal identity!`);
      }
      if (b.eventType === "VOTE_RECORDED") {
        if (b.metadata?.candidateId || b.metadata?.candidateName || bStr.includes(candA._id.toString())) {
          throw new Error(`FAIL Test 15: VOTE_RECORDED block #${b.index} leaked candidate selection!`);
        }
      }
    }
    console.log("PASS Test 15: Voter privacy strictly preserved. Audit blocks contain zero voter PII or candidate picks.");

    // --- TEST 16: Final Chain Verification ---
    console.log("\n[Test 16] Verifying overall audit chain integrity...");
    const finalVerify = await verifyAuditChain();
    if (!finalVerify.isValid) {
      throw new Error(`FAIL Test 16: Final audit chain failed verification: ${finalVerify.reason}`);
    }
    console.log(`PASS Test 16: Final chain completely intact (${finalVerify.totalBlocks} total verified blocks).`);

    console.log("\n=======================================================");
    console.log("ALL 16 FEATURE 9 BACKEND TESTS PASSED SUCCESSFULLY (100%)!");
    console.log("=======================================================");
  } finally {
    console.log("\n[Cleanup] Cleaning up isolated test records...");
    if (testRecordIds.auditBlocks.length) {
      await AuditBlock.deleteMany({ _id: { $in: testRecordIds.auditBlocks } });
    }
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

runFeature9Tests().catch((err) => {
  console.error("Feature 9 Test execution failed:", err);
  process.exit(1);
});
