const express = require("express");
const User = require("../Models/User");
const router = express.Router();
const Ride = require("../Models/Ride");
const Protect = require("../middleware/authMiddleware");

//ride routes
router.post("/request", Protect, async (req, res) => {
  try {
    const { destination, destinationName, vehicleType, notes } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.location) {
      return res.status(400).json({ message: "User location not found" });
    }

    const existingRide = await Ride.findOne({
      userId: req.user.id,
      status: { $in: ["Searching", "Accepted"] },
    });

    if (existingRide) {
      return res.json({ ride: existingRide });
    }

    let fare = 5;
    try {
      const orsResponse = await fetch(
        "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.ORS_KEY}`,
          },
          body: JSON.stringify({
            coordinates: [user.location.coordinates, destination],
          }),
        },
      );
      const orsData = await orsResponse.json();
      if (orsData.features) {
        const distanceKm =
          orsData.features[0].properties.summary.distance / 1000;
        fare = parseFloat((5 + distanceKm * 2.5).toFixed(2));
      } else throw new Error("ORS failed");
    } catch (orsErr) {
      console.log("ORS failed, using OSRM:", orsErr.message);
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${user.location.coordinates[0]},${user.location.coordinates[1]};${destination[0]},${destination[1]}?overview=false`;
        const osrmRes = await fetch(url);
        const osrmData = await osrmRes.json();
        const distanceKm = osrmData.routes[0].distance / 1000;
        fare = parseFloat((5 + distanceKm * 2.5).toFixed(2));
      } catch {
        fare = 5;
      }
    }

    const ride = await Ride.create({
      userId: user._id,
      pickup: user.location,
      destination: {
        type: "Point",
        coordinates: destination,
      },
      fare,
      destinationName: destinationName || "",
      vehicleType: vehicleType || "Car",
      notes: notes || "",
    });

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");
    notifyDriversInBatches(ride, io, onlineUsers);
    res.json({ message: "Ride requested successfully", ride });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Ride request failed", error: err.message });
  }
});

// Accept ride
router.post("/accept/:rideId", Protect, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Only drivers can accept rides" });
    }

    const { rideId } = req.params;

    const ride = await Ride.findById(rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    if (ride.status !== "Searching") {
      return res
        .status(403)
        .json({ message: "Ride already taken by another driver" });
    }

    const driver = await User.findById(req.user.id).select("username");
    ride.acceptedBy = req.user.id;
    ride.status = "Accepted";
    ride.driverName = driver.username;
    await ride.save();
    await User.findByIdAndUpdate(req.user.id, { available: false });

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    // Notify rider directly
    const riderSocketId = onlineUsers[ride.userId.toString()];

    if (riderSocketId) {
      io.to(riderSocketId).emit("rideAccepted", {
        driverName: driver.username,
        rideId: ride._id,
      });
    }

    // Notify all drivers that ride is taken
    ride.driversNotified.forEach((driverId) => {
      const socketId = onlineUsers[driverId];
      if (socketId) {
        io.to(socketId).emit("rideTaken", { rideId: ride._id });
      }
    });

    res.json({ message: "Ride accepted successfully", ride });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to accept ride", error: err.message });
  }
});

//active ride
router.get("/active", Protect, async (req, res) => {
  try {
    const activeRide = await Ride.findOne({
      userId: req.user.id,
      status: { $in: ["Searching", "Accepted"] },
    });

    if (!activeRide) {
      return res.status(404).json({ message: "No active ride" });
    }
    res.json(activeRide);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

//getting payment history
router.get("/history", Protect, async (req, res) => {
  try {
    const rides = await Ride.find({
      userId: req.user.id,
      status: "Completed",
    })
      .sort({ createdAt: -1 })
      .limit(25);

    res.json(rides);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

//all ride history
router.get("/all-history", Protect, async (req, res) => {
  try {
    const rides = await Ride.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json(rides);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

//route fetch
router.post("/route", Protect, async (req, res) => {
  const { pickup, destination } = req.body;

  // Try ORS first
  try {
    const orsRes = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ORS_KEY}`,
        },
        body: JSON.stringify({ coordinates: [pickup, destination] }),
      },
    );
    const data = await orsRes.json();

    // ORS returns errors inside the response, not as HTTP errors
    if (data.features) {
      return res.json(data);
    }
    throw new Error("ORS returned no features");
  } catch (orsErr) {
    console.log("ORS failed, falling back to OSRM:", orsErr.message);

    // Fallback to OSRM
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${pickup[0]},${pickup[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
      const osrmRes = await fetch(url);
      const data = await osrmRes.json();

      const coords = data.routes[0].geometry.coordinates;
      console.log("Route served by OSRM");
      return res.json({
        features: [
          {
            geometry: { coordinates: coords },
          },
        ],
      });
    } catch (osrmErr) {
      console.error("Both ORS and OSRM failed:", osrmErr.message);
      return res.status(500).json({ message: "Route fetch failed" });
    }
  }
});

// cancel ride
router.post("/cancel/:rideId", Protect, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Make sure only the rider who requested it can cancel
    if (ride.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Can't cancel a ride that's already done
    if (ride.status === "Completed" || ride.status === "Cancelled") {
      return res.status(400).json({ message: "Ride already ended" });
    }

    ride.status = "Cancelled";
    await ride.save();

    // If a driver had already accepted, make them available again
    if (ride.acceptedBy) {
      await User.findByIdAndUpdate(ride.acceptedBy, { available: true });
    }

    // Notify the driver their ride was cancelled
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");

    if (ride.acceptedBy) {
      const driverSocketId = onlineUsers[ride.acceptedBy.toString()];
      if (driverSocketId) {
        io.to(driverSocketId).emit("rideCancelled", { rideId: ride._id });
      }
    }

    res.json({ message: "Ride cancelled successfully" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to cancel ride", error: err.message });
  }
});

//ride complete
router.post("/complete/:rideId", Protect, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.acceptedBy.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    ride.status = "Completed";
    await ride.save();
    await User.findByIdAndUpdate(req.user.id, { available: true });

    // Deduct fare from rider's balance if they're not paying cash
    const rider = await User.findById(ride.userId);
    if (rider.paymentMethod !== "cash") {
      await User.findByIdAndUpdate(ride.userId, {
        $inc: { balance: -ride.fare },
      });
    }

    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");
    const riderSocketId = onlineUsers[ride.userId.toString()];
    if (riderSocketId)
      io.to(riderSocketId).emit("rideCompleted", { rideId: ride._id });

    res.json({ message: "Ride completed" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/:rideId", Protect, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    res.json(ride);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Decline ride
router.post("/decline/:rideId", Protect, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Add driver to declined list if not already there
    if (!ride.driversDeclined.includes(req.user.id)) {
      ride.driversDeclined.push(req.user.id);
      await ride.save();
    }

    res.json({ message: "Ride declined" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

async function notifyDriversInBatches(ride, io, onlineUsers) {
  const BATCH_RANGES = [3000, 6000, 10000, 15000, 20000];
  const BATCH_WAIT = 30000; // 30 seconds

  const cycle = async () => {
    // Stop if ride no longer searching
    const currentRide = await Ride.findById(ride._id);
    if (!currentRide || currentRide.status !== "Searching") return;

    // Get all drivers within 20km, correct vehicle type, not declined
    const allDrivers = await User.find({
      role: "driver",
      isOnline: true,
      available: true,
      vehicleType: currentRide.vehicleType,
      _id: { $nin: currentRide.driversDeclined },
    })
      .where("location")
      .near({
        center: {
          type: "Point",
          coordinates: currentRide.pickup.coordinates,
        },
        maxDistance: 20000,
      });

    if (allDrivers.length === 0) {
      // No drivers at all, retry after 30s
      setTimeout(cycle, BATCH_WAIT);
      return;
    }

    // Notify in batches by distance
    let batchIndex = 0;

    const notifyNextBatch = async () => {
      const fresh = await Ride.findById(ride._id);
      if (!fresh || fresh.status !== "Searching") return;

      if (batchIndex >= BATCH_RANGES.length) {
        // All batches done, restart cycle
        setTimeout(cycle, BATCH_WAIT);
        return;
      }

      const maxDist = BATCH_RANGES[batchIndex];
      const minDist = batchIndex === 0 ? 0 : BATCH_RANGES[batchIndex - 1];

      const batch = allDrivers.filter((d) => {
        const [dLng, dLat] = d.location.coordinates;
        const [pLng, pLat] = fresh.pickup.coordinates;
        const dist = getDistanceMeters(dLat, dLng, pLat, pLng);
        return dist >= minDist && dist < maxDist;
      });

      batch.forEach((driver) => {
        const socketId = onlineUsers[driver._id.toString()];
        if (socketId) {
          io.to(socketId).emit("newRideRequest", {
            rideId: fresh._id,
            pickup: fresh.pickup,
            destination: fresh.destination,
            destinationName: fresh.destinationName,
            vehicleType: fresh.vehicleType,
            notes: fresh.notes,
          });
        }
      });

      batchIndex++;
      setTimeout(notifyNextBatch, BATCH_WAIT);
    };

    notifyNextBatch();
  };

  cycle();
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
module.exports = router;
