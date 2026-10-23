const mongoose = require("mongoose");

const electionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Election title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters long"],
      maxlength: [150, "Title cannot exceed 150 characters"],
    },
    description: {
      type: String,
      required: [true, "Election description is required"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (val) {
          if (!this.startDate) return true;
          return val > this.startDate;
        },
        message: "End date must be later than the start date",
      },
    },
    isDraft: {
      type: Boolean,
      default: false,
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

// Derive status dynamically from election dates and draft state
electionSchema.methods.getDerivedStatus = function () {
  if (this.isDraft) return "Draft";
  const now = new Date();
  const start = new Date(this.startDate);
  const end = new Date(this.endDate);

  if (now < start) return "Scheduled";
  if (now >= start && now <= end) return "Active";
  return "Completed";
};

// Helper for plain objects
electionSchema.statics.deriveStatus = function (election) {
  if (election.isDraft) return "Draft";
  const now = new Date();
  const start = new Date(election.startDate);
  const end = new Date(election.endDate);

  if (now < start) return "Scheduled";
  if (now >= start && now <= end) return "Active";
  return "Completed";
};

const Election = mongoose.model("Election", electionSchema);

module.exports = Election;
