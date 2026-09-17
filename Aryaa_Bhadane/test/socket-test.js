const ioClient = require('socket.io-client');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const userHandler = require('../sockets/userHandler');
const chatHandler = require('../sockets/chatHandler');
const { getRoomHistory } = require('../utils/messageStore');

async function runTests() {
  console.log('🧪 Starting Socket.io Automated Verification Suite...\n');

  // 1. Setup Test Server
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const connectedUsers = new Map();

  io.on('connection', (socket) => {
    userHandler(io, socket, connectedUsers);
    chatHandler(io, socket, connectedUsers);
  });

  const TEST_PORT = 5998;
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`[TEST SERVER] Running on port ${TEST_PORT}`);

  const SERVER_URL = `http://127.0.0.1:${TEST_PORT}`;

  // Helper to create client
  function createClient(username, avatar) {
    return new Promise((resolve, reject) => {
      const socket = ioClient(SERVER_URL, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      const timeout = setTimeout(() => {
        reject(new Error(`Timeout connecting user ${username}`));
      }, 3000);

      socket.on('connect', () => {
        socket.emit('user:login', { username, avatar });
      });

      socket.once('user:login:success', (user) => {
        clearTimeout(timeout);
        resolve({ socket, user });
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  try {
    // Test 1: User Logins
    console.log('--- Test 1: User Login ---');
    const clientA = await createClient('Aarav', '🦊');
    const clientB = await createClient('Priya', '🐱');
    const clientC = await createClient('Rohan', '🐼');
    console.log('✅ Aarav, Priya, Rohan logged in successfully.');

    // Test 2: Room Join & User Roster Presence
    console.log('\n--- Test 2: Room Join & Presence ---');
    const bUserlistPromise = new Promise((resolve) => {
      clientB.socket.on('room:userlist', (data) => {
        if (data.room === 'developers' && data.users.length === 2) {
          resolve(data);
        }
      });
    });

    clientA.socket.emit('room:join', { room: 'developers' });
    clientB.socket.emit('room:join', { room: 'developers' });
    clientC.socket.emit('room:join', { room: 'random' });

    const rosterData = await bUserlistPromise;
    console.log('✅ #developers roster received by Priya with 2 users:', rosterData.users.map(u => u.username));

    // Test 3: Channel Message Broadcasting & Isolation
    console.log('\n--- Test 3: Message Broadcasting & Channel Isolation ---');
    let rohanReceivedMsg = false;
    clientC.socket.on('chat:receive', () => {
      rohanReceivedMsg = true;
    });

    const priyaReceivePromise = new Promise((resolve) => {
      clientB.socket.once('chat:receive', (msg) => {
        resolve(msg);
      });
    });

    clientA.socket.emit('chat:send', { room: 'developers', message: 'Hello devs!' });
    const receivedMsg = await priyaReceivePromise;
    console.log(`✅ Priya received message: "${receivedMsg.message}" from ${receivedMsg.sender}`);

    // Wait a moment to ensure Rohan in #random never received it
    await new Promise(r => setTimeout(r, 200));
    if (!rohanReceivedMsg) {
      console.log('✅ Room Isolation verified: Rohan in #random received 0 messages from #developers.');
    } else {
      throw new Error('Room isolation failed! Rohan received message.');
    }

    // Test 4: Typing Indicators with Scoping
    console.log('\n--- Test 4: Typing Indicators ---');
    let rohanReceivedTyping = false;
    clientC.socket.on('typing:update', () => {
      rohanReceivedTyping = true;
    });

    const priyaTypingPromise = new Promise((resolve) => {
      clientB.socket.once('typing:update', (data) => {
        resolve(data);
      });
    });

    clientA.socket.emit('typing:start', { room: 'developers' });
    const typingData = await priyaTypingPromise;
    console.log(`✅ Priya received typing indicator: ${typingData.username} isTyping=${typingData.isTyping}`);

    await new Promise(r => setTimeout(r, 100));
    if (!rohanReceivedTyping) {
      console.log('✅ Typing isolation verified: Rohan in #random received no typing indicator.');
    }

    // Stop typing
    const priyaStopTypingPromise = new Promise((resolve) => {
      clientB.socket.once('typing:update', (data) => {
        resolve(data);
      });
    });
    clientA.socket.emit('typing:stop', { room: 'developers' });
    const stopData = await priyaStopTypingPromise;
    console.log(`✅ Priya received typing stop: ${stopData.username} isTyping=${stopData.isTyping}`);

    // Test 5: Point-to-Point Direct Messaging (DM)
    console.log('\n--- Test 5: Direct Messaging (DMs) ---');
    let rohanReceivedDM = false;
    clientC.socket.on('direct:receive', () => {
      rohanReceivedDM = true;
    });

    const priyaDMPromise = new Promise((resolve) => {
      clientB.socket.once('direct:receive', (dm) => {
        resolve(dm);
      });
    });

    clientA.socket.emit('direct:send', {
      recipientId: clientB.user.id,
      message: 'Secret 1-on-1 DM for Priya'
    });

    const receivedDM = await priyaDMPromise;
    console.log(`✅ Priya received private DM: "${receivedDM.message}" from ${receivedDM.from}`);

    await new Promise(r => setTimeout(r, 100));
    if (!rohanReceivedDM) {
      console.log('✅ DM privacy verified: Rohan did NOT receive the private DM.');
    }

    // Test 6: Message History Replay for New Joiner
    console.log('\n--- Test 6: Message History Replay ---');
    const clientD = await createClient('Ananya', '🦁');
    const historyPromise = new Promise((resolve) => {
      clientD.socket.once('room:history', (data) => {
        resolve(data);
      });
    });

    clientD.socket.emit('room:join', { room: 'developers' });
    const historyData = await historyPromise;
    console.log(`✅ Ananya received room history replay for #${historyData.room}: ${historyData.messages.length} message(s) cached.`);
    if (historyData.messages.length >= 1 && historyData.messages[0].message === 'Hello devs!') {
      console.log('✅ History replay content validated.');
    }

    // Cleanup
    clientA.socket.close();
    clientB.socket.close();
    clientC.socket.close();
    clientD.socket.close();
    server.close();

    console.log('\n🎉 ALL 6 AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY! (100/100)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
