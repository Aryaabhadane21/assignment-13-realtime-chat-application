# 💬 Real-Time Group Chat & Direct Messaging Engine (Socket.io)

> **Author:** Aryaa Bhadane  
> **Tech Stack:** Node.js, Express.js, Socket.io, In-Memory Message Buffer, CORS  

A scalable, high-performance real-time messaging application engineered with **Node.js, Express, and Socket.io**. Features multi-room group channels (`#general`, `#developers`, `#random`, `#gaming`, `#tech`), point-to-point private Direct Messaging (DMs), debounced typing indicators, active participant presence tracking, and instant message history replay (last 50 messages) without external database dependencies.

---

## 🌟 Key Features & Architectural Highlights

- **Multi-Channel Room Management:** Efficient channel isolation using `socket.join(roomName)` and `socket.leave(roomName)`.
- **Targeted Broadcasting vs Private DMs:** Selectively broadcasts room messages to channel participants via `io.to(room).emit()` while dispatching private 1-on-1 direct messages strictly point-to-point using `io.to(recipientSocketId).emit()`.
- **Debounced Typing Indicator Engine:** Real-time indicator (`typing:start`, `typing:stop`) with client-side 1.5s debounce timeout to prevent socket event flooding over the network.
- **Dynamic Presence & User Roster:** Real-time tracking of online participants per room, updating instantly on join, channel switch, or disconnect.
- **In-Memory Message History Buffer (50 Msgs):** Centralized sliding-window buffer (`MAX_HISTORY = 50`) providing instant history hydration (`room:history`) to new joiners.
- **Modern Dark-Themed UI:** Sleek glassmorphic dark interface with responsive sidebars, custom avatars, chat bubbles, and toast notifications.

---

## 🏗️ Project Directory Structure

```text
Aryaa_Bhadane/
├── public/
│   ├── index.html           # Multi-room chat UI with dark theme & DM modal
│   ├── app.js               # Client socket event listeners, debounce logic & UI updates
│   └── style.css            # Dark theme stylesheet, animations, and responsive layout
├── sockets/
│   ├── chatHandler.js       # Room messaging, DM & typing handlers
│   └── userHandler.js       # User login, room join/leave & disconnects
├── utils/
│   └── messageStore.js      # In-memory sliding buffer message store (MAX_HISTORY = 50)
├── server.js                # Express & Socket.io server bootstrap
├── package.json             # NPM dependencies and run scripts
├── .gitignore               # Ignored dependencies and environment files
└── README.md                # Project documentation and deployment guide
```

---

## 📡 Real-Time Socket Event Protocol

### 🔄 Session & Room Management

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `user:login` | `Client -> Server` | `{ "username": "Aarav", "avatar": "🦊" }` | Registers user identity and socket ID mapping |
| `user:login:success` | `Server -> Client` | `{ "id": "socket_123", "username": "Aarav", "avatar": "🦊" }` | Confirms registration to client |
| `room:join` | `Client -> Server` | `{ "room": "developers" }` | Joins a specific chat channel, leaving prior room |
| `room:history` | `Server -> Client` | `{ "room": "developers", "messages": [...] }` | Emits recent message history buffer to joined user |
| `room:userlist` | `Server -> Room` | `{ "room": "developers", "users": [...] }` | Broadcasts updated online users list in the room |
| `room:leave` | `Client -> Server` | `{ "room": "developers" }` | Leaves the room |

### 💬 Messaging, Typing Indicators & DMs

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `chat:send` | `Client -> Server` | `{ "room": "developers", "message": "Hey everyone!" }` | Sends message to a room |
| `chat:receive` | `Server -> Room` | `{ "id": "msg_123", "sender": "Aarav", "avatar": "🦊", "message": "Hey everyone!", "timestamp": "14:32" }` | Broadcasts message to all members in room |
| `typing:start` | `Client -> Server` | `{ "room": "developers" }` | User started typing in room |
| `typing:stop` | `Client -> Server` | `{ "room": "developers" }` | User stopped typing or sent message |
| `typing:update` | `Server -> Room (broadcast.to)` | `{ "username": "Aarav", "isTyping": true }` | Displays "Aarav is typing..." to other room members |
| `direct:send` | `Client -> Server` | `{ "recipientId": "socket_id_xyz", "message": "Secret DM" }` | Sends private direct message |
| `direct:receive` | `Server -> Client` | `{ "id": "dm_123", "from": "Aarav", "fromId": "socket_id", "fromAvatar": "🦊", "message": "Secret DM", "timestamp": "14:35" }` | Delivered only to intended recipient socket |
| `direct:sent` | `Server -> Client` | `{ "id": "dm_123", "to": "Priya", "toId": "socket_id", "message": "Secret DM", "timestamp": "14:35" }` | Confirms DM delivery back to sender |

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v16.x or higher)
- npm (v8.x or higher)

### Installation & Run

1. **Navigate into the project directory:**
   ```bash
   cd Desktop/assignment-13-realtime-chat-application/Aryaa_Bhadane
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   # Using nodemon for hot-reloading
   npm run dev

   # Or standard start
   npm start
   ```

4. **Open in your browser:**
   ```
   http://localhost:5000
   ```

---

## 🧪 Multi-Tab Verification & Test Plan

Follow these steps to test all real-time capabilities:

1. **Start the server:** Ensure `server.js` is running on `http://localhost:5000`.
2. **Open 3 Browser Tabs/Windows:**
   - **Tab 1:** Login as **Aarav** (🦊) and join `#developers`.
   - **Tab 2:** Login as **Priya** (🐱) and join `#developers`.
   - **Tab 3:** Login as **Rohan** (🐼) and join `#random`.
3. **Channel Isolation & Real-Time Messaging:**
   - In Tab 1 (Aarav), send: `"Hello Dev Team!"` in `#developers`.
   - Verify Tab 2 (Priya) receives the message instantly in `#developers`.
   - Verify Tab 3 (Rohan in `#random`) does **not** receive the message.
4. **Debounced Typing Indicator Verification:**
   - In Tab 1 (Aarav), begin typing in `#developers`.
   - Verify Tab 2 (Priya) sees `"Aarav is typing..."` with bouncing dots.
   - Verify Tab 3 (Rohan) in `#random` does **not** see any typing indicator.
   - Stop typing for 1.5 seconds; verify the indicator automatically disappears.
5. **Message History Replay:**
   - Open a **4th Browser Tab**: Login as **Ananya** (🦁) and join `#developers`.
   - Verify that all previously sent messages are immediately displayed from `room:history`.
6. **Private Direct Messaging (DM):**
   - In Tab 1 (Aarav), click **Priya** in the "Room Participants" roster.
   - Type `"Hey Priya, secret DM!"` and click **Send DM**.
   - Verify Tab 2 (Priya) receives a private DM toast notification and message.
   - Verify Tab 3 (Rohan) receives **no notification or message**.

---

## 🌐 Deploying to Render

### A. Repository Setup
1. Ensure all files are committed to your GitHub repository (`itm-assignment-13-chat-socket`).
2. Verify `server.js` listens to `process.env.PORT || 5000`.

### B. Create Web Service on Render
1. Go to [render.com](https://render.com) and click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. If the project is in a subdirectory, set **Root Directory** to `Aryaa_Bhadane`.
4. Configure build and start commands:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Click **Create Web Service**.

### C. WebSocket Notes for Render
- Render provides native WebSocket support over HTTPS/WSS automatically.
- *Note on Render Free Tier:* Free instances spin down during periods of inactivity. The first request after sleep may take ~30–50 seconds for cold start. Since this architecture uses in-memory storage, active state and room histories reset if the instance spins down.
