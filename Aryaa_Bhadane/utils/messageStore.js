// In-Memory Chat State for Message Histories
const roomHistories = {
  "general": [],
  "developers": [],
  "random": [],
  "gaming": [],
  "tech": []
};

const MAX_HISTORY = 50;

/**
 * Adds a message object to the specified room's history buffer.
 * Keeps only the last MAX_HISTORY (50) messages using a sliding window.
 * @param {string} room - The room name
 * @param {object} messageObj - The message object { id, sender, avatar, message, timestamp }
 */
function addMessageToHistory(room, messageObj) {
  if (!roomHistories[room]) {
    roomHistories[room] = [];
  }
  roomHistories[room].push(messageObj);
  if (roomHistories[room].length > MAX_HISTORY) {
    roomHistories[room].shift();
  }
}

/**
 * Retrieves the recent message history for a given room.
 * @param {string} room - The room name
 * @returns {Array} List of recent message objects
 */
function getRoomHistory(room) {
  if (!roomHistories[room]) {
    roomHistories[room] = [];
  }
  return [...roomHistories[room]];
}

module.exports = {
  roomHistories,
  MAX_HISTORY,
  addMessageToHistory,
  getRoomHistory
};
