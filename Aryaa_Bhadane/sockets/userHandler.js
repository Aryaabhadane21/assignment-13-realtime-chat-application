const { getRoomHistory } = require('../utils/messageStore');

/**
 * Helper to get active users in a specific room
 * @param {Map} connectedUsers 
 * @param {string} room 
 * @returns {Array} Array of user objects { id, username, avatar }
 */
function getRoomUsers(connectedUsers, room) {
  const users = [];
  for (const [, user] of connectedUsers) {
    if (user.currentRoom === room) {
      users.push({
        id: user.id,
        username: user.username,
        avatar: user.avatar
      });
    }
  }
  return users;
}

/**
 * Socket.io User & Room Management Handler
 * @param {object} io - Socket.io Server instance
 * @param {object} socket - Connected Socket instance
 * @param {Map} connectedUsers - Map of socketId -> user details
 */
module.exports = function userHandler(io, socket, connectedUsers) {
  // 1. User Login: Registers user identity and socket mapping
  socket.on('user:login', (data) => {
    const username = (data && data.username ? data.username.trim() : `User_${socket.id.substring(0, 4)}`);
    const avatar = (data && data.avatar) ? data.avatar : 'avatar1.png';

    const userObj = {
      id: socket.id,
      username,
      avatar,
      currentRoom: null
    };

    connectedUsers.set(socket.id, userObj);

    // Confirm login back to client
    socket.emit('user:login:success', {
      id: socket.id,
      username: userObj.username,
      avatar: userObj.avatar
    });

    // Also emit global active users list or log if needed
    console.log(`[LOGIN] User "${username}" (${socket.id}) logged in.`);
  });

  // 2. Room Join: Joins a specific chat channel
  socket.on('room:join', (data) => {
    if (!data || !data.room) return;
    const room = data.room;
    const user = connectedUsers.get(socket.id);

    if (!user) {
      console.warn(`[ROOM:JOIN] Socket ${socket.id} attempted to join ${room} without logging in.`);
      return;
    }

    const previousRoom = user.currentRoom;

    // Leave previous room if switching
    if (previousRoom && previousRoom !== room) {
      socket.leave(previousRoom);
      // Notify previous room typing stop
      socket.to(previousRoom).emit('typing:update', {
        username: user.username,
        isTyping: false
      });
      // Broadcast updated userlist in old room
      io.to(previousRoom).emit('room:userlist', {
        room: previousRoom,
        users: getRoomUsers(connectedUsers, previousRoom).map(u => ({ id: u.id, username: u.username, avatar: u.avatar }))
      });
    }

    // Join new room
    socket.join(room);
    user.currentRoom = room;

    console.log(`[ROOM:JOIN] ${user.username} joined #${room}`);

    // Emit recent message history buffer to joined user only
    const history = getRoomHistory(room);
    socket.emit('room:history', {
      room,
      messages: history
    });

    // Broadcast updated online users list in the room to everyone in the room
    const roomUsers = getRoomUsers(connectedUsers, room);
    io.to(room).emit('room:userlist', {
      room,
      users: roomUsers
    });
  });

  // 3. Room Leave: Leaves a specific chat channel
  socket.on('room:leave', (data) => {
    if (!data || !data.room) return;
    const room = data.room;
    const user = connectedUsers.get(socket.id);

    if (!user) return;

    socket.leave(room);
    if (user.currentRoom === room) {
      user.currentRoom = null;
    }

    // Inform room that user stopped typing
    socket.to(room).emit('typing:update', {
      username: user.username,
      isTyping: false
    });

    console.log(`[ROOM:LEAVE] ${user.username} left #${room}`);

    // Broadcast updated online userlist in the room
    const roomUsers = getRoomUsers(connectedUsers, room);
    io.to(room).emit('room:userlist', {
      room,
      users: roomUsers
    });
  });

  // 4. Disconnect Handling: Clean up presence on disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`[DISCONNECT] User "${user.username}" (${socket.id}) disconnected.`);
      const lastRoom = user.currentRoom;

      // Remove user from store
      connectedUsers.delete(socket.id);

      if (lastRoom) {
        // Clear typing indicator for this user in their last room
        socket.to(lastRoom).emit('typing:update', {
          username: user.username,
          isTyping: false
        });

        // Broadcast updated room userlist
        const remainingUsers = getRoomUsers(connectedUsers, lastRoom);
        io.to(lastRoom).emit('room:userlist', {
          room: lastRoom,
          users: remainingUsers
        });
      }
    }
  });
};
