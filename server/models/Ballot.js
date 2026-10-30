const mongoose = require("mongoose");

const ballotSchema = new mongoose.Schema(
  {
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: [true, "Election ID is required"],
      index: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: [true, "Candidate ID is required"],
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Note: To protect voter anonymity, this model stores ONLY election and candidate references.
// No voterId or personal identifier is stored or linked in ballot documents.

const Ballot = mongoose.model("Ballot", ballotSchema);

module.exports = Ballot;
