const mongoose = require("mongoose");

const emergencySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["ambulance", "police", "emergency"], default: "emergency" },
    payload: { type: Object, default: {} },
    location: {
      lat: Number,
      lng: Number,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", nullable: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmergencyEvent", emergencySchema);

