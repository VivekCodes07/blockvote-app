const crypto = require("crypto");
const AuditBlock = require("../models/AuditBlock");

const GENESIS_PREVIOUS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
const GENESIS_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

/**
 * Deterministically sort object keys for reproducible JSON serialization.
 */
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sorted[key] = sortObjectKeys(obj[key]);
    });
  return sorted;
}

/**
 * Format deterministic string for SHA-256 block hashing.
 */
function serializeBlockData({ index, timestamp, eventType, electionId, previousHash, metadata }) {
  const tsStr = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
  const elStr = electionId ? electionId.toString() : "";
  const sortedMeta = sortObjectKeys(metadata || {});
  const metaStr = JSON.stringify(sortedMeta);

  return `${index}|${tsStr}|${eventType}|${elStr}|${previousHash}|${metaStr}`;
}

/**
 * Calculate cryptographic SHA-256 hash of a block.
 */
function calculateBlockHash(blockData) {
  const serialized = serializeBlockData(blockData);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Ensure the immutable Genesis block (Index 0) exists in the database.
 */
async function ensureGenesisBlock(session = null) {
  const existingGenesis = await AuditBlock.findOne({ index: 0 }, null, { session });
  if (existingGenesis) {
    return existingGenesis;
  }

  const genesisData = {
    index: 0,
    timestamp: GENESIS_TIMESTAMP,
    eventType: "GENESIS",
    electionId: null,
    previousHash: GENESIS_PREVIOUS_HASH,
    metadata: {
      system: "BlockVote",
      description: "Genesis block initializing academic electoral audit ledger",
    },
  };
  genesisData.hash = calculateBlockHash(genesisData);

  try {
    const [genesisBlock] = await AuditBlock.create([genesisData], { session });
    return genesisBlock;
  } catch (err) {
    // If another concurrent request inserted genesis block, return it
    if (err.code === 11000) {
      return await AuditBlock.findOne({ index: 0 }, null, { session });
    }
    throw err;
  }
}

// In-process serialization queue for clean sequential appends within a single process
let appendQueue = Promise.resolve();
const MAX_APPEND_RETRIES = 5;

/**
 * Append an audit block to the ledger.
 * Connects cryptographically to the latest block's hash.
 * Safe across concurrent calls and multi-process deployments.
 */
async function appendAuditBlock({ eventType, electionId = null, metadata = {} }, session = null) {
  // If running within an existing MongoDB transaction session, execute immediately in session.
  // (Transactions handle conflict retries at the outer transaction loop)
  if (session) {
    return await executeAppend({ eventType, electionId, metadata }, session);
  }

  // Otherwise, sequence through in-process promise queue and handle cross-process unique collisions
  const appendTask = appendQueue.then(async () => {
    return await executeAppendWithRetry({ eventType, electionId, metadata });
  });

  appendQueue = appendTask.catch(() => {});
  return await appendTask;
}

/**
 * Execute append with retry for non-transaction calls under multi-process concurrency
 */
async function executeAppendWithRetry({ eventType, electionId, metadata }) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await executeAppend({ eventType, electionId, metadata }, null);
    } catch (err) {
      if (err.code === 11000 && attempt < MAX_APPEND_RETRIES) {
        const jitter = Math.floor(Math.random() * 40) + 10;
        await new Promise((resolve) => setTimeout(resolve, attempt * 50 + jitter));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Internal append worker
 */
async function executeAppend({ eventType, electionId, metadata }, session) {
  await ensureGenesisBlock(session);

  // Retrieve the latest block
  const latestBlock = await AuditBlock.findOne({}, null, { session }).sort({ index: -1 });
  if (!latestBlock) {
    throw new Error("Genesis block missing after initialization check");
  }

  const newIndex = latestBlock.index + 1;
  const previousHash = latestBlock.hash;
  const timestamp = new Date();

  const blockPayload = {
    index: newIndex,
    timestamp,
    eventType,
    electionId: electionId ? electionId : null,
    previousHash,
    metadata: metadata || {},
  };

  blockPayload.hash = calculateBlockHash(blockPayload);

  const [newBlock] = await AuditBlock.create([blockPayload], { session });
  return newBlock;
}

/**
 * Verify cryptographic integrity of the entire audit chain.
 * Read-only: never modifies or repairs corrupted records.
 *
 * Supports optional checkpoint verification and database cross-validation
 * to detect silent tail-block deletion.
 *
 * @param {Array|null} blocksInput - Array of blocks to verify, or null to query database
 * @param {Object} options - Verification options:
 *   - expectedBlockCount {number|null}: Expected total block count from checkpoint
 *   - expectedLatestHash {string|null}: Expected latest block hash from checkpoint
 *   - checkElectionVoteCounts {boolean}: Cross-validate VOTE_RECORDED blocks against Election voteCount (default: true)
 */
async function verifyAuditChain(blocksInput = null, options = {}) {
  const {
    expectedBlockCount = null,
    expectedLatestHash = null,
    checkElectionVoteCounts = true,
  } = options;

  const blocks = blocksInput || (await AuditBlock.find().sort({ index: 1 }));

  if (!blocks || blocks.length === 0) {
    if (expectedBlockCount && expectedBlockCount > 0) {
      return {
        isValid: false,
        totalBlocks: 0,
        reason: `Ledger is empty but expected ${expectedBlockCount} blocks from checkpoint. Possible total ledger deletion.`,
      };
    }
    return {
      isValid: true,
      totalBlocks: 0,
      message: "Ledger is empty. No blocks to verify.",
    };
  }

  // External Checkpoint Check: Expected Block Count (catches tail deletion)
  if (expectedBlockCount !== null && blocks.length !== expectedBlockCount) {
    return {
      isValid: false,
      totalBlocks: blocks.length,
      brokenBlockIndex: blocks.length,
      reason: `Tail deletion detected: checkpoint expected ${expectedBlockCount} blocks, but ledger contains ${blocks.length} blocks.`,
    };
  }

  // 1. Verify Genesis Block (Index 0)
  const genesis = blocks[0];
  if (genesis.index !== 0) {
    return {
      isValid: false,
      totalBlocks: blocks.length,
      brokenBlockIndex: genesis.index,
      reason: `First block has index ${genesis.index}, expected genesis index 0.`,
    };
  }

  if (genesis.previousHash !== GENESIS_PREVIOUS_HASH) {
    return {
      isValid: false,
      totalBlocks: blocks.length,
      brokenBlockIndex: 0,
      reason: `Genesis block previousHash is invalid. Expected "${GENESIS_PREVIOUS_HASH}", found "${genesis.previousHash}".`,
    };
  }

  const computedGenesisHash = calculateBlockHash(genesis);
  if (computedGenesisHash !== genesis.hash) {
    return {
      isValid: false,
      totalBlocks: blocks.length,
      brokenBlockIndex: 0,
      reason: `Genesis block content has been tampered with. Stored hash "${genesis.hash}" does not match recomputed hash "${computedGenesisHash}".`,
    };
  }

  // 2. Verify all subsequent blocks in sequence
  for (let i = 1; i < blocks.length; i++) {
    const current = blocks[i];
    const previous = blocks[i - 1];

    // Check sequential index
    if (current.index !== previous.index + 1) {
      return {
        isValid: false,
        totalBlocks: blocks.length,
        brokenBlockIndex: current.index,
        reason: `Sequential index violation at position ${i}. Expected index ${previous.index + 1}, found ${current.index}. Missing or injected blocks detected.`,
      };
    }

    // Check cryptographic previous-hash pointer
    if (current.previousHash !== previous.hash) {
      return {
        isValid: false,
        totalBlocks: blocks.length,
        brokenBlockIndex: current.index,
        reason: `Cryptographic link broken at block #${current.index}. previousHash "${current.previousHash.substring(0, 16)}..." does not match block #${previous.index} hash "${previous.hash.substring(0, 16)}...".`,
      };
    }

    // Check block content integrity (hash match)
    const computedHash = calculateBlockHash(current);
    if (computedHash !== current.hash) {
      return {
        isValid: false,
        totalBlocks: blocks.length,
        brokenBlockIndex: current.index,
        reason: `Data tampering detected at block #${current.index} (${current.eventType}). Stored hash "${current.hash.substring(0, 16)}..." does not match recomputed hash "${computedHash.substring(0, 16)}...".`,
      };
    }
  }

  const latestBlock = blocks[blocks.length - 1];

  // External Checkpoint Check: Expected Latest Hash (catches tail replacement / truncation)
  if (expectedLatestHash && latestBlock.hash !== expectedLatestHash) {
    return {
      isValid: false,
      totalBlocks: blocks.length,
      brokenBlockIndex: latestBlock.index,
      reason: `Tip hash mismatch: expected latest hash "${expectedLatestHash.substring(0, 16)}...", but found "${latestBlock.hash.substring(0, 16)}...". Possible tail alteration or truncation.`,
    };
  }

  // 3. Database Invariant Cross-Validation: Check vote counts against Election documents
  // If tail blocks containing votes were deleted, election.voteCount will exceed VOTE_RECORDED blocks!
  if (checkElectionVoteCounts && !blocksInput) {
    try {
      const Election = require("../models/Election");
      const elections = await Election.find({ voteCount: { $gt: 0 } }).select("_id title voteCount");
      for (const election of elections) {
        // Cross-check elections that are recorded in the audit ledger
        const hasAuditPresence = blocks.some(
          (b) => b.electionId && b.electionId.toString() === election._id.toString()
        );

        if (hasAuditPresence) {
          const voteBlockCount = blocks.filter(
            (b) =>
              b.eventType === "VOTE_RECORDED" &&
              b.electionId &&
              b.electionId.toString() === election._id.toString()
          ).length;

          if (voteBlockCount < election.voteCount) {
            return {
              isValid: false,
              totalBlocks: blocks.length,
              brokenBlockIndex: blocks.length - 1,
              reason: `Audit chain discrepancy: Election "${election.title}" records ${election.voteCount} votes, but only ${voteBlockCount} VOTE_RECORDED audit blocks exist in the ledger. Tail truncation or block deletion detected.`,
            };
          }
        }
      }
    } catch (dbErr) {
      console.warn("[Blockchain] Warning during election vote count cross-check:", dbErr.message);
    }
  }

  return {
    isValid: true,
    totalBlocks: blocks.length,
    latestBlockHash: latestBlock.hash,
    genesisHash: genesis.hash,
    message: "Blockchain audit trail is verified and intact. All cryptographic links and block hashes match.",
  };
}

module.exports = {
  calculateBlockHash,
  serializeBlockData,
  sortObjectKeys,
  ensureGenesisBlock,
  appendAuditBlock,
  verifyAuditChain,
  GENESIS_PREVIOUS_HASH,
  GENESIS_TIMESTAMP,
};
