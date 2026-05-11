const Protect = require("../middleware/authMiddleware");
const express = require("express");
const router = express.Router();
const User = require("../Models/User");
const Ride = require("../Models/Ride");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Register route
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    const token = jwt.sign(
      {
        id: newUser._id,
        role: newUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.status(201).json({ message: "User created successfully", token });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to create new account", error: err.message });
  }
});

//login route
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

//google register and sign-in
router.post("/google", async (req, res) => {
  try {
    const { username, email, googleId } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      // User exists — just log them in
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );
      return res.json({ token, user });
    }

    // New user — create account
    const hashedGoogleId = await bcrypt.hash(googleId, 10);
    user = await User.create({
      username,
      email,
      googleId,
      password: hashedGoogleId,
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Google auth failed", error: err.message });
  }
});

//verify
router.get("/verify", Protect, (req, res) => {
  console.log("Verify hit — req.user:", req.user);
  res.status(200).json({ valid: true });
});

module.exports = router;
