const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const Voter = require("../models/Voter");
const Ballot = require("../models/Ballot");
const Participation = require("../models/Participation");
const { verifyToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Helper to check valid MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper to verify optional authorization token without blocking public access
const getRequesterRole = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret);
    if (!decoded || !decoded.id) return null;
    const voter = await Voter.findById(decoded.id);
    return voter ? voter.role : null;
  } catch {
    return null;
  }
};

// GET /api/elections (Public: browse elections, drafts hidden from non-admin)
router.get("/", async (req, res) => {
  try {
    const role = await getRequesterRole(req);
    // Admins can see all elections including drafts; public and voters see published elections only
    const query = role === "admin" ? {} : { isDraft: false };
    const rawElections = await Election.find(query).sort({ createdAt: -1 });

    // Derive status and attach candidate counts for each election
    const electionsWithMeta = await Promise.all(
      rawElections.map(async (el) => {
        const candidateCount = await Candidate.countDocuments({ electionId: el._id });
        const status = Election.deriveStatus(el);
        return {
          id: el._id,
          title: el.title,
          description: el.description,
          startDate: el.startDate,
          endDate: el.endDate,
          isDraft: el.isDraft,
          status,
          candidateCount,
          voteCount: el.voteCount,
          createdAt: el.createdAt,
          updatedAt: el.updatedAt,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: electionsWithMeta.length,
      elections: electionsWithMeta,
    });
  } catch (error) {
    console.error("[Elections] GET / error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while retrieving elections.",
    });
  }
});

// GET /api/elections/:id (Public: retrieve election with candidates, drafts restricted to admin)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID format.",
      });
    }

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    // Draft isolation: hide draft election from non-admin requesters
    if (election.isDraft) {
      const role = await getRequesterRole(req);
      if (role !== "admin") {
        return res.status(404).json({
          success: false,
          message: "Election not found.",
        });
      }
    }

    const candidates = await Candidate.find({ electionId: id }).sort({ createdAt: 1 });
    const status = Election.deriveStatus(election);

    return res.status(200).json({
      success: true,
      election: {
        id: election._id,
        title: election.title,
        description: election.description,
        startDate: election.startDate,
        endDate: election.endDate,
        isDraft: election.isDraft,
        status,
        voteCount: election.voteCount,
        createdAt: election.createdAt,
        updatedAt: election.updatedAt,
      },
      candidates: candidates.map((c) => ({
        id: c._id,
        name: c.name,
        party: c.party,
        biography: c.biography,
        imageUrl: c.imageUrl,
        voteCount: status === "Completed" ? c.voteCount : 0,
        electionId: c.electionId,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Elections] GET /:id error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while retrieving the election.",
    });
  }
});

// GET /api/elections/:id/results (Authenticated: retrieve final results & analytics once completed)
router.get("/:id/results", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID format.",
      });
    }

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const status = Election.deriveStatus(election);

    // Security rule: Candidate-wise results must NOT be disclosed while Draft, Scheduled, or Active.
    // Final candidate-wise results should be accessible only when the election status is Completed.
    // Admins must not bypass the result-visibility restriction.
    if (status !== "Completed") {
      return res.status(403).json({
        success: false,
        message: `Election results are not available until the election has completed. Current status: ${status}.`,
        electionStatus: status,
      });
    }

    // 1. Fetch all candidates for the election
    const candidates = await Candidate.find({ electionId: id }).sort({ createdAt: 1 });

    // 2. Count total ballots from the Ballot collection (authoritative source of anonymous votes)
    const ballotTotal = await Ballot.countDocuments({ electionId: id });
    const totalVotes = Math.max(election.voteCount || 0, ballotTotal);

    // 3. Tally votes and calculate percentages for each candidate
    // Use Ballot aggregation for data integrity verification while preserving candidate documents
    const candidateTallies = await Ballot.aggregate([
      { $match: { electionId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: "$candidateId", count: { $sum: 1 } } },
    ]);
    const tallyMap = new Map();
    candidateTallies.forEach((t) => {
      tallyMap.set(t._id.toString(), t.count);
    });

    const candidatesWithResults = candidates.map((c) => {
      const aggCount = tallyMap.get(c._id.toString()) || 0;
      const candidateVotes = Math.max(c.voteCount || 0, aggCount);
      const votePercentage =
        totalVotes > 0 ? Number(((candidateVotes / totalVotes) * 100).toFixed(2)) : 0;

      return {
        id: c._id,
        name: c.name,
        party: c.party,
        biography: c.biography,
        imageUrl: c.imageUrl,
        voteCount: candidateVotes,
        votePercentage,
      };
    });

    // 4. Sort candidates descending by voteCount
    candidatesWithResults.sort((a, b) => b.voteCount - a.voteCount);

    // 5. Determine winning candidate or tie
    let winner = null;
    let winners = [];
    let isTie = false;

    if (totalVotes > 0 && candidatesWithResults.length > 0) {
      const maxVotes = candidatesWithResults[0].voteCount;
      if (maxVotes > 0) {
        const topCandidates = candidatesWithResults.filter((c) => c.voteCount === maxVotes);
        if (topCandidates.length > 1) {
          isTie = true;
          winners = topCandidates;
          winner = null;
        } else {
          isTie = false;
          winners = topCandidates;
          winner = topCandidates[0];
        }
      }
    }

    // 6. Registered voter turnout analytics
    const totalRegisteredVoters = await Voter.countDocuments({ role: "voter" });
    const turnoutPercentage =
      totalRegisteredVoters > 0
        ? Number(((totalVotes / totalRegisteredVoters) * 100).toFixed(2))
        : 0;

    return res.status(200).json({
      success: true,
      election: {
        id: election._id,
        title: election.title,
        description: election.description,
        startDate: election.startDate,
        endDate: election.endDate,
        status,
        totalVotes,
        candidateCount: candidates.length,
        totalRegisteredVoters,
        turnoutPercentage,
      },
      results: {
        totalVotes,
        isTie,
        winner,
        winners,
        candidates: candidatesWithResults,
      },
    });
  } catch (error) {
    console.error("[Elections] GET /:id/results error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while retrieving election results.",
    });
  }
});

// POST /api/elections (Admin: create election)
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, startDate, endDate, isDraft } = req.body || {};

    if (!title || typeof title !== "string" || title.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Election title is required and must be at least 3 characters.",
      });
    }

    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Election description is required.",
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Both start date and end date are required.",
      });
    }

    const parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);

    if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format provided for start or end date.",
      });
    }

    if (parsedEnd <= parsedStart) {
      return res.status(400).json({
        success: false,
        message: "End date must be later than the start date.",
      });
    }

    if (isDraft !== undefined && typeof isDraft !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isDraft must be a boolean value.",
      });
    }

    const election = await Election.create({
      title: title.trim(),
      description: description.trim(),
      startDate: parsedStart,
      endDate: parsedEnd,
      isDraft: typeof isDraft === "boolean" ? isDraft : false,
    });

    const status = Election.deriveStatus(election);

    return res.status(201).json({
      success: true,
      message: "Election created successfully.",
      election: {
        id: election._id,
        title: election.title,
        description: election.description,
        startDate: election.startDate,
        endDate: election.endDate,
        isDraft: election.isDraft,
        status,
        voteCount: election.voteCount,
        createdAt: election.createdAt,
      },
    });
  } catch (error) {
    console.error("[Elections] POST / error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while creating the election.",
    });
  }
});

// PUT /api/elections/:id (Admin: update election)
router.put("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID format.",
      });
    }

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const { title, description, startDate, endDate, isDraft } = req.body || {};

    // Unsafe Edits Protection: Once votes have been recorded, draft state and start date cannot be unsafely modified
    const ballotCount = await Ballot.countDocuments({ electionId: id });
    const hasVotes = election.voteCount > 0 || ballotCount > 0;

    if (hasVotes) {
      if (isDraft === true) {
        return res.status(400).json({
          success: false,
          message: "Cannot revert an election to draft after votes have been recorded.",
        });
      }
      if (startDate !== undefined && new Date(startDate).getTime() !== election.startDate.getTime()) {
        return res.status(400).json({
          success: false,
          message: "Cannot modify start date after voting has started.",
        });
      }
    }

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length < 3) {
        return res.status(400).json({
          success: false,
          message: "Election title must be at least 3 characters long.",
        });
      }
      election.title = title.trim();
    }

    if (description !== undefined) {
      if (typeof description !== "string" || !description.trim()) {
        return res.status(400).json({
          success: false,
          message: "Election description cannot be empty.",
        });
      }
      election.description = description.trim();
    }

    const newStart = startDate !== undefined ? new Date(startDate) : election.startDate;
    const newEnd = endDate !== undefined ? new Date(endDate) : election.endDate;

    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format provided.",
      });
    }

    if (newEnd <= newStart) {
      return res.status(400).json({
        success: false,
        message: "End date must be later than the start date.",
      });
    }

    election.startDate = newStart;
    election.endDate = newEnd;

    if (isDraft !== undefined) {
      if (typeof isDraft !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isDraft must be a boolean value.",
        });
      }

      // Transitioning from draft to published requires candidate and date validation
      if (isDraft === false && election.isDraft === true) {
        const candidateCount = await Candidate.countDocuments({ electionId: id });
        if (candidateCount === 0) {
          return res.status(400).json({
            success: false,
            message: "Cannot publish an election without nominated candidates. Please add at least one candidate before publishing.",
          });
        }

        if (newEnd <= new Date()) {
          return res.status(400).json({
            success: false,
            message: "Cannot publish an election whose end date is already in the past. Please update the election dates first.",
          });
        }
      }

      election.isDraft = isDraft;
    }

    await election.save();

    const status = Election.deriveStatus(election);

    return res.status(200).json({
      success: true,
      message: "Election updated successfully.",
      election: {
        id: election._id,
        title: election.title,
        description: election.description,
        startDate: election.startDate,
        endDate: election.endDate,
        isDraft: election.isDraft,
        status,
        voteCount: election.voteCount,
        updatedAt: election.updatedAt,
      },
    });
  } catch (error) {
    console.error("[Elections] PUT /:id error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while updating the election.",
    });
  }
});

// PATCH /api/elections/:id/publish (Admin: publish draft election)
router.patch("/:id/publish", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID format.",
      });
    }

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    if (!election.isDraft) {
      const currentStatus = Election.deriveStatus(election);
      return res.status(400).json({
        success: false,
        message: `Election is already published with status "${currentStatus}".`,
      });
    }

    // Candidate requirements validation: an election must have at least one nominated candidate
    const candidateCount = await Candidate.countDocuments({ electionId: id });
    if (candidateCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot publish an election without nominated candidates. Please add at least one candidate before publishing.",
      });
    }

    // Election date validation: end date must be in the future and later than start date
    const now = new Date();
    const end = new Date(election.endDate);
    const start = new Date(election.startDate);

    if (end <= now) {
      return res.status(400).json({
        success: false,
        message: "Cannot publish an election whose end date is already in the past. Please update the election dates first.",
      });
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: "Election end date must be later than the start date.",
      });
    }

    election.isDraft = false;
    await election.save();

    const derivedStatus = Election.deriveStatus(election);

    return res.status(200).json({
      success: true,
      message: `Election "${election.title}" published successfully! Status is now "${derivedStatus}".`,
      election: {
        id: election._id,
        title: election.title,
        description: election.description,
        startDate: election.startDate,
        endDate: election.endDate,
        isDraft: election.isDraft,
        status: derivedStatus,
        voteCount: election.voteCount,
        candidateCount,
        updatedAt: election.updatedAt,
      },
    });
  } catch (error) {
    console.error("[Elections] PATCH /:id/publish error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while publishing the election.",
    });
  }
});

// DELETE /api/elections/:id (Admin: delete election & cascade candidates)
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID format.",
      });
    }

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    // Data Integrity Rule: Prevent deleting after votes have been recorded
    const ballotCount = await Ballot.countDocuments({ electionId: id });
    if (election.voteCount > 0 || ballotCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an election after votes have been recorded.",
      });
    }

    // Cascade delete associated candidates and any pre-vote records
    await Candidate.deleteMany({ electionId: id });
    await Participation.deleteMany({ electionId: id });
    await Ballot.deleteMany({ electionId: id });
    await Election.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Election and all associated candidates deleted successfully.",
    });
  } catch (error) {
    console.error("[Elections] DELETE /:id error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while deleting the election.",
    });
  }
});

// POST /api/elections/:id/candidates (Admin: add candidate to election)
router.post("/:id/candidates", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID format.",
      });
    }

    const election = await Election.findById(id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Cannot add candidate to non-existent election.",
      });
    }

    const { name, party, biography, imageUrl } = req.body || {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Candidate name is required and must be at least 2 characters.",
      });
    }

    if (!party || typeof party !== "string" || !party.trim()) {
      return res.status(400).json({
        success: false,
        message: "Party or affiliation is required.",
      });
    }

    const candidate = await Candidate.create({
      name: name.trim(),
      party: party.trim(),
      biography: typeof biography === "string" ? biography.trim() : "",
      imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
      electionId: id,
    });

    return res.status(201).json({
      success: true,
      message: "Candidate added successfully.",
      candidate: {
        id: candidate._id,
        name: candidate.name,
        party: candidate.party,
        biography: candidate.biography,
        imageUrl: candidate.imageUrl,
        voteCount: candidate.voteCount,
        electionId: candidate.electionId,
        createdAt: candidate.createdAt,
      },
    });
  } catch (error) {
    console.error("[Elections] POST /:id/candidates error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while adding the candidate.",
    });
  }
});

// PUT /api/elections/:id/candidates/:candidateId (Admin: update candidate)
router.put("/:id/candidates/:candidateId", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id, candidateId } = req.params;
    if (!isValidObjectId(id) || !isValidObjectId(candidateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election or candidate ID format.",
      });
    }

    const candidate = await Candidate.findOne({ _id: candidateId, electionId: id });
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found in this election.",
      });
    }

    const { name, party, biography, imageUrl } = req.body || {};

    // Data Integrity Rule: Prevent modifying candidate name/party after votes recorded
    const candidateBallots = await Ballot.countDocuments({ candidateId });
    if (candidate.voteCount > 0 || candidateBallots > 0) {
      if ((name !== undefined && name.trim() !== candidate.name) ||
          (party !== undefined && party.trim() !== candidate.party)) {
        return res.status(400).json({
          success: false,
          message: "Cannot modify candidate identity (name or party) after votes have been recorded.",
        });
      }
    }

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Candidate name must be at least 2 characters.",
        });
      }
      candidate.name = name.trim();
    }

    if (party !== undefined) {
      if (typeof party !== "string" || !party.trim()) {
        return res.status(400).json({
          success: false,
          message: "Party or affiliation cannot be empty.",
        });
      }
      candidate.party = party.trim();
    }

    if (biography !== undefined) {
      candidate.biography = typeof biography === "string" ? biography.trim() : "";
    }

    if (imageUrl !== undefined) {
      candidate.imageUrl = typeof imageUrl === "string" ? imageUrl.trim() : "";
    }

    await candidate.save();

    return res.status(200).json({
      success: true,
      message: "Candidate updated successfully.",
      candidate: {
        id: candidate._id,
        name: candidate.name,
        party: candidate.party,
        biography: candidate.biography,
        imageUrl: candidate.imageUrl,
        voteCount: candidate.voteCount,
        electionId: candidate.electionId,
        updatedAt: candidate.updatedAt,
      },
    });
  } catch (error) {
    console.error("[Elections] PUT /:id/candidates/:candidateId error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while updating the candidate.",
    });
  }
});

// DELETE /api/elections/:id/candidates/:candidateId (Admin: remove candidate)
router.delete("/:id/candidates/:candidateId", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id, candidateId } = req.params;
    if (!isValidObjectId(id) || !isValidObjectId(candidateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election or candidate ID format.",
      });
    }

    const candidate = await Candidate.findOne({ _id: candidateId, electionId: id });
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found in this election.",
      });
    }

    const election = await Election.findById(id);

    // Data Integrity Rule: Prevent deleting candidate after votes recorded
    const candidateBallots = await Ballot.countDocuments({ candidateId });
    const electionBallots = await Ballot.countDocuments({ electionId: id });
    if (
      candidate.voteCount > 0 ||
      candidateBallots > 0 ||
      (election && election.voteCount > 0) ||
      electionBallots > 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove candidate after votes have been recorded in this election.",
      });
    }

    await Candidate.findByIdAndDelete(candidateId);

    return res.status(200).json({
      success: true,
      message: "Candidate removed successfully.",
    });
  } catch (error) {
    console.error("[Elections] DELETE candidate error:", error.message);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred while removing the candidate.",
    });
  }
});

module.exports = router;
