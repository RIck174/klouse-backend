const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: false,
    },
    googleId: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ["user", "driver", "admin"],
      default: "user",
    },
    profileImage: {
      type: String,
      default: "",
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        default: [0, 0],
      },
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    available: {
      type: Boolean,
      default: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["mtn", "telecel", "airteltigo", "cash"],
      default: "cash",
    },
    momoNumber: {
      type: String,
      default: "",
    },
    vehicleType: {
      type: String,
      enum: ["Car", "Motorbike"],
      default: null,
    },
    vehicleModel: {
      type: String,
      default: "",
    },
    licensePlate: {
      type: String,
      default: "",
    },
    driversLicense: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

userSchema.index({ location: "2dsphere" });
const User = mongoose.model("User", userSchema);
module.exports = User;
