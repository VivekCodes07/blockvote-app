const express = require("express");
const AuditBlock = require("../models/AuditBlock");
const { verifyAuditChain, ensureGenesisBlock } = require("../utils/blockchain");
const { verifyToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/audit/summary
 * Authenticated: Return high-level summary of the audit ledger
 * Accessible to all authenticated users (voters and administrators)
 */
router.get("/summary", verifyToken, async (req, res) => {
  try {
    await ensureGenesisBlock();

    const totalBlocks = await AuditBlock.countDocuments();
    const latestBlock = await AuditBlock.findOne().sort({ index: -1 });
    const genesisBlock = await AuditBlock.findOne({ index: 0 });

    return res.status(200).json({
      success: true,
      totalBlocks,
      latestBlock: latestBlock
        ? {
            index: latestBlock.index,
            hash: latestBlock.hash,
            timestamp: latestBlock.timestamp,
            eventType: latestBlock.eventType,
          }
        : null,
      genesisHash: genesisBlock ? genesisBlock.hash : null,
      status: "active",
    });
  } catch (error) {
    console.error("[Audit] GET /summary error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while retrieving audit summary.",
    });
  }
});

/**
 * GET /api/audit/verify
 * Administrator: Perform complete cryptographic chain verification
 * Verifies sequential indexing, previousHash linkages, and SHA-256 block hash integrity.
 */
router.get("/verify", verifyToken, requireAdmin, async (req, res) => {
  try {
    await ensureGenesisBlock();

    const expectedBlockCount = req.query.expectedCount
      ? parseInt(req.query.expectedCount, 10)
      : null;
    const expectedLatestHash = req.query.expectedHash || null;

    const verificationResult = await verifyAuditChain(null, {
      expectedBlockCount: isNaN(expectedBlockCount) ? null : expectedBlockCount,
      expectedLatestHash,
      checkElectionVoteCounts: true,
    });

    return res.status(200).json({
      success: true,
      verification: {
        ...verificationResult,
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Audit] GET /verify error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while verifying the blockchain audit trail.",
    });
  }
});

/**
 * GET /api/audit/chain
 * Administrator: Retrieve chronological or paginated audit blocks for inspection
 */
router.get("/chain", verifyToken, requireAdmin, async (req, res) => {
  try {
    await ensureGenesisBlock();

    let limit = parseInt(req.query.limit, 10) || 50;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    let page = parseInt(req.query.page, 10) || 1;
    if (page < 1) page = 1;

    const skip = (page - 1) * limit;

    const totalBlocks = await AuditBlock.countDocuments();
    const blocks = await AuditBlock.find()
      .sort({ index: -1 })
      .skip(skip)
      .limit(limit);

    const formattedBlocks = blocks.map((b) => ({
      id: b._id,
      index: b.index,
      timestamp: b.timestamp,
      eventType: b.eventType,
      electionId: b.electionId,
      previousHash: b.previousHash,
      hash: b.hash,
      metadata: b.metadata || {},
      createdAt: b.createdAt,
    }));

    return res.status(200).json({
      success: true,
      totalBlocks,
      page,
      limit,
      blocks: formattedBlocks,
    });
  } catch (error) {
    console.error("[Audit] GET /chain error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while retrieving the audit chain.",
    });
  }
});

module.exports = router;
