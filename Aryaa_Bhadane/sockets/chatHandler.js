const { addMessageToHistory } = require('../utils/messageStore');

/**
 * Format current timestamp as HH:MM
 * @returns {string} Formatted time string
 */
function getFormattedTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Socket.io Messaging, Direct Messaging & Typing Indicator Handler
 * @param {object} io - Socket.io Server instance
 * @param {object} socket - Connected Socket instance
 * @param {Map} connectedUsers - Map of socketId -> user details
 */
module.exports = function chatHandler(io, socket, connectedUsers) {
  // 1. Group Chat Messaging: chat:send
  socket.on('chat:send', (data) => {
    if (!data || !data.room || !data.message || !data.message.trim()) return;

    const user = connectedUsers.get(socket.id);
    const sender = user ? user.username : 'Anonymous';
    const avatar = user ? user.avatar : 'avatar1.png';
    const room = data.room;

    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender,
      avatar,
      message: data.message.trim(),
      timestamp: getFormattedTimestamp()
    };

    // Store in message history buffer
    addMessageToHistory(room, messageObj);

    // Broadcast message to all members in room (including the sender)
    io.to(room).emit('chat:receive', messageObj);

    console.log(`[CHAT:SEND] [${room}] ${sender}: ${data.message.trim()}`);
  });

  // 2. Typing Indicator Start: typing:start
  socket.on('typing:start', (data) => {
    if (!data || !data.room) return;
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    // Broadcast to everyone in the room except the sender
    socket.to(data.room).emit('typing:update', {
      username: user.username,
      isTyping: true
    });
  });

  // 3. Typing Indicator Stop: typing:stop
  socket.on('typing:stop', (data) => {
    if (!data || !data.room) return;
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    // Broadcast to everyone in the room except the sender
    socket.to(data.room).emit('typing:update', {
      username: user.username,
      isTyping: false
    });
  });

  // 4. Private Direct Messaging: direct:send
  socket.on('direct:send', (data) => {
    if (!data || !data.recipientId || !data.message || !data.message.trim()) return;

    const senderUser = connectedUsers.get(socket.id);
    const senderName = senderUser ? senderUser.username : 'Anonymous';
    const senderAvatar = senderUser ? senderUser.avatar : 'avatar1.png';
    const timestamp = getFormattedTimestamp();
    const recipientUser = connectedUsers.get(data.recipientId);

    const directMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      from: senderName,
      fromId: socket.id,
      fromAvatar: senderAvatar,
      message: data.message.trim(),
      timestamp
    };

    // Deliver only to the intended recipient socket
    io.to(data.recipientId).emit('direct:receive', directMessage);

    // Acknowledge back to sender socket so sender UI can render their outgoing DM
    socket.emit('direct:sent', {
      id: directMessage.id,
      to: recipientUser ? recipientUser.username : 'User',
      toId: data.recipientId,
      message: data.message.trim(),
      timestamp
    });

    console.log(`[DIRECT:SEND] DM from ${senderName} -> ${recipientUser ? recipientUser.username : data.recipientId}: ${data.message.trim()}`);
  });
};
