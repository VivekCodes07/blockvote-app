const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Candidate name is required"],
      trim: true,
      minlength: [2, "Candidate name must be at least 2 characters long"],
      maxlength: [100, "Candidate name cannot exceed 100 characters"],
    },
    party: {
      type: String,
      required: [true, "Party or affiliation is required"],
      trim: true,
      maxlength: [100, "Party/affiliation cannot exceed 100 characters"],
    },
    biography: {
      type: String,
      trim: true,
      maxlength: [1000, "Biography cannot exceed 1000 characters"],
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: [true, "Election ID is required"],
      index: true,
    },
    voteCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Candidate = mongoose.model("Candidate", candidateSchema);

module.exports = Candidate;
