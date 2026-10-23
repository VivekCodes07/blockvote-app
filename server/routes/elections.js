const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const Voter = require("../models/Voter");
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
        voteCount: c.voteCount,
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
    if (election.voteCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an election after votes have been recorded.",
      });
    }

    // Cascade delete associated candidates
    await Candidate.deleteMany({ electionId: id });
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
    if (candidate.voteCount > 0 || (election && election.voteCount > 0)) {
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
