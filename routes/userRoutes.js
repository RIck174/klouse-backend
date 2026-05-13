const express = require("express");
const User = require("../Models/User");
const Ride = require("../Models/Ride");
const router = express.Router();
const Protect = require("../middleware/authMiddleware");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

//location route
router.put("/location", Protect, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    const userId = req.user.id;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        isOnline: true,
      },
      {
        new: true,
      },
    );
    res.json({ message: "Location updated", user });
  } catch (err) {
    res.status(500).json({ message: "Location failed to update" });
  }
});

//sending user info
router.get("/profile", Protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password -googleId");

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

//updating user info
router.put("/profile-update", Protect, async (req, res) => {
  try {
    const { newUsername, newEmail } = req.body;

    const userId = req.user.id;
    const user = await User.findByIdAndUpdate(
      userId,
      {
        username: newUsername,
        email: newEmail,
      },
      {
        new: true,
      },
    ).select("-password -googleId");

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update profile", error: error.message });
  }
});

//updating password
router.put("/passwordUpdate", Protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, {
      password: hashPassword,
    });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Server error, Failed to update password",
      error: error.message,
    });
  }
});

//update profile-img
router.put("/profile-image", Protect, async (req, res) => {
  try {
    const { imgUrl } = req.body;
    if (!imgUrl) {
      return res.status(400).json({ message: "No image url provided" });
    }

    const userId = req.user.id;
    const user = await User.findByIdAndUpdate(
      userId,
      {
        profileImage: imgUrl,
      },
      { new: true },
    );
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    res.json({ message: "Profile image successfully updated", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

//update roles
router.put("/role", Protect, async (req, res) => {
  try {
    const { vehicleType, vehicleModel, licensePlate, driversLicense } =
      req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.role === "driver") {
      return res.status(400).json({ message: "You are already a driver" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        vehicleType,
        vehicleModel,
        licensePlate,
        driversLicense,
        role: "driver",
      },
      { new: true },
    ).select("-password -googleId");

    const newToken = jwt.sign(
      { id: updatedUser._id, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({
      message: "Congratulations, you are now a driver",
      user: updatedUser,
      token: newToken,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

//balance route
router.put("/balance", Protect, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { balance: amount } },
      { new: true },
    ).select("balance");
    res.json({ message: "Balance updated", balance: user.balance });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

//go offline
router.put("/offline", Protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { isOnline: false });
    res.json({ message: "You are now offline" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/payment-info", Protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "username email balance paymentMethod momoNumber",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// saves the user's chosen payment method
router.put("/payment-methodUpdate", Protect, async (req, res) => {
  try {
    const { paymentMethod, momoNumber } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { paymentMethod, momoNumber },
      { new: true },
    ).select("paymentMethod momoNumber");

    res.json({ message: "Payment method updated", user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

//delete account
router.delete("/delete-account", Protect, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({ message: "Cound not find user" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    await Ride.deleteMany({ userId });
    await User.findByIdAndDelete(userId);

    res.json({ message: "Account successfully deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
