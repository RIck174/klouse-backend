const { Server } = require("socket.io");

// Store connected users
const onlineUsers = {};

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: ["https://klouse-frontend.vercel.app", "http://localhost:5173"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("New socket connected:", socket.id);

    // Register user
    socket.on("register", (userId) => {
      onlineUsers[userId] = socket.id;
      console.log("Registered:", userId);
    });

    // Join ride room
    socket.on("rideRoom", (rideId) => {
      socket.join(`ride_${rideId}`);
      console.log(`Socket ${socket.id} joined ride_${rideId}`);
    });

    // Driver movement
    socket.on("driverLocationUpdate", (data) => {
      const { rideId, lat, lng } = data;

      io.to(`ride_${rideId}`).emit("driverLocationUpdated", {
        lat,
        lng,
      });
    });

    //

    socket.on("driverLocation", ({ rideId, lat, lng }) => {
      io.to(rideId).emit("driverLocationUpdated", { lat, lng });
    });

    // Rider movement
    socket.on("riderLocationUpdate", (data) => {
      const { rideId, lat, lng } = data;

      io.to(`ride_${rideId}`).emit("riderMoved", {
        lat,
        lng,
      });
    });

    socket.on("disconnect", () => {
      for (let userId in onlineUsers) {
        if (onlineUsers[userId] === socket.id) {
          delete onlineUsers[userId];
          break;
        }
      }

      console.log("User disconnected:", socket.id);
    });
  });

  return { io, onlineUsers };
}

module.exports = initSocket;
