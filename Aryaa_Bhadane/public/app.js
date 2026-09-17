/**
 * PulseChat - Client-Side Real-Time Engine (Socket.io)
 * Handles authentication, multi-room channels, typing debounce, participant roster & direct messaging.
 */

// Initialize Socket.io client (works automatically for same-origin or configured URL)
const socket = io();

// ================= STATE MANAGEMENT =================
const state = {
  currentUser: {
    id: null,
    username: '',
    avatar: '🦊'
  },
  currentRoom: 'general',
  roomUsers: [],
  isTyping: false,
  typingTimeout: null,
  unreadCounts: {
    general: 0,
    developers: 0,
    random: 0,
    gaming: 0,
    tech: 0
  },
  activeDmRecipient: null, // { id, username, avatar }
  directMessages: {} // recipientSocketId -> [ { from, to, message, timestamp, isSelf } ]
};

// ================= DOM ELEMENTS =================
const DOM = {
  // Login
  loginModal: document.getElementById('loginModal'),
  loginForm: document.getElementById('loginForm'),
  usernameInput: document.getElementById('usernameInput'),
  avatarSelector: document.getElementById('avatarSelector'),

  // App Layout
  appContainer: document.getElementById('appContainer'),
  currentUserAvatar: document.getElementById('currentUserAvatar'),
  currentUsername: document.getElementById('currentUsername'),
  currentUserSocketId: document.getElementById('currentUserSocketId'),

  // Channels
  channelList: document.getElementById('channelList'),
  activeRoomTitle: document.getElementById('activeRoomTitle'),
  activeRoomDescription: document.getElementById('activeRoomDescription'),
  roomUsersCount: document.getElementById('roomUsersCount'),
  welcomeTitle: document.getElementById('welcomeTitle'),
  welcomeSubtitle: document.getElementById('welcomeSubtitle'),

  // Chat
  messagesContainer: document.getElementById('messagesContainer'),
  chatForm: document.getElementById('chatForm'),
  messageInput: document.getElementById('messageInput'),
  typingContent: document.getElementById('typingContent'),
  typingText: document.getElementById('typingText'),

  // Participant Roster
  rosterList: document.getElementById('rosterList'),
  rosterBadgeCount: document.getElementById('rosterBadgeCount'),
  rosterSidebar: document.getElementById('rosterSidebar'),
  toggleParticipantsBtn: document.getElementById('toggleParticipantsBtn'),

  // Direct Messaging
  dmModal: document.getElementById('dmModal'),
  closeDmModalBtn: document.getElementById('closeDmModalBtn'),
  dmModalAvatar: document.getElementById('dmModalAvatar'),
  dmModalTitle: document.getElementById('dmModalTitle'),
  dmModalSubtitle: document.getElementById('dmModalSubtitle'),
  dmHistoryContainer: document.getElementById('dmHistoryContainer'),
  dmSendForm: document.getElementById('dmSendForm'),
  dmMessageInput: document.getElementById('dmMessageInput'),
  dmConversationsList: document.getElementById('dmConversationsList'),

  // Toasts
  toastContainer: document.getElementById('toastContainer')
};

// Channel descriptions
const channelDescriptions = {
  general: 'Welcome to the general discussion room',
  developers: 'Tech talk, code snippets, architecture and debugging',
  random: 'Casual banter, memes, off-topic thoughts and fun',
  gaming: 'Game recommendations, streams, esports and multiplayer',
  tech: 'Gadgets, AI, hardware, open source, and emerging technology'
};

// ================= INITIALIZATION & LOGIN =================

// Select Avatar
DOM.avatarSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('.avatar-option');
  if (!btn) return;
  document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
  btn.classList.add('selected');
  state.currentUser.avatar = btn.dataset.avatar;
});

// Submit Login
DOM.loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = DOM.usernameInput.value.trim();
  if (!username) return;

  state.currentUser.username = username;

  // Emit user:login event according to protocol specification
  socket.emit('user:login', {
    username: state.currentUser.username,
    avatar: state.currentUser.avatar
  });
});

// Login Success from Server
socket.on('user:login:success', (userData) => {
  state.currentUser.id = userData.id;
  state.currentUser.username = userData.username;
  state.currentUser.avatar = userData.avatar;

  // Update UI profile header
  DOM.currentUserAvatar.textContent = state.currentUser.avatar;
  DOM.currentUsername.textContent = state.currentUser.username;
  DOM.currentUserSocketId.textContent = `ID: ${state.currentUser.id.substring(0, 8)}...`;

  // Hide Modal & Show Chat Interface
  DOM.loginModal.classList.add('hidden');
  DOM.appContainer.classList.remove('hidden');

  // Join initial default room (#general)
  joinRoom('general');
});

// ================= ROOM MANAGEMENT =================

/**
 * Switch or join a chat room
 * @param {string} roomName 
 */
function joinRoom(roomName) {
  if (state.currentRoom === roomName && DOM.messagesContainer.children.length > 1) {
    return;
  }

  // Clear typing indicators
  stopTyping();
  hideTypingIndicator();

  state.currentRoom = roomName;

  // Reset unread count for this room
  state.unreadCounts[roomName] = 0;
  updateUnreadBadge(roomName);

  // Update active UI channel item
  document.querySelectorAll('.channel-item').forEach(item => {
    item.classList.toggle('active', item.dataset.room === roomName);
  });

  // Update header text
  DOM.activeRoomTitle.textContent = roomName;
  DOM.activeRoomDescription.textContent = channelDescriptions[roomName] || `Channel #${roomName}`;
  DOM.messageInput.placeholder = `Message #${roomName}...`;
  DOM.messageInput.focus();

  // Update welcome banner
  DOM.welcomeTitle.textContent = `Welcome to #${roomName}!`;
  DOM.welcomeSubtitle.textContent = `This is the start of the #${roomName} channel. Messages and history are synchronized in real-time.`;

  // Clear previous room messages (keep welcome banner)
  clearMessagesExceptBanner();

  // Emit room:join event
  socket.emit('room:join', { room: roomName });
}

// Channel click handler
DOM.channelList.addEventListener('click', (e) => {
  const item = e.target.closest('.channel-item');
  if (!item) return;
  const room = item.dataset.room;
  if (room) {
    joinRoom(room);
  }
});

// Mobile participant toggle
if (DOM.toggleParticipantsBtn) {
  DOM.toggleParticipantsBtn.addEventListener('click', () => {
    DOM.rosterSidebar.classList.toggle('open');
  });
}

// ================= SOCKET EVENT LISTENERS =================

// 1. Room History Replay (room:history)
socket.on('room:history', (data) => {
  if (!data || data.room !== state.currentRoom) return;

  clearMessagesExceptBanner();

  if (Array.isArray(data.messages)) {
    data.messages.forEach(msg => {
      appendChatMessage(msg, false);
    });
    scrollToBottom();
  }
});

// 2. Active User List (room:userlist)
socket.on('room:userlist', (data) => {
  if (!data || data.room !== state.currentRoom) return;

  const users = data.users || [];
  state.roomUsers = users;

  // Update participant count in header & roster badge
  const countText = `${users.length} online`;
  DOM.roomUsersCount.textContent = countText;
  DOM.rosterBadgeCount.textContent = users.length;

  // Render Roster List
  renderRosterList(users);
});

// 3. Receive Room Message (chat:receive)
socket.on('chat:receive', (msg) => {
  if (!msg) return;

  // Check if message belongs to current room or if we need to show badge
  appendChatMessage(msg, true);
  scrollToBottom();
});

// 4. Typing Indicator Update (typing:update)
socket.on('typing:update', (data) => {
  if (!data) return;

  if (data.isTyping) {
    DOM.typingText.textContent = `${data.username} is typing...`;
    DOM.typingContent.classList.remove('hidden');
  } else {
    hideTypingIndicator();
  }
});

// 5. Receive Direct Message (direct:receive)
socket.on('direct:receive', (dm) => {
  if (!dm) return;

  // Store in directMessages store
  const fromSocketId = dm.fromId;
  if (!state.directMessages[fromSocketId]) {
    state.directMessages[fromSocketId] = [];
  }

  state.directMessages[fromSocketId].push({
    from: dm.from,
    avatar: dm.fromAvatar || '👤',
    message: dm.message,
    timestamp: dm.timestamp,
    isSelf: false
  });

  // Update DM conversation list in sidebar
  updateDmConversationList(fromSocketId, dm.from, dm.fromAvatar || '👤', dm.message);

  // If DM modal is currently open with this sender, render message immediately
  if (state.activeDmRecipient && state.activeDmRecipient.id === fromSocketId) {
    appendDmMessage({
      from: dm.from,
      avatar: dm.fromAvatar || '👤',
      message: dm.message,
      timestamp: dm.timestamp,
      isSelf: false
    });
  } else {
    // Show Toast Notification
    showToast(`💬 DM from ${dm.from}`, dm.message, true);
  }
});

// 6. Confirmation of Sent Direct Message (direct:sent)
socket.on('direct:sent', (dm) => {
  if (!dm) return;

  const toSocketId = dm.toId;
  if (!state.directMessages[toSocketId]) {
    state.directMessages[toSocketId] = [];
  }

  state.directMessages[toSocketId].push({
    from: state.currentUser.username,
    avatar: state.currentUser.avatar,
    message: dm.message,
    timestamp: dm.timestamp,
    isSelf: true
  });

  // Update DM conversation list in sidebar
  updateDmConversationList(toSocketId, dm.to, '👤', `You: ${dm.message}`);

  // If modal is open with recipient, append message
  if (state.activeDmRecipient && state.activeDmRecipient.id === toSocketId) {
    appendDmMessage({
      from: state.currentUser.username,
      avatar: state.currentUser.avatar,
      message: dm.message,
      timestamp: dm.timestamp,
      isSelf: true
    });
  }
});

// ================= TYPING INDICATOR & DEBOUNCE =================

DOM.messageInput.addEventListener('input', () => {
  handleTyping();
});

/**
 * Debounced typing indicator logic
 * Emits typing:start on first keystroke, sets 1.5s timeout to emit typing:stop
 */
function handleTyping() {
  if (!state.isTyping) {
    state.isTyping = true;
    socket.emit('typing:start', { room: state.currentRoom });
  }

  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => {
    stopTyping();
  }, 1500);
}

function stopTyping() {
  if (state.isTyping) {
    state.isTyping = false;
    socket.emit('typing:stop', { room: state.currentRoom });
  }
  clearTimeout(state.typingTimeout);
}

function hideTypingIndicator() {
  DOM.typingContent.classList.add('hidden');
}

// ================= SENDING MESSAGES =================

DOM.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = DOM.messageInput.value.trim();
  if (!text) return;

  // Immediately stop typing indicator on message send
  stopTyping();

  // Emit chat:send event according to protocol specification
  socket.emit('chat:send', {
    room: state.currentRoom,
    message: text
  });

  DOM.messageInput.value = '';
  DOM.messageInput.focus();
});

// ================= RENDERING HELPERS =================

function clearMessagesExceptBanner() {
  const banner = document.getElementById('welcomeBanner');
  DOM.messagesContainer.innerHTML = '';
  if (banner) {
    DOM.messagesContainer.appendChild(banner);
  }
}

/**
 * Appends a chat message item to the message stream
 * @param {object} msg { id, sender, avatar, message, timestamp }
 * @param {boolean} animate 
 */
function appendChatMessage(msg, animate = true) {
  const isSelf = (msg.sender === state.currentUser.username);
  
  const msgEl = document.createElement('div');
  msgEl.className = `message-item ${isSelf ? 'self-message' : ''}`;
  if (!animate) msgEl.style.animation = 'none';

  const avatar = msg.avatar || '👤';

  msgEl.innerHTML = `
    <div class="message-avatar" title="${escapeHtml(msg.sender)}">${avatar}</div>
    <div class="message-body">
      <div class="message-meta">
        <span class="message-sender">${escapeHtml(msg.sender)}</span>
        <span class="message-time">${escapeHtml(msg.timestamp || '')}</span>
      </div>
      <div class="message-bubble">${escapeHtml(msg.message)}</div>
    </div>
  `;

  DOM.messagesContainer.appendChild(msgEl);
}

function scrollToBottom() {
  DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

/**
 * Render room participant roster
 * @param {Array} users 
 */
function renderRosterList(users) {
  DOM.rosterList.innerHTML = '';

  users.forEach(user => {
    const isMe = (user.id === socket.id || user.username === state.currentUser.username);
    const li = document.createElement('li');
    li.className = 'roster-item';
    li.dataset.userId = user.id;
    li.dataset.username = user.username;
    li.dataset.avatar = user.avatar || '👤';

    li.innerHTML = `
      <div class="roster-user-info">
        <div class="roster-avatar">
          ${user.avatar || '👤'}
          <span class="status-dot"></span>
        </div>
        <span class="roster-name">${escapeHtml(user.username)} ${isMe ? '<span class="you-tag">(You)</span>' : ''}</span>
      </div>
      ${!isMe ? '<button class="dm-trigger-btn">DM</button>' : ''}
    `;

    // Click to start Direct Message with this user
    if (!isMe) {
      li.addEventListener('click', () => {
        openDmModal({
          id: user.id,
          username: user.username,
          avatar: user.avatar || '👤'
        });
      });
    }

    DOM.rosterList.appendChild(li);
  });
}

function updateUnreadBadge(room) {
  const badge = document.getElementById(`unread-${room}`);
  if (!badge) return;
  const count = state.unreadCounts[room] || 0;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ================= DIRECT MESSAGING MODAL & FLOW =================

function openDmModal(recipient) {
  state.activeDmRecipient = recipient;
  DOM.dmModalAvatar.textContent = recipient.avatar || '👤';
  DOM.dmModalTitle.textContent = `Direct Message with ${recipient.username}`;
  DOM.dmModalSubtitle.textContent = `Socket ID: ${recipient.id.substring(0, 10)}... (Private 1-on-1)`;

  // Render previous DM history with this user
  renderDmHistory(recipient.id);

  DOM.dmModal.classList.remove('hidden');
  DOM.dmMessageInput.value = '';
  DOM.dmMessageInput.focus();
}

DOM.closeDmModalBtn.addEventListener('click', () => {
  DOM.dmModal.classList.add('hidden');
  state.activeDmRecipient = null;
});

DOM.dmSendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = DOM.dmMessageInput.value.trim();
  if (!text || !state.activeDmRecipient) return;

  // Emit direct:send event according to protocol specification
  socket.emit('direct:send', {
    recipientId: state.activeDmRecipient.id,
    message: text
  });

  DOM.dmMessageInput.value = '';
  DOM.dmMessageInput.focus();
});

function renderDmHistory(recipientId) {
  DOM.dmHistoryContainer.innerHTML = '';
  const history = state.directMessages[recipientId] || [];

  if (history.length === 0) {
    DOM.dmHistoryContainer.innerHTML = `<div class="empty-state" style="color: var(--text-dim); text-align: center; margin-top: 40px; font-size: 0.85rem;">No messages exchanged yet. Send a secret DM below!</div>`;
    return;
  }

  history.forEach(dm => {
    appendDmMessage(dm);
  });
}

function appendDmMessage(dm) {
  const emptyState = DOM.dmHistoryContainer.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const isSelf = dm.isSelf;
  const msgEl = document.createElement('div');
  msgEl.className = `message-item ${isSelf ? 'self-message' : ''}`;
  msgEl.style.maxWidth = '100%';

  msgEl.innerHTML = `
    <div class="message-avatar" style="width: 32px; height: 32px; font-size: 1.2rem;">${dm.avatar || '👤'}</div>
    <div class="message-body">
      <div class="message-meta">
        <span class="message-sender">${escapeHtml(dm.from)}</span>
        <span class="message-time">${escapeHtml(dm.timestamp || '')}</span>
      </div>
      <div class="message-bubble dm-bubble">${escapeHtml(dm.message)}</div>
    </div>
  `;

  DOM.dmHistoryContainer.appendChild(msgEl);
  DOM.dmHistoryContainer.scrollTop = DOM.dmHistoryContainer.scrollHeight;
}

function updateDmConversationList(recipientId, recipientName, recipientAvatar, previewText) {
  const existing = document.getElementById(`dm-item-${recipientId}`);
  const emptyHint = DOM.dmConversationsList.querySelector('.empty-dm-hint');
  if (emptyHint) emptyHint.remove();

  if (existing) {
    existing.querySelector('.dm-conv-preview').textContent = previewText;
  } else {
    const li = document.createElement('li');
    li.className = 'dm-conversation-item';
    li.id = `dm-item-${recipientId}`;
    li.innerHTML = `
      <span class="dm-conv-avatar">${recipientAvatar || '👤'}</span>
      <div style="display: flex; flex-direction: column; overflow: hidden; flex: 1;">
        <span class="dm-conv-name" style="font-weight: 600; font-size: 0.85rem;">${escapeHtml(recipientName)}</span>
        <span class="dm-conv-preview" style="font-size: 0.72rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(previewText)}</span>
      </div>
    `;

    li.addEventListener('click', () => {
      openDmModal({
        id: recipientId,
        username: recipientName,
        avatar: recipientAvatar
      });
    });

    DOM.dmConversationsList.appendChild(li);
  }
}

// ================= TOAST NOTIFICATION UTILITY =================

function showToast(title, body, isDm = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isDm ? 'dm-toast' : ''}`;
  toast.innerHTML = `
    <div class="toast-icon">${isDm ? '🔒' : '🔔'}</div>
    <div class="toast-content">
      <span class="toast-title">${escapeHtml(title)}</span>
      <span class="toast-body">${escapeHtml(body)}</span>
    </div>
  `;

  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ================= HTML ESCAPE UTILITY =================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
