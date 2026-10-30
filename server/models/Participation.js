const mongoose = require("mongoose");

const participationSchema = new mongoose.Schema(
  {
    voterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voter",
      required: [true, "Voter ID is required"],
      index: true,
    },
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: [true, "Election ID is required"],
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Enforce strictly one participation record per voter per election at database level
participationSchema.index({ voterId: 1, electionId: 1 }, { unique: true });

const Participation = mongoose.model("Participation", participationSchema);

module.exports = Participation;
