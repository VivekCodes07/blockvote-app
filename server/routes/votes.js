const express = require("express");
const mongoose = require("mongoose");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const Voter = require("../models/Voter");
const Participation = require("../models/Participation");
const Ballot = require("../models/Ballot");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// Helper to check valid MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Compensating write fallback strategy
 * Used if MongoDB transactions are unavailable (e.g. standalone test environments).
 * Handles partial failures with compensating rollbacks.
 */
async function executeCompensatingVote(res, voterId, electionId, candidateId) {
  let participationCreated = false;
  let ballotCreated = null;
  let electionIncremented = false;

  try {
    // 1. Create Participation record first (enforced by unique compound index)
    await Participation.create({ voterId, electionId });
    participationCreated = true;

    // 2. Create anonymous Ballot record (no voter ID)
    ballotCreated = await Ballot.create({ electionId, candidateId });

    // 3. Atomically increment election and candidate vote counts
    await Election.findByIdAndUpdate(electionId, { $inc: { voteCount: 1 } });
    electionIncremented = true;

    await Candidate.findByIdAndUpdate(candidateId, { $inc: { voteCount: 1 } });

    return res.status(201).json({
      success: true,
      message: "Your vote has been cast successfully.",
      electionId,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already voted in this election.",
      });
    }

    console.error("[Votes] Compensating rollback initiated due to error:", err.message);

    // Roll back in reverse order to maintain consistency
    if (electionIncremented) {
      await Election.findByIdAndUpdate(electionId, { $inc: { voteCount: -1 } }).catch(() => {});
    }
    if (ballotCreated) {
      await Ballot.findByIdAndDelete(ballotCreated._id).catch(() => {});
    }
    if (participationCreated) {
      await Participation.deleteOne({ voterId, electionId }).catch(() => {});
    }

    return res.status(500).json({
      success: false,
      message: "An error occurred while recording your vote. Partial writes were rolled back.",
    });
  }
}

// POST /api/votes (Cast an anonymous ballot with one-vote-per-election enforcement)
router.post("/", verifyToken, async (req, res) => {
  try {
    // Verify database connection readiness
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database service is currently unavailable. Please try again shortly.",
      });
    }

    // Live verification of voter role (admins cannot vote)
    const voter = await Voter.findById(req.user.id);
    if (!voter) {
      return res.status(401).json({
        success: false,
        message: "Authenticated voter account not found.",
      });
    }

    if (voter.role !== "voter") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Administrators are not permitted to cast votes.",
      });
    }

    const { electionId, candidateId } = req.body || {};

    // Validate MongoDB ObjectIds
    if (!electionId || !candidateId || !isValidObjectId(electionId) || !isValidObjectId(candidateId)) {
      return res.status(400).json({
        success: false,
        message: "Valid election ID and candidate ID are required.",
      });
    }

    // Verify election exists
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    // Reject votes on draft elections
    if (election.isDraft) {
      return res.status(400).json({
        success: false,
        message: "Votes cannot be cast in draft elections.",
      });
    }

    // Verify election is currently Active
    const derivedStatus = Election.deriveStatus(election);
    if (derivedStatus !== "Active") {
      return res.status(400).json({
        success: false,
        message: `Votes can only be cast in active elections. Current status: ${derivedStatus}.`,
      });
    }

    // Verify candidate exists and belongs to this election
    const candidate = await Candidate.findById(candidateId);
    if (!candidate || !candidate.electionId.equals(election._id)) {
      return res.status(400).json({
        success: false,
        message: "Selected candidate does not belong to this election.",
      });
    }

    // MongoDB Multi-Document Transaction with transient conflict retry
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let session = null;

      try {
        // Preliminary check for existing participation
        const existingParticipation = await Participation.findOne({
          voterId: voter._id,
          electionId: election._id,
        });
        if (existingParticipation) {
          return res.status(409).json({
            success: false,
            message: "You have already voted in this election.",
          });
        }

        session = await mongoose.startSession();
        session.startTransaction();

        // 1. Insert Participation record (unique index ensures concurrent requests cannot double-participate)
        await Participation.create(
          [{ voterId: voter._id, electionId: election._id }],
          { session }
        );

        // 2. Insert separate anonymous Ballot (no voter identifier stored)
        await Ballot.create(
          [{ electionId: election._id, candidateId: candidate._id }],
          { session }
        );

        // 3. Atomically increment election and candidate vote counts
        await Election.findByIdAndUpdate(
          election._id,
          { $inc: { voteCount: 1 } },
          { session }
        );
        await Candidate.findByIdAndUpdate(
          candidate._id,
          { $inc: { voteCount: 1 } },
          { session }
        );

        await session.commitTransaction();

        return res.status(201).json({
          success: true,
          message: "Your vote has been cast successfully.",
          electionId: election._id,
        });
      } catch (txError) {
        if (session) {
          try {
            await session.abortTransaction();
          } catch {}
        }

        // Handle duplicate participation caught by unique compound index
        if (txError.code === 11000) {
          return res.status(409).json({
            success: false,
            message: "You have already voted in this election.",
          });
        }

        // Check if cluster does not support transactions (fallback to compensating writes)
        if (
          txError.message &&
          (txError.message.includes("Transaction numbers are only allowed on a replica set") ||
            txError.message.includes("does not support multi-document transactions"))
        ) {
          return await executeCompensatingVote(res, voter._id, election._id, candidate._id);
        }

        // Handle transient write conflicts under high concurrency
        const isTransient =
          txError.code === 112 ||
          (txError.errorLabels && txError.errorLabels.includes("TransientTransactionError")) ||
          (txError.message && txError.message.includes("Please retry your operation"));

        if (isTransient && attempt < MAX_RETRIES) {
          // Brief exponential backoff allowing competing transaction to complete
          await new Promise((resolve) => setTimeout(resolve, 60 * attempt));
          continue;
        }

        // Post-conflict check if the winning concurrent transaction recorded this voter's participation
        const alreadyVoted = await Participation.findOne({
          voterId: voter._id,
          electionId: election._id,
        });
        if (alreadyVoted) {
          return res.status(409).json({
            success: false,
            message: "You have already voted in this election.",
          });
        }

        console.error("[Votes] Transaction execution error:", txError.message);
        return res.status(500).json({
          success: false,
          message: "An internal server error occurred while recording your vote.",
        });
      } finally {
        if (session) {
          await session.endSession();
        }
      }
    }
  } catch (error) {
    console.error("[Votes] POST / error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while processing the vote.",
    });
  }
});

// GET /api/votes/status/:electionId (Check current voter's participation status for an election)
router.get("/status/:electionId", verifyToken, async (req, res) => {
  try {
    const { electionId } = req.params;

    if (!electionId || !isValidObjectId(electionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID format.",
      });
    }

    const participation = await Participation.findOne({
      voterId: req.user.id,
      electionId,
    });

    return res.status(200).json({
      success: true,
      electionId,
      hasVoted: Boolean(participation),
      participatedAt: participation ? participation.createdAt : null,
    });
  } catch (error) {
    console.error("[Votes] GET /status/:electionId error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while checking voting status.",
    });
  }
});

// GET /api/votes/my-participations (Retrieve all elections the current voter has participated in)
router.get("/my-participations", verifyToken, async (req, res) => {
  try {
    const participations = await Participation.find({ voterId: req.user.id }).select("electionId createdAt");

    return res.status(200).json({
      success: true,
      participatedElectionIds: participations.map((p) => p.electionId.toString()),
    });
  } catch (error) {
    console.error("[Votes] GET /my-participations error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while retrieving voter participation history.",
    });
  }
});

module.exports = router;
