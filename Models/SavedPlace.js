const mongoose = require("mongoose");

const savedPlaceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      default: "bxs-map-pin",
    },
    name: {
      type: String,
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SavedPlace", savedPlaceSchema);
