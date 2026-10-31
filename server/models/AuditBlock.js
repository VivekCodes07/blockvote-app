const mongoose = require("mongoose");

const auditBlockSchema = new mongoose.Schema(
  {
    index: {
      type: Number,
      required: [true, "Block index is required"],
      unique: true,
      min: 0,
    },
    timestamp: {
      type: Date,
      required: [true, "Block timestamp is required"],
      default: Date.now,
    },
    eventType: {
      type: String,
      required: [true, "Event type is required"],
      trim: true,
      index: true,
    },
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      default: null,
      index: true,
    },
    previousHash: {
      type: String,
      required: [true, "Previous hash reference is required"],
      trim: true,
    },
    hash: {
      type: String,
      required: [true, "Block hash is required"],
      unique: true,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes for fast chronological lookups and verification
auditBlockSchema.index({ createdAt: -1 });

const AuditBlock = mongoose.model("AuditBlock", auditBlockSchema);

module.exports = AuditBlock;
