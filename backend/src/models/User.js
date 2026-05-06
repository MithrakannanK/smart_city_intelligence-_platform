const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, index: true, sparse: true },
    displayName: { type: String, default: "" },
    language: { type: String, enum: ["en", "ta"], default: "en" },
    homeLocation: {
      lat: { type: Number },
      lng: { type: Number },
      label: { type: String, default: "" },
    },
    city: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

