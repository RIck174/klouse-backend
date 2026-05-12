const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");
const rideRoutes = require("./routes/rideRoutes");
const userRoutes = require("./routes/userRoutes");
const Settings = require("./Models/Settings");
const http = require("http");
const initSocket = require("./socket");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["https://klouse-frontend.vercel.app", "http://localhost:5173"],
    credentials: true,
  }),
);

app.use(express.json());
app.use("/auth", authRoutes);
app.use("/ride", rideRoutes);
app.use("/user", userRoutes);
app.get("/", (req, res) => {
  res.send("Backend is running");
});

const server = http.createServer(app);

const { io, onlineUsers } = initSocket(server);
app.set("io", io);
app.set("onlineUsers", onlineUsers);

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDb");
    await Settings.findOneAndUpdate(
      { key: "fare_config" },
      { value: { baseFare: 5, ratePerKm: 2.5 } },
      { upsert: true }, // create if doesn't exist, don't overwrite if it does
    );

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => console.log("Failed to connect to MongoDB", err));
