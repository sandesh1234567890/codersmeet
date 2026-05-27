const express = require('express');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');

const app = express();
app.use(cors());

// Map of roomId -> { peers: Set of peerIds, adminId: string, globalPinnedId: string | null }
const rooms = new Map();
// Map of peerId -> roomId
const peerToRoom = new Map();
// Map of roomId -> presenterPeerId (screen share)
const presenters = new Map();

const PORT = process.env.PORT || 3040;

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Signaling server running on port ${PORT}`);
});

const peerServer = ExpressPeerServer(server, {
    path: '/',
    allow_discovery: true,
    debug: true
});

app.use('/peerjs', peerServer);

// Health check/Ping endpoint to prevent sleep
app.get('/ping', (req, res) => {
    res.send('pong');
});

// Discovery API for room-based mesh topology
app.get('/rooms', (req, res) => {
    const activeRooms = Array.from(rooms.entries()).map(([id, data]) => ({
        id,
        count: data.peers.size
    }));
    console.log(`[DISCOVERY] Polling active rooms: ${activeRooms.length} found`);
    res.json(activeRooms);
});

app.get('/room-info/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.get(roomId);
    if (room) {
        res.json({
            adminId: room.adminId,
            globalPinnedId: room.globalPinnedId,
            presenterId: presenters.get(roomId) || null
        });
    } else {
        res.status(404).json({ error: "Room not found" });
    }
});

app.get('/peers/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = rooms.get(roomId);
    const presenterId = presenters.get(roomId) || null;

    if (room) {
        res.json({
            peers: Array.from(room.peers),
            presenterId,
            adminId: room.adminId,
            globalPinnedId: room.globalPinnedId
        });
    } else {
        res.json({ peers: [], presenterId: null, adminId: null, globalPinnedId: null });
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

app.post('/set-pin/:roomId/:peerId', (req, res) => {
    const { roomId, peerId } = req.params;
    const room = rooms.get(roomId);
    if (room) {
        // In a real app, verify requester is admin. Here we trust the UI.
        room.globalPinnedId = (peerId === 'none' ? null : peerId);
        console.log(`[PIN] Global pin in ${roomId} set to ${peerId}`);
        res.sendStatus(200);
    } else {
        res.status(404).send("Room not found");
    }
});

peerServer.on('connection', (client) => {
    const id = client.getId();
    console.log(`Client connected to signaling: ${id}`);
});

app.post('/join/:roomId/:peerId', (req, res) => {
    const { roomId, peerId } = req.params;

    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            peers: new Set(),
            adminId: peerId, // First one to join is admin
            globalPinnedId: null
        });
        console.log(`[ADMIN] Peer ${peerId} is the admin of room ${roomId}`);
    }
    
    rooms.get(roomId).peers.add(peerId);
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
        const room = rooms.get(roomId);
        room.peers.delete(id);
        
        if (presenters.get(roomId) === id) {
            presenters.delete(roomId);
        }
        
        if (room.globalPinnedId === id) {
            room.globalPinnedId = null;
        }

        if (room.peers.size === 0) {
            console.log(`[CLEANUP] Room ${roomId} is now empty. Removing.`);
            rooms.delete(roomId);
            presenters.delete(roomId);
        } else if (room.adminId === id) {
            // Assign next available peer as admin
            room.adminId = Array.from(room.peers)[0];
            console.log(`[ADMIN] New admin for ${roomId}: ${room.adminId}`);
        }
    }
    peerToRoom.delete(id);
});
