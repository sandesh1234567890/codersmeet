const express = require('express');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');

const app = express();
app.use(cors());

// Map of roomId -> Set of peerIds
const rooms = new Map();
// Map of peerId -> roomId
const peerToRoom = new Map();
// Map of roomId -> presenterPeerId
const presenters = new Map();

const PORT = process.env.PORT || 3040;

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Signaling server running on port ${PORT}`);
});

const peerServer = ExpressPeerServer(server, {
    path: '/peerjs',
    allow_discovery: true,
    debug: true
});

app.use(peerServer);

// Health check/Ping endpoint to prevent sleep
app.get('/ping', (req, res) => {
    res.send('pong');
});

// Discovery API for room-based mesh topology
app.get('/rooms', (req, res) => {
    const activeRooms = Array.from(rooms.entries()).map(([id, peers]) => ({
        id,
        count: peers.size
    }));
    console.log(`[DISCOVERY] Polling active rooms: ${activeRooms.length} found`);
    res.json(activeRooms);
});

app.get('/peers/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const roomPeers = rooms.get(roomId);
    const presenterId = presenters.get(roomId) || null;

    if (roomPeers) {
        res.json({
            peers: Array.from(roomPeers),
            presenterId
        });
    } else {
        res.json({ peers: [], presenterId: null });
    }
});

app.post('/present/:roomId/:peerId', (req, res) => {
    const { roomId, peerId } = req.params;
    presenters.set(roomId, peerId);
    console.log(`[PRESENT] Peer ${peerId} is presenting in room ${roomId}`);
    res.sendStatus(200);
});

app.post('/stop-present/:roomId', (req, res) => {
    const { roomId } = req.params;
    presenters.delete(roomId);
    console.log(`[PRESENT] Presentation stopped in room ${roomId}`);
    res.sendStatus(200);
});

peerServer.on('connection', (client) => {
    const id = client.getId();
    console.log(`Client connected to signaling: ${id}`);

    // Note: We don't know the room yet. 
    // The client will need to "announce" their room via a separate call or we rely on the discovery ID.
    // However, in a simple mesh, the client can just tell the server its room when it joins.
});

app.post('/join/:roomId/:peerId', (req, res) => {
    const { roomId, peerId } = req.params;

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(peerId);
    peerToRoom.set(peerId, roomId);

    console.log(`[JOIN] Peer ${peerId} joined room ${roomId}`);
    console.log(`[DEBUG] Active rooms: ${Array.from(rooms.keys()).join(', ')}`);
    res.sendStatus(200);
});

peerServer.on('disconnect', (client) => {
    const id = client.getId();
    const roomId = peerToRoom.get(id);

    console.log(`[LEAVE] Client disconnected: ${id} from room ${roomId}`);

    if (roomId && rooms.has(roomId)) {
        rooms.get(roomId).delete(id);
        if (presenters.get(roomId) === id) {
            presenters.delete(roomId);
        }
        if (rooms.get(roomId).size === 0) {
            console.log(`[CLEANUP] Room ${roomId} is now empty. Removing.`);
            rooms.delete(roomId);
            presenters.delete(roomId);
        }
    }
    peerToRoom.delete(id);
});
