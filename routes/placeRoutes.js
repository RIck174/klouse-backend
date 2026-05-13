const express = require("express");
const router = express.Router();
const SavedPlace = require("../Models/SavedPlace");
const Protect = require("../middleware/authMiddleware");

// Get all saved places for the user
router.get("/", Protect, async (req, res) => {
  try {
    const places = await SavedPlace.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(places);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Save a new place
router.post("/", Protect, async (req, res) => {
  try {
    const { label, icon, name, coordinates } = req.body;

    if (!label || !name || !coordinates) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const place = await SavedPlace.create({
      userId: req.user.id,
      label,
      icon: icon || "bxs-map-pin",
      name,
      coordinates,
    });

    res.status(201).json(place);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Edit a saved place
router.put("/:id", Protect, async (req, res) => {
  try {
    const { label, icon, name, coordinates } = req.body;

    const place = await SavedPlace.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!place) {
      return res.status(404).json({ message: "Place not found" });
    }

    if (label) place.label = label;
    if (icon) place.icon = icon;
    if (name) place.name = name;
    if (coordinates) place.coordinates = coordinates;

    await place.save();
    res.json(place);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete a saved place
router.delete("/:id", Protect, async (req, res) => {
  try {
    const place = await SavedPlace.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!place) {
      return res.status(404).json({ message: "Place not found" });
    }

    await place.deleteOne();
    res.json({ message: "Place deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
