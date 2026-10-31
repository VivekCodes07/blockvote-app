const express = require("express");
const mongoose = require("mongoose");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const Voter = require("../models/Voter");
const Participation = require("../models/Participation");
const Ballot = require("../models/Ballot");
const AuditBlock = require("../models/AuditBlock");
const { appendAuditBlock } = require("../utils/blockchain");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// Helper to check valid MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Detect whether an error indicates that MongoDB does not support transactions
 * (e.g. standalone mongod instance without replica set).
 */
function isTransactionUnsupportedError(err) {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  const codeName = String(err.codeName || "");
  return (
    err.code === 20 ||
    codeName === "IllegalOperation" ||
    msg.includes("transaction numbers are only allowed on a replica set") ||
    msg.includes("does not support multi-document transactions") ||
    msg.includes("transactions are not supported") ||
    msg.includes("standalone")
  );
}

/**
 * Detect whether an error is transient and can be retried (e.g. write conflict under concurrency).
 */
function isTransientTransactionError(err) {
  if (!err) return false;
  return (
    err.code === 112 ||
    (Array.isArray(err.errorLabels) && err.errorLabels.includes("TransientTransactionError")) ||
    (err.message && err.message.includes("WriteConflict")) ||
    (err.message && err.message.includes("Please retry your operation"))
  );
}

/**
 * Detect whether a commit error is ambiguous (commit status unknown).
 * If unknown, committing might have succeeded on the server.
 * Compensating fallback MUST NOT run after this to prevent duplicate writes or count corruption.
 */
function isUnknownCommitResult(err) {
  if (!err) return false;
  return Array.isArray(err.errorLabels) && err.errorLabels.includes("UnknownTransactionCommitResult");
}

/**
 * Compensating write fallback strategy
 *
 * IMPORTANT NOTE ON ATOMICITY:
 * Compensating writes are a sequential best-effort fallback strategy for environments
 * where multi-document transactions are genuinely unavailable (e.g., standalone local mongod).
 * Unlike replica-set transactions, sequential compensating writes are NOT atomic.
 * If a process or network failure occurs mid-sequence, partial writes may persist
 * until compensating rollback or manual reconciliation takes place.
 *
 * Reliability guarantees:
 * - Checks matchedCount for both election and candidate updates.
 * - If any update fails to match its target document, the vote is treated as unsuccessful.
 * - Tracks every completed write step-by-step.
 * - Attempts all required rollback operations even if one rollback fails.
 * - Records rollback failures in structured server-side logs without logging voter choices or personal data.
 * - Never returns a successful vote response if all required writes did not complete.
 * - If rollback cannot restore consistency, clearly reports that manual reconciliation is required.
 */
async function executeCompensatingVote(res, voterId, electionId, candidateId) {
  const completedWrites = {
    participation: false,
    ballotId: null,
    electionIncremented: false,
    candidateIncremented: false,
    auditBlockId: null,
  };

  try {
    // 1. Create Participation record first (enforced by unique compound index)
    await Participation.create({ voterId, electionId });
    completedWrites.participation = true;

    // 2. Create anonymous Ballot record (strictly omits voter identifier)
    const ballot = await Ballot.create({ electionId, candidateId });
    completedWrites.ballotId = ballot._id;

    // 3. Increment election vote count (verifying document matched)
    const electionUpdateResult = await Election.updateOne(
      { _id: electionId },
      { $inc: { voteCount: 1 } }
    );
    if (!electionUpdateResult || electionUpdateResult.matchedCount !== 1) {
      throw new Error("Election document could not be matched for vote count increment");
    }
    completedWrites.electionIncremented = true;

    // 4. Increment candidate vote count (verifying document matched)
    const candidateUpdateResult = await Candidate.updateOne(
      { _id: candidateId, electionId },
      { $inc: { voteCount: 1 } }
    );
    if (!candidateUpdateResult || candidateUpdateResult.matchedCount !== 1) {
      throw new Error("Candidate document could not be matched for vote count increment");
    }
    completedWrites.candidateIncremented = true;

    // 5. Append audit block for successful vote (anonymous, non-identifying metadata)
    const auditBlock = await appendAuditBlock({
      eventType: "VOTE_RECORDED",
      electionId,
      metadata: {
        event: "VOTE_RECORDED",
        timestamp: new Date().toISOString(),
      },
    });
    completedWrites.auditBlockId = auditBlock._id;

    return res.status(201).json({
      success: true,
      message: "Your vote has been cast successfully.",
      electionId,
    });
  } catch (err) {
    // If duplicate participation occurred at Step 1 before any partial writes were made
    const isDuplicateParticipation =
      err.code === 11000 &&
      !completedWrites.participation &&
      (String(err.message || "").includes("participations") ||
        Boolean(err.keyPattern && err.keyPattern.voterId !== undefined));

    if (isDuplicateParticipation) {
      return res.status(409).json({
        success: false,
        message: "You have already voted in this election.",
      });
    }

    console.error("[Votes] Compensating write failure during vote execution:", {
      stage: "write_sequence",
      errorName: err.name,
      errorMessage: err.message,
      completedSteps: {
        participation: completedWrites.participation,
        ballot: Boolean(completedWrites.ballotId),
        electionCount: completedWrites.electionIncremented,
        candidateCount: completedWrites.candidateIncremented,
        auditBlock: Boolean(completedWrites.auditBlockId),
      },
    });

    // Execute compensating rollbacks in reverse order
    // Ensure ALL rollbacks are attempted independently even if one fails
    const rollbackFailures = [];

    if (completedWrites.auditBlockId) {
      try {
        const delAuditResult = await AuditBlock.deleteOne({ _id: completedWrites.auditBlockId });
        if (!delAuditResult || delAuditResult.deletedCount !== 1) {
          rollbackFailures.push({
            step: "rollback_audit_block",
            reason: "Audit block document could not be deleted",
          });
        }
      } catch (rollbackErr) {
        rollbackFailures.push({
          step: "rollback_audit_block",
          reason: rollbackErr.message,
        });
      }
    }

    if (completedWrites.candidateIncremented) {
      try {
        const rollbackCandResult = await Candidate.updateOne(
          { _id: candidateId, electionId },
          { $inc: { voteCount: -1 } }
        );
        if (!rollbackCandResult || rollbackCandResult.matchedCount !== 1) {
          rollbackFailures.push({
            step: "rollback_candidate_count",
            reason: "Target candidate document not matched during decrement",
          });
        }
      } catch (rollbackErr) {
        rollbackFailures.push({
          step: "rollback_candidate_count",
          reason: rollbackErr.message,
        });
      }
    }

    if (completedWrites.electionIncremented) {
      try {
        const rollbackElectionResult = await Election.updateOne(
          { _id: electionId },
          { $inc: { voteCount: -1 } }
        );
        if (!rollbackElectionResult || rollbackElectionResult.matchedCount !== 1) {
          rollbackFailures.push({
            step: "rollback_election_count",
            reason: "Target election document not matched during decrement",
          });
        }
      } catch (rollbackErr) {
        rollbackFailures.push({
          step: "rollback_election_count",
          reason: rollbackErr.message,
        });
      }
    }

    if (completedWrites.ballotId) {
      try {
        const delBallotResult = await Ballot.deleteOne({ _id: completedWrites.ballotId });
        if (!delBallotResult || delBallotResult.deletedCount !== 1) {
          rollbackFailures.push({
            step: "rollback_ballot_record",
            reason: "Ballot document could not be deleted",
          });
        }
      } catch (rollbackErr) {
        rollbackFailures.push({
          step: "rollback_ballot_record",
          reason: rollbackErr.message,
        });
      }
    }

    if (completedWrites.participation) {
      try {
        const delPartResult = await Participation.deleteOne({ voterId, electionId });
        if (!delPartResult || delPartResult.deletedCount !== 1) {
          rollbackFailures.push({
            step: "rollback_participation_record",
            reason: "Participation record could not be deleted",
          });
        }
      } catch (rollbackErr) {
        rollbackFailures.push({
          step: "rollback_participation_record",
          reason: rollbackErr.message,
        });
      }
    }

    if (rollbackFailures.length > 0) {
      // Structured logging without exposing voter selections or voter personal data
      console.error("[Votes][CRITICAL] Compensating rollback incomplete; manual database reconciliation required:", {
        electionId: String(electionId),
        failedRollbackSteps: rollbackFailures,
      });

      return res.status(500).json({
        success: false,
        message:
          "A failure occurred while recording your vote and automatic reconciliation could not fully restore consistency. Manual administrator reconciliation is required.",
      });
    }

    console.log("[Votes] Compensating rollback completed successfully. All partial writes undone.", {
      electionId: String(electionId),
    });

    return res.status(500).json({
      success: false,
      message: "An error occurred while recording your vote. All partial writes were successfully rolled back. Please try again.",
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
    let fallbackToCompensating = false;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let session = null;
      let transactionStarted = false;
      let commitAttempted = false;

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
        transactionStarted = true;

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

        // 3. Atomically increment election vote count (verifying document match)
        const electionUpdate = await Election.updateOne(
          { _id: election._id },
          { $inc: { voteCount: 1 } },
          { session }
        );
        if (!electionUpdate || electionUpdate.matchedCount !== 1) {
          throw new Error("Election document could not be matched for vote count increment in transaction");
        }

        // 4. Atomically increment candidate vote count (verifying document match)
        const candidateUpdate = await Candidate.updateOne(
          { _id: candidate._id, electionId: election._id },
          { $inc: { voteCount: 1 } },
          { session }
        );
        if (!candidateUpdate || candidateUpdate.matchedCount !== 1) {
          throw new Error("Candidate document could not be matched for vote count increment in transaction");
        }

        // 5. Atomically append audit block in the same transaction (anonymous, non-identifying metadata)
        await appendAuditBlock(
          {
            eventType: "VOTE_RECORDED",
            electionId: election._id,
            metadata: {
              event: "VOTE_RECORDED",
              electionTitle: election.title,
              timestamp: new Date().toISOString(),
            },
          },
          session
        );

        commitAttempted = true;
        await session.commitTransaction();

        return res.status(201).json({
          success: true,
          message: "Your vote has been cast successfully.",
          electionId: election._id,
        });
      } catch (txError) {
        if (session && transactionStarted) {
          try {
            await session.abortTransaction();
          } catch {
            // Abort may fail if commit already succeeded or transaction aborted by server
          }
        }

        // Handle duplicate participation caught by unique compound index (permanent, do not retry)
        // Strictly verify that the collision occurred on the Participation collection, not an AuditBlock index collision
        const isDuplicateParticipation =
          txError.code === 11000 &&
          (String(txError.message || "").includes("participations") ||
            Boolean(txError.keyPattern && txError.keyPattern.voterId !== undefined));

        if (isDuplicateParticipation) {
          return res.status(409).json({
            success: false,
            message: "You have already voted in this election.",
          });
        }

        // Check if environment explicitly does NOT support multi-document transactions
        // Crucial safety check: Never fall back to compensating writes if commit was attempted!
        // The original transaction might have committed on the server.
        if (!commitAttempted && isTransactionUnsupportedError(txError)) {
          console.warn("[Votes] MongoDB deployment does not support transactions. Falling back to compensating-write strategy.");
          fallbackToCompensating = true;
          break; // Break retry loop to execute compensating fallback outside
        }

        // Handle ambiguous commit result: commit was attempted and result is unknown.
        // DO NOT execute compensating fallback, as the vote may have been committed.
        if (commitAttempted && isUnknownCommitResult(txError)) {
          console.error("[Votes] Transaction commit resulted in UnknownTransactionCommitResult:", txError.message);
          // Check if participation actually exists in the database
          const confirmedParticipation = await Participation.findOne({
            voterId: voter._id,
            electionId: election._id,
          });
          if (confirmedParticipation) {
            return res.status(201).json({
              success: true,
              message: "Your vote has been cast successfully.",
              electionId: election._id,
            });
          }
          return res.status(500).json({
            success: false,
            message: "An ambiguous transaction commit result occurred. Please verify your voting status before attempting again.",
          });
        }

        // Check for transient write conflict under concurrency (including ledger index collision)
        const isTransient = isTransientTransactionError(txError) || txError.code === 11000;

        if (isTransient && attempt < MAX_RETRIES) {
          // Brief exponential backoff allowing competing transaction to complete
          await new Promise((resolve) => setTimeout(resolve, 60 * attempt));
          continue;
        }

        // Post-conflict check: if a concurrent winning transaction completed for this voter
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

        console.error("[Votes] Transaction execution error:", {
          attempt,
          errorName: txError.name,
          errorMessage: txError.message,
          isTransient,
        });

        return res.status(500).json({
          success: false,
          message: "An internal server error occurred while recording your vote.",
        });
      } finally {
        if (session) {
          try {
            await session.endSession();
          } catch {}
        }
      }
    }

    // Execute compensating fallback ONLY if transactions are genuinely unsupported
    // and commit was never attempted
    if (fallbackToCompensating) {
      return await executeCompensatingVote(res, voter._id, election._id, candidate._id);
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

// Internal helper references for automated reliability testing
router._executeCompensatingVote = executeCompensatingVote;
router._isTransactionUnsupportedError = isTransactionUnsupportedError;
router._isTransientTransactionError = isTransientTransactionError;
router._isUnknownCommitResult = isUnknownCommitResult;

module.exports = router;
