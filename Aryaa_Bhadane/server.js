const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const userHandler = require('./sockets/userHandler');
const chatHandler = require('./sockets/chatHandler');

const app = express();
const server = http.createServer(app);

// CORS configuration for REST & Socket.io
const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Socket.io
const io = new Server(server, {
  cors: corsOptions
});

// In-Memory User State (socketId -> { id, username, avatar, currentRoom })
const connectedUsers = new Map();

// Socket Connection Lifecycle
io.on('connection', (socket) => {
  console.log(`[CONNECT] New socket connected: ${socket.id}`);

  // Register Handlers
  userHandler(io, socket, connectedUsers);
  chatHandler(io, socket, connectedUsers);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    connectedUsersCount: connectedUsers.size,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Chat server running at http://localhost:${PORT}`);
});

module.exports = { app, server, io, connectedUsers };
