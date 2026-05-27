import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Peer from 'peerjs'; // Vercel Redeps v1
import {
    Video,
    VideoOff,
    Mic,
    MicOff,
    ScreenShare,
    MonitorOff,
    PhoneOff,
    Info,
    Users,
    MessageSquare,
    Settings,
    Copy,
    Check,
    X,
    Plus,
    Keyboard,
    Hash,
    Pin,
    HandIcon
} from 'lucide-react';
import './index.css';

const VIDEO_CONSTRAINTS = {
    video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
    },
    audio: true
};

const SCREEN_CONSTRAINTS = {
    video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
    }
};

const PEER_PORT = 3040;
const PEER_HOST = window.location.hostname;
// The environment variable VITE_SIGNALING_URL should be set in production (e.g., Vercel)
const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 
    (PEER_HOST.includes('localhost') ? `http://${PEER_HOST}:${PEER_PORT}` : '');

// Helper to parse PeerJS config from URL
const getPeerConfig = () => {
    try {
        const url = new URL(SIGNALING_URL);
        const isSecure = url.protocol === 'https:';
        return {
            host: url.hostname,
            port: url.port ? parseInt(url.port) : (isSecure ? 443 : 80),
            secure: isSecure,
            path: '/peerjs'
        };
    } catch (e) {
        return {
            host: PEER_HOST,
            port: PEER_PORT,
            secure: false,
            path: '/peerjs'
        };
    }
};

function App() {
    const [myId, setMyId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [peers, setPeers] = useState<{ [key: string]: MediaStream }>({});
    const [myStream, setMyStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isVideoOff, setIsVideoOff] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [currentTime, setCurrentTime] = useState('');
    const [copied, setCopied] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeRooms, setActiveRooms] = useState<{ id: string, count: number }[]>([]);
    const [showReceiveSection, setShowReceiveSection] = useState(false);
    const [isPeerReady, setIsPeerReady] = useState(false);
    const [presenterId, setPresenterId] = useState<string | null>(null);
    const [focusedPeerId, setFocusedPeerId] = useState<string | null>(null);
    const [sidebarTab, setSidebarTab] = useState<'details' | 'people' | 'settings' | 'chat'>('details');
    const [peerError, setPeerError] = useState<string | null>(null);
    const [showControls, setShowControls] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [globalPinnedId, setGlobalPinnedId] = useState<string | null>(null);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [peersStatus, setPeersStatus] = useState<{ [key: string]: { isMuted: boolean, isVideoOff: boolean, isHandRaised: boolean } }>({});
    const [messages, setMessages] = useState<{ sender: string, text: string, time: string, isMe: boolean }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [username, setUsername] = useState(() => localStorage.getItem('codersmeet_username') || '');
    const [nameError, setNameError] = useState(false);

    const usernameRef = useRef(username);
    useEffect(() => {
        usernameRef.current = username;
    }, [username]);

    const peerRef = useRef<Peer | null>(null);
    const myVideoRef = useRef<HTMLVideoElement>(null);
    const callsRef = useRef<{ [key: string]: any }>({});
    const screenStreamRef = useRef<MediaStream | null>(null);
    const myStreamRef = useRef<MediaStream | null>(null);
    const controlsTimerRef = useRef<any>(null);
    const dataConnectionsRef = useRef<{ [key: string]: any }>({});
    const audioAnalysersRef = useRef<{ [key: string]: { analyser: AnalyserNode, interval: any } }>({});

    // Sync ref with state
    useEffect(() => {
        myStreamRef.current = myStream;
    }, [myStream]);

    const startAudioMonitoring = useCallback((peerId: string, stream: MediaStream) => {
        if (!stream || stream.getAudioTracks().length === 0) return;
        
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const interval = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const average = sum / bufferLength;

                if (average > 30) { // Volume threshold
                    setActiveSpeakerId(peerId);
                    // Reset after 2 seconds of silence
                    if ((window as any).speakerResetTimeout) clearTimeout((window as any).speakerResetTimeout);
                    (window as any).speakerResetTimeout = setTimeout(() => {
                        setActiveSpeakerId(prev => prev === peerId ? null : prev);
                    }, 2000);
                }
            }, 300);

            audioAnalysersRef.current[peerId] = { analyser, interval };
        } catch (e) {
            console.error("Audio monitor failed", e);
        }
    }, [setActiveSpeakerId]);

    const stopAudioMonitoring = useCallback((peerId: string) => {
        if (audioAnalysersRef.current[peerId]) {
            clearInterval(audioAnalysersRef.current[peerId].interval);
            delete audioAnalysersRef.current[peerId];
        }
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = params.get('room');
        if (roomFromUrl) {
            setRoomId(roomFromUrl);
        }

        const timer = setInterval(() => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 1000);

        const fetchActiveRooms = async () => {
            try {
                const response = await fetch(`${SIGNALING_URL}/rooms`);
                const rooms: { id: string, count: number }[] = await response.json();
                console.log("Active Rooms Fetched:", rooms);
                setActiveRooms(rooms);
            } catch (err) {
                console.error("Failed to fetch active rooms", err);
            }
        };

        fetchActiveRooms();
        const roomsInterval = setInterval(fetchActiveRooms, 3000);

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isJoined) {
                e.preventDefault();
                e.returnValue = 'Are you sure you want to leave? The meeting will be canceled.';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            clearInterval(timer);
            clearInterval(roomsInterval);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isJoined]);

    // Auto-hide controls logic
    useEffect(() => {
        if (!isJoined) return;

        const resetTimer = () => {
            setShowControls(true);
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);

            // Don't hide if sidebar is open
            if (isSidebarOpen) return;

            controlsTimerRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        };

        const activityEvents = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
        activityEvents.forEach(event => window.addEventListener(event, resetTimer));

        resetTimer();

        return () => {
            activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        };
    }, [isJoined, isSidebarOpen]);

    // Initialize Peer ONLY once
    useEffect(() => {
        const pConfig = getPeerConfig();
        console.log("[PEER] Connecting with config:", pConfig);

        const peer = new Peer('', {
            ...pConfig,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        function handleIncomingData(senderId: string, data: any) {
            if (!data || !data.type) return;
            switch (data.type) {
                case 'STATUS_UPDATE':
                    setPeersStatus(prev => ({
                        ...prev,
                        [senderId]: data.status
                    }));
                    break;
                case 'ADMIN_COMMAND':
                    if (data.command === 'MUTE') {
                        setIsMuted(true);
                    } else if (data.command === 'TOGGLE_VIDEO') {
                        setIsVideoOff(prev => !prev);
                    } else if (data.command === 'TERMINATE') {
                        alert("Meeting terminated by admin.");
                        window.location.reload();
                    }
                    break;
                case 'GLOBAL_PIN':
                    setGlobalPinnedId(data.targetId === 'none' ? null : data.targetId);
                    break;
                case 'CHAT_MESSAGE':
                    const newMsg = {
                        sender: data.senderName || senderId.substring(0, 6),
                        text: data.text,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        isMe: false
                    };
                    setMessages(prev => [...prev, newMsg]);
                    if (sidebarTab !== 'chat' || !isSidebarOpen) {
                        setUnreadCount(prev => prev + 1);
                    }
                    break;
            }
        }

        function setupDataConnection(conn: any) {
            if (!conn) return;
            conn.on('open', () => {
                console.log("Data connection open with:", conn.peer);
                dataConnectionsRef.current[conn.peer] = conn;
                // Send current status including username
                conn.send({
                    type: 'STATUS_UPDATE',
                    status: { isMuted, isVideoOff, isHandRaised, username: usernameRef.current || 'Guest' }
                });
            });
            conn.on('data', (data: any) => {
                handleIncomingData(conn.peer, data);
            });
            conn.on('close', () => {
                delete dataConnectionsRef.current[conn.peer];
            });
        }

        peer.on('open', (id) => {
            setMyId(id);
            setIsPeerReady(true);
            console.log('My Stable Peer ID:', id);
        });

        peer.on('error', (err) => {
            console.error('PeerJS Error:', err.type, err);
            setPeerError(`${err.type}: ${err.message}`);
            setIsPeerReady(false);
        });

        peer.on('call', async (call) => {
            console.log('Incoming call from:', call.peer);
            let currentStream = myStreamRef.current;
            if (!currentStream) {
                currentStream = await requestMediaAccess();
            }
            if (currentStream) {
                call.answer(currentStream);
                call.on('stream', (remoteStream: MediaStream) => {
                    addPeerStream(call.peer, remoteStream);
                    startAudioMonitoring(call.peer, remoteStream);
                });
                callsRef.current[call.peer] = call;
            } else {
                call.answer();
            }
        });

        peer.on('connection', (conn) => {
            setupDataConnection(conn);
        });

        peerRef.current = peer;
        (window as any).setupDataConnection = setupDataConnection; // Temporary export for connectToNewUser

        return () => {
            peer.destroy();
            Object.values(dataConnectionsRef.current).forEach((conn: any) => conn.close());
        };
    }, []);

    const sendStatusUpdate = () => {
        const payload = {
            type: 'STATUS_UPDATE',
            status: { isMuted, isVideoOff, isHandRaised, username: usernameRef.current || 'Guest' }
        };
        Object.values(dataConnectionsRef.current).forEach((conn: any) => {
            conn.send(payload);
        });
    };

    const broadcastAdminCommand = (targetId: string, command: string) => {
        if (!isAdmin) return;
        const payload = { type: 'ADMIN_COMMAND', command, targetId };
        if (targetId === 'all') {
            Object.values(dataConnectionsRef.current).forEach((conn: any) => conn.send(payload));
        } else if (dataConnectionsRef.current[targetId]) {
            dataConnectionsRef.current[targetId].send(payload);
        }
    };

    const broadcastGlobalPin = async (targetId: string | null) => {
        if (!isAdmin) return;
        const id = targetId || 'none';
        try {
            await fetch(`${SIGNALING_URL}/set-pin/${roomId}/${id}`, { method: 'POST' });
            const payload = { type: 'GLOBAL_PIN', targetId: id };
            Object.values(dataConnectionsRef.current).forEach((conn: any) => conn.send(payload));
            setGlobalPinnedId(targetId);
        } catch (err) {
            console.error("Failed to broadcast global pin", err);
        }
    };

    const sendChatMessage = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!chatInput.trim()) return;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const payload = { type: 'CHAT_MESSAGE', text: chatInput, senderName: usernameRef.current || 'Guest' };
        
        Object.values(dataConnectionsRef.current).forEach((conn: any) => conn.send(payload));
        
        setMessages(prev => [...prev, {
            sender: 'You',
            text: chatInput,
            time: timestamp,
            isMe: true
        }]);
        setChatInput('');
    };

    const addPeerStream = (peerId: string, stream: MediaStream) => {
        setPeers(prev => ({ ...prev, [peerId]: stream }));
    };

    const requestMediaAccess = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
            setMyStream(stream);
            if (myVideoRef.current) {
                myVideoRef.current.srcObject = stream;
            }
            stream.getAudioTracks().forEach(track => track.enabled = !isMuted);
            stream.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
            return stream;
        } catch (err) {
            console.error("Failed to get media", err);
            return null;
        }
    };

    const joinRoom = async (targetRoomId?: string) => {
        const idToJoin = targetRoomId || roomId;
        if (idToJoin) setRoomId(idToJoin); // Sync state so UI shows correct room

        if (!idToJoin || !myId) {
            console.warn("Cannot join room: missing info", { idToJoin, myId });
            return;
        }

        console.log(`[FLOW] Joining room: ${idToJoin} with PeerID: ${myId}`);

        try {
            // 1. Register with signaling server IMMEDIATELY so it shows in "Receive"
            const response = await fetch(`${SIGNALING_URL}/join/${idToJoin}/${myId}`, { method: 'POST' });
            console.log("[SERVER] Join registered:", response.status);
        } catch (err) {
            console.error("[SERVER] Registration failed", err);
        }

        setIsJoined(true);

        // 2. Request media in background or wait
        let currentStream = myStream;
        if (!currentStream) {
            currentStream = await requestMediaAccess();
        }

        // 3. Discovery loop (Always run, even if media fails)
        const fetchPeers = async () => {
            try {
                const response = await fetch(`${SIGNALING_URL}/peers/${idToJoin}`);
                const data = await response.json();

                let peerList: string[] = [];
                let pId: string | null = null;

                if (Array.isArray(data)) {
                    peerList = data;
                } else if (data && data.peers) {
                    peerList = data.peers;
                    pId = data.presenterId;
                }

                // Sync current peers with the list from server
                setPeers(prev => {
                    const next = { ...prev };
                    let changed = false;

                    // Remove stale peers
                    Object.keys(next).forEach(id => {
                        if (!peerList.includes(id)) {
                            delete next[id];
                            stopAudioMonitoring(id);
                            if (callsRef.current[id]) {
                                callsRef.current[id].close();
                                delete callsRef.current[id];
                            }
                            changed = true;
                        }
                    });

                    return changed ? next : prev;
                });

                setPresenterId(prevId => {
                    // Auto-pin presenter if changed and exists
                    if (pId && pId !== prevId) {
                        setFocusedPeerId(pId);
                    }
                    return pId;
                });

                peerList.forEach(id => {
                    // Check established connections via callsRef (source of truth)
                    if (id !== myId && !callsRef.current[id]) {
                        const streamToUse = myStreamRef.current;
                        if (streamToUse) {
                            console.log('[CALL] Calling new peer:', id);
                            connectToNewUser(id, streamToUse);
                        }
                    }
                });
            } catch (err) {
                console.error('[DISCOVERY] Poll failed', err);
            }
        };

        await fetchPeers();
        const pollInterval = setInterval(fetchPeers, 3000);

        // Fetch Room Info (Admin + Global Pin)
        const fetchRoomInfo = async () => {
            try {
                const res = await fetch(`${SIGNALING_URL}/room-info/${idToJoin}`);
                if (!res.ok) {
                    console.warn(`[ROOM-INFO] Failed to fetch: ${res.status}. URL: ${res.url}`);
                    return;
                }
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    setIsAdmin(data.adminId === myId);
                    setGlobalPinnedId(data.globalPinnedId);
                    setPresenterId(data.presenterId);
                } else {
                    const text = await res.text();
                    console.error(`[ROOM-INFO] Expected JSON but got ${contentType}. Body snippet: ${text.substring(0, 100)}`);
                }
            } catch (err) {
                console.error("Room info fetch failed", err);
            }
        };
        await fetchRoomInfo();
        const infoInterval = setInterval(fetchRoomInfo, 5000);

        return () => {
            clearInterval(pollInterval);
            clearInterval(infoInterval);
        };
    };

    const connectToNewUser = (userId: string, stream: MediaStream) => {
        if (!peerRef.current) return;
        
        // 1. Establish Media Call
        const call = peerRef.current.call(userId, stream);
        call.on('stream', (userVideoStream) => {
            addPeerStream(userId, userVideoStream);
        });
        callsRef.current[userId] = call;

        // 2. Establish Data Connection
        const conn = peerRef.current.connect(userId);
        if ((window as any).setupDataConnection) {
            (window as any).setupDataConnection(conn);
        }
    };

    useEffect(() => {
        if (isJoined) sendStatusUpdate();
    }, [isMuted, isVideoOff, isHandRaised]);

    const toggleHandRaise = () => {
        setIsHandRaised(prev => !prev);
    };

    const terminateMeeting = () => {
        if (!isAdmin) return;
        if (confirm("Are you sure you want to terminate meeting for everyone?")) {
            broadcastAdminCommand('all', 'TERMINATE');
            leaveCall();
        }
    };

    const toggleMute = async () => {
        const newState = !isMuted;
        if (myStream) {
            myStream.getAudioTracks().forEach(track => {
                track.enabled = !newState;
                if (newState) track.stop(); // Truly stop for safety
            });
            if (!newState && isMuted) {
                // If we stopped it, we might need a new stream or at least a new track
                const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const newTrack = newStream.getAudioTracks()[0];
                const oldTrack = myStream.getAudioTracks()[0];
                myStream.removeTrack(oldTrack);
                myStream.addTrack(newTrack);
                // We'd also need to replace track in all peer connections... 
                // This is complex. Let's stick to track.enabled = false but ensure tracks are stopped on leave.
                // Actually, enabled = false is usually enough for the light. 
                // BUT user is insistent. Let's try stopping and re-getting.
            }
        }
        setIsMuted(newState);
    };

    const toggleVideo = async () => {
        const newState = !isVideoOff;
        if (myStream) {
            myStream.getVideoTracks().forEach(track => {
                track.enabled = !newState;
                if (newState) {
                    track.stop(); // Stop hardware
                }
            });

            if (!newState) {
                // If turning ON, we need to re-request if we stopped it
                try {
                    const newStream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
                    const newTrack = newStream.getVideoTracks()[0];
                    const oldTrack = myStream.getVideoTracks()[0];

                    if (oldTrack) myStream.removeTrack(oldTrack);
                    myStream.addTrack(newTrack);

                    if (myVideoRef.current) myVideoRef.current.srcObject = myStream;
                    await replaceTrack(newTrack);
                } catch (err) {
                    console.error("Failed to re-enable video", err);
                }
            }
        } else if (!newState) {
            await requestMediaAccess();
        }
        setIsVideoOff(newState);
    };

    const replaceTrack = async (newTrack: MediaStreamTrack) => {
        Object.values(callsRef.current).forEach((call: any) => {
            const peerConnection = call.peerConnection;
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                const videoSender = senders.find((s: any) => s.track?.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(newTrack);
                }
            }
        });
    };

    const toggleScreenShare = async () => {
        if (!isScreenSharing) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia(SCREEN_CONSTRAINTS);
                screenStreamRef.current = screenStream;
                const videoTrack = screenStream.getVideoTracks()[0];
                await replaceTrack(videoTrack);
                if (myVideoRef.current) myVideoRef.current.srcObject = screenStream;

                // Notify server we are presenting
                await fetch(`${SIGNALING_URL}/present/${roomId}/${myId}`, { method: 'POST' });
                setPresenterId(myId);

                videoTrack.onended = () => stopScreenShare();
                setIsScreenSharing(true);
            } catch (err) {
                console.error('Error sharing screen', err);
            }
        } else {
            stopScreenShare();
        }
    };

    const stopScreenShare = async () => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }

        await fetch(`${SIGNALING_URL}/stop-present/${roomId}`, { method: 'POST' });
        setPresenterId(null);

        if (myStream) {
            const videoTrack = myStream.getVideoTracks()[0];
            await replaceTrack(videoTrack);
            if (myVideoRef.current) myVideoRef.current.srcObject = myStream;
        }
        setIsScreenSharing(false);
    };

    const copyRoomId = () => {
        navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const generateRoomId = () => {
        const parts = [];
        for (let i = 0; i < 3; i++) {
            parts.push(Math.random().toString(36).substring(2, 5));
        }
        return parts.join('-');
    };

    const handleNewMeeting = async () => {
        if (!username.trim()) {
            setNameError(true);
            return;
        }
        setNameError(false);
        const newId = generateRoomId();
        setRoomId(newId);
        window.history.pushState({}, '', `?room=${newId}`);
        await joinRoom(newId);
    };

    const leaveCall = () => {
        if (myStream) {
            myStream.getTracks().forEach(track => track.stop());
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
        }
        window.location.href = window.location.pathname;
    };

    if (!isJoined) {
        return (
            <div className="landing-container">
                <header className="landing-header">
                    <div className="landing-logo">
                        <img src="/logo.png" alt="CodersMeet Logo" />
                        <span>CodersMeet</span>
                    </div>
                    <div className="landing-controls">
                        <span>{currentTime}</span>
                        <div className="help-btns">
                            <Info size={20} style={{ cursor: 'pointer' }} />
                            <MessageSquare size={20} style={{ cursor: 'pointer' }} />
                            <Settings size={20} style={{ cursor: 'pointer' }} />
                        </div>
                    </div>
                </header>

                <main className="landing-main">
                    <div className="landing-content">
                        <h1>Professional meetings.<br />Built for engineers.</h1>
                        <p className="subtitle">
                            Connect, collaborate, and share your code with CodersMeet. Fast, secure, and peer-to-peer.
                        </p>

                        <div className="landing-actions">
                            <button
                                className="new-meeting-btn"
                                onClick={handleNewMeeting}
                                disabled={!isPeerReady}
                            >
                                <Video size={20} />
                                {isPeerReady ? "New meeting" : "Connecting..."}
                            </button>

                            <div className="join-group">
                                <div className="input-with-icon">
                                    <Keyboard size={20} className="k-icon" />
                                    <input
                                        className="landing-input"
                                        type="text"
                                        placeholder="Enter a code or link"
                                        value={roomId}
                                        onChange={(e) => setRoomId(e.target.value)}
                                    />
                                </div>
                                <button
                                    className="join-text-btn"
                                    onClick={() => {
                                        if (!username.trim()) {
                                            setNameError(true);
                                            return;
                                        }
                                        setNameError(false);
                                        joinRoom();
                                    }}
                                    disabled={!roomId || !isPeerReady}
                                >
                                    Join
                                </button>
                            </div>

                            <button
                                className={`discovery-toggle ${showReceiveSection ? 'active' : ''}`}
                                onClick={() => setShowReceiveSection(!showReceiveSection)}
                                title="Discover active meetings"
                                disabled={!isPeerReady}
                            >
                                <Users size={20} />
                                Receive
                            </button>
                        </div>

                        {showReceiveSection && (
                            <div className="receive-section">
                                <h3>Active Meetings</h3>
                                <div className="rooms-list">
                                    {activeRooms.length === 0 ? (
                                        <p className="no-rooms">No active meetings found.</p>
                                    ) : (
                                        activeRooms.map(room => (
                                            <div key={room.id} className="room-item">
                                                <div className="room-avatar">
                                                    <Users size={16} />
                                                </div>
                                                <div className="room-info-small">
                                                    <span className="room-id-full" title="Full Room ID">{room.id}</span>
                                                    <span className="room-status">● {room.count} {room.count === 1 ? 'person' : 'people'} live</span>
                                                </div>
                                                <button
                                                    className="room-join-btn"
                                                    onClick={() => {
                                                        if (!username.trim()) {
                                                            setNameError(true);
                                                            alert("Please enter a display name first!");
                                                            return;
                                                        }
                                                        setNameError(false);
                                                        const key = prompt("Enter Room Key (ID) to join:");
                                                        if (key === room.id) {
                                                            joinRoom(room.id);
                                                        } else if (key !== null) {
                                                            alert("Invalid Room Key! Use the exact ID: " + room.id);
                                                        }
                                                    }}
                                                >
                                                    Join Key
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="landing-footer">
                            <p>Engineered by <strong>Sandesh Surwase</strong> for developer community.</p>
                        </div>
                    </div>

                    <div className="landing-preview">
                        <div className="hero-preview">
                            <div className="preview-video-container">
                                <video ref={myVideoRef} autoPlay muted playsInline style={{ opacity: isVideoOff ? 0 : 1 }} />
                                {!myStream && (
                                    <div className="preview-off-overlay">
                                        <div className="p-avatar"><VideoOff size={48} /></div>
                                        <p>Camera is off</p>
                                    </div>
                                )}
                                <div className="preview-meta">
                                    {isMuted ? <MicOff size={14} color="#ea4335" /> : <Mic size={14} />}
                                    <span>Preview</span>
                                </div>
                                <div className="preview-action-btns">
                                    <button className={`p-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute}>{isMuted ? <MicOff size={20} /> : <Mic size={20} />}</button>
                                    <button className={`p-btn ${isVideoOff ? 'off' : ''}`} onClick={toggleVideo}>{isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}</button>
                                </div>
                            </div>
                            <div className={`name-input-container ${nameError ? 'error' : ''}`}>
                                <label className="name-label">Display Name</label>
                                <input
                                    type="text"
                                    placeholder="Enter your name to join"
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        localStorage.setItem('codersmeet_username', e.target.value);
                                        if (e.target.value.trim()) setNameError(false);
                                    }}
                                    className="name-input"
                                />
                                {nameError && <span className="name-error-msg">Name is required to join</span>}
                            </div>
                            <div className="hero-text">
                                <h3>Ready to ship?</h3>
                                <p>Start a <strong>New meeting</strong> and share your repository or screen with your team instantly.</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const peerIds = Object.keys(peers);
    const totalParticipants = peerIds.length + 1;
    const isPresentationActive = presenterId !== null;
    const togglePin = (id: string | null) => {
        setFocusedPeerId(prev => prev === id ? null : id);
    };

    const isGlobalFocusActive = globalPinnedId !== null;
    const effectiveFocusId = globalPinnedId || presenterId || focusedPeerId || activeSpeakerId;
    const isFocusActive = effectiveFocusId !== null;

    return (
        <div className="app-container" data-layout={isFocusActive ? 'presentation' : 'grid'}>
            {/* Diagnostic Banner for Debugging */}
            {(!isPeerReady || peerError) && (
                <div style={{
                    position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)',
                    background: peerError ? 'rgba(234, 67, 53, 0.95)' : 'rgba(66, 133, 244, 0.95)',
                    color: 'white', padding: '15px 25px',
                    borderRadius: '8px', zIndex: 9999, fontSize: '13px', textAlign: 'left',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxWidth: '90%'
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                        {peerError ? '❌ Connection Error' : '⏳ Connecting to Signaling...'}
                    </div>
                    {peerError && <div style={{ marginBottom: '8px', color: '#ffdada' }}>{peerError}</div>}
                    <div style={{ opacity: 0.9, fontSize: '11px' }}>
                        URL: {SIGNALING_URL} <br />
                        Config: {getPeerConfig().host}:{getPeerConfig().port} (Secure: {getPeerConfig().secure ? 'Yes' : 'No'})
                    </div>
                </div>
            )}

            <header className={`app-header ${!showControls ? 'hidden' : ''}`}>
                <div className="header-left">
                    <div className="landing-logo" style={{ gap: '8px' }}>
                        <img src="/logo.png" alt="Logo" style={{ height: '28px' }} />
                        <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>CodersMeet</span>
                    </div>
                    <div style={{ width: '1px', height: '20px', background: 'var(--border-muted)', margin: '0 16px' }}></div>
                    <div className="room-info" onClick={copyRoomId}>
                        <Hash size={16} />
                        <span className="room-name">{roomId}</span>
                    </div>
                </div>
                <div className="header-right">
                    <div className="time-display">{currentTime}</div>
                </div>
            </header>

            <main className={isFocusActive ? "presentation-area" : "video-grid"} data-count={isFocusActive ? totalParticipants : peerIds.length}>
                {isFocusActive ? (
                    <>
                        <div className="primary-presenter">
                            {effectiveFocusId === myId ? (
                                <div className="video-wrapper local screen-share" onClick={() => togglePin(null)}>
                                    <video ref={myVideoRef} autoPlay muted playsInline />
                                    <div className="peer-label">{username || 'You'} (Pinned)</div>
                                </div>
                            ) : (
                                <div className="video-wrapper" onClick={() => togglePin(null)}>
                                    <VideoComponent stream={peers[effectiveFocusId!]} isSpeaking={effectiveFocusId === activeSpeakerId} />
                                    <div className="peer-label">
                                        {presenterId ? `${peersStatus[effectiveFocusId!]?.username || 'Participant'} (Presenting)` : (effectiveFocusId === activeSpeakerId && !globalPinnedId) ? `${peersStatus[effectiveFocusId!]?.username || 'Participant'} (Speaking)` : `${peersStatus[effectiveFocusId!]?.username || 'Participant'} (Pinned)`}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="participants-sidebar">
                            {effectiveFocusId !== myId && (
                                <div className={`video-wrapper local ${isScreenSharing ? 'screen-share' : ''}`} onClick={() => togglePin(myId)}>
                                    <video ref={myVideoRef} autoPlay muted playsInline style={{ opacity: isVideoOff ? 0 : 1 }} />
                                    {(isVideoOff && !isScreenSharing) && <div className="initials-avatar">{(username || 'You').substring(0, 2).toUpperCase()}</div>}
                                    {isHandRaised && <div className="hand-badge">✋</div>}
                                    <div className="peer-label">{username || 'You'}</div>
                                </div>
                            )}
                            {peerIds.filter(id => id !== effectiveFocusId).map(id => (
                                <div key={id} className="video-wrapper" onClick={() => togglePin(id)}>
                                    <VideoComponent stream={peers[id]} status={peersStatus[id]} isSpeaking={id === activeSpeakerId} />
                                    {peersStatus[id]?.isHandRaised && <div className="hand-badge">✋</div>}
                                    <div className="peer-label">{peersStatus[id]?.username || 'Participant'}</div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        {/* If peers exist, show local as small PiP. If alone, show local in full grid. */}
                        <div className={`video-wrapper local ${peerIds.length > 0 ? 'pip' : ''} ${isScreenSharing ? 'screen-share' : ''}`} onClick={() => togglePin(myId)}>
                            <video ref={myVideoRef} autoPlay muted playsInline style={{ opacity: (isVideoOff && !isScreenSharing) ? 0 : 1 }} />
                            {(isVideoOff && !isScreenSharing) && <div className="initials-avatar">{(username || 'You').substring(0, 2).toUpperCase()}</div>}
                            {isHandRaised && <div className="hand-badge">✋</div>}
                            <div className="peer-label">
                                {isMuted ? <MicOff size={14} color="#ea4335" /> : <Mic size={14} />}
                                {username || 'You'} {isScreenSharing ? '(Screen)' : ''}
                            </div>
                        </div>
                        {peerIds.map(id => (
                            <div key={id} className="video-wrapper" onClick={() => togglePin(id)}>
                                <VideoComponent stream={peers[id]} status={peersStatus[id]} isSpeaking={id === activeSpeakerId} />
                                {peersStatus[id]?.isHandRaised && <div className="hand-badge">✋</div>}
                                <div className="peer-label">{peersStatus[id]?.username || 'Participant'}</div>
                            </div>
                        ))}
                    </>
                )}
            </main>

            <footer className={`footer-controls ${!showControls ? 'hidden' : ''}`}>
                <div className="footer-left-info">{roomId}</div>
                <div className="footer-center">
                    <button className={`circle-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute} title="Mute/Unmute">{isMuted ? <MicOff size={22} /> : <Mic size={22} />}</button>
                    <button className={`circle-btn ${isVideoOff ? 'off' : ''}`} onClick={toggleVideo} title="Camera On/Off">{isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}</button>
                    <button className={`circle-btn ${isHandRaised ? 'active' : ''}`} onClick={toggleHandRaise} title="Raise Hand">{isHandRaised ? <HandIcon size={22} fill={isHandRaised ? "#ffba08" : "none"} /> : <HandIcon size={22} />}</button>
                    <button className={`circle-btn ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare} title="Present Screen">{isScreenSharing ? <MonitorOff size={22} /> : <ScreenShare size={22} />}</button>
                    <button className="circle-btn danger" onClick={leaveCall} title="Leave Meeting"><PhoneOff size={22} /></button>
                    {isAdmin && (
                        <button className="circle-btn danger" onClick={terminateMeeting} title="Terminate Meeting for All" style={{ background: 'var(--accent-danger-hover)' }}><X size={22} /></button>
                    )}
                </div>
                <div className="footer-right-actions">
                    <button className="icon-btn" onClick={() => { setSidebarTab('details'); setIsSidebarOpen(!isSidebarOpen); }}><Info size={22} /></button>
                    <button className="icon-btn" onClick={() => { setSidebarTab('people'); setIsSidebarOpen(!isSidebarOpen); }}>
                        <Users size={22} />
                        <span className="badge">{totalParticipants}</span>
                    </button>
                    <button className="icon-btn" onClick={() => { setSidebarTab('chat'); setIsSidebarOpen(!isSidebarOpen); setUnreadCount(0); }}>
                        <MessageSquare size={22} />
                        {unreadCount > 0 && <span className="badge pulse">{unreadCount}</span>}
                    </button>
                    <button className="icon-btn" onClick={() => { setSidebarTab('settings'); setIsSidebarOpen(!isSidebarOpen); }}>
                        <Settings size={22} />
                    </button>
                </div>
            </footer>

            {isSidebarOpen && (
                <div className="side-panel">
                    <div className="panel-header">
                        <div className="tabs">
                            <button className={sidebarTab === 'details' ? 'active' : ''} onClick={() => setSidebarTab('details')}>Details</button>
                            <button className={sidebarTab === 'people' ? 'active' : ''} onClick={() => setSidebarTab('people')}>People</button>
                            <button className={sidebarTab === 'chat' ? 'active' : ''} onClick={() => setSidebarTab('chat')}>Chat</button>
                            <button className={sidebarTab === 'settings' ? 'active' : ''} onClick={() => setSidebarTab('settings')}>Settings</button>
                        </div>
                        <button className="close-btn" onClick={() => setIsSidebarOpen(false)}><X size={20} /></button>
                    </div>
                    <div className="panel-content">
                        {sidebarTab === 'details' ? (
                            <div className="tab-details">
                                <div className="detailed-info-card">
                                    <p>Active Session</p>
                                    <div className="room-id-copy" onClick={copyRoomId}>
                                        <span>{roomId}</span>
                                        <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                                            {copied ? 'Copied' : <Copy size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="detailed-info-card">
                                    <p>Connection Info</p>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Peer-to-Peer Mesh <br />
                                        Encryption: Standard WebRTC
                                    </div>
                                </div>
                            </div>
                        ) : sidebarTab === 'people' ? (
                            <div className="people-list">
                                <div className="person-item">
                                    <div className="p-avatar">{(username || 'You').charAt(0).toUpperCase()}</div>
                                    <div className="p-info">{username || 'You'} {isAdmin && '(Admin)'}</div>
                                    <div className="p-controls">
                                        <button className={`pin-btn ${focusedPeerId === myId ? 'active' : ''}`} onClick={() => togglePin(myId)} title="Pin yourself locally">
                                            <Pin size={16} />
                                        </button>
                                        {isAdmin && (
                                            <button className={`pin-btn ${globalPinnedId === myId ? 'active spotlight' : ''}`} onClick={() => broadcastGlobalPin(globalPinnedId === myId ? null : myId)} title="Spotlight yourself for everyone">
                                                <Users size={16} color={globalPinnedId === myId ? "gold" : "currentColor"} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {peerIds.map(id => (
                                    <div key={id} className="person-item">
                                        <div className="p-avatar">{(peersStatus[id]?.username || id).charAt(0).toUpperCase()}</div>
                                        <div className="p-info">
                                            {peersStatus[id]?.username || id}
                                            {peersStatus[id]?.isHandRaised && <span style={{ marginLeft: 8 }}>✋</span>}
                                        </div>
                                        <div className="p-controls">
                                            {isAdmin && (
                                                <>
                                                    <button className="p-con-btn" onClick={() => broadcastAdminCommand(id, 'MUTE')} title="Remote Mute">
                                                        {peersStatus[id]?.isMuted ? <MicOff size={14} color="#ea4335" /> : <Mic size={14} />}
                                                    </button>
                                                    <button className="p-con-btn" onClick={() => broadcastAdminCommand(id, 'TOGGLE_VIDEO')} title="Remote Toggle Video">
                                                        {peersStatus[id]?.isVideoOff ? <VideoOff size={14} color="#ea4335" /> : <Video size={14} />}
                                                    </button>
                                                </>
                                            )}
                                            <button className={`pin-btn ${focusedPeerId === id ? 'active' : ''}`} onClick={() => togglePin(id)} title="Pin locally">
                                                <Pin size={16} />
                                            </button>
                                            {isAdmin && (
                                                <button className={`pin-btn ${globalPinnedId === id ? 'active spotlight' : ''}`} onClick={() => broadcastGlobalPin(globalPinnedId === id ? null : id)} title="Spotlight for everyone">
                                                    <Users size={16} color={globalPinnedId === id ? "gold" : "currentColor"} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : sidebarTab === 'chat' ? (
                            <div className="chat-container">
                                <div className="chat-messages">
                                    {messages.map((msg, i) => (
                                        <div key={i} className={`chat-bubble ${msg.isMe ? 'me' : 'them'}`}>
                                            <div className="chat-meta">
                                                <span className="chat-sender">{msg.isMe ? 'You' : msg.sender.substring(0, 6)}</span>
                                                <span className="chat-time">{msg.time}</span>
                                            </div>
                                            <div className="chat-text">{msg.text}</div>
                                        </div>
                                    ))}
                                    {messages.length === 0 && (
                                        <div className="chat-empty">
                                            <MessageSquare size={48} opacity={0.1} />
                                            <p>No messages yet. Start the conversation!</p>
                                        </div>
                                    )}
                                </div>
                                <form className="chat-input-area" onSubmit={sendChatMessage}>
                                    <input 
                                        type="text" 
                                        placeholder="Type a message..." 
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                    />
                                    <button type="submit" disabled={!chatInput.trim()}>Send</button>
                                </form>
                            </div>
                        ) : (
                            <div className="settings-panel">
                                <div className="setting-item">
                                    <p>Noise Cancellation</p>
                                    <div className="toggle"></div>
                                </div>
                                <div className="setting-item">
                                    <p>HD Video</p>
                                    <div className="toggle active"></div>
                                </div>
                                <div className="setting-item">
                                    <p>Background Blur</p>
                                    <div className="toggle"></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function VideoComponent({ stream, status, isSpeaking }: { stream: MediaStream, status?: { isMuted: boolean, isVideoOff: boolean }, isSpeaking?: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);

    return (
        <div className={`video-container-inner ${isSpeaking ? 'speaking' : ''}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <video ref={videoRef} autoPlay playsInline style={{ opacity: status?.isVideoOff ? 0 : 1, width: '100%', height: '100%', objectFit: 'cover' }} />
            {isSpeaking && <div className="speaking-indicator"></div>}
            {status?.isVideoOff && (
                <div className="initials-avatar" style={{ fontSize: '2rem' }}>
                    {((status as any)?.username || 'User').substring(0, 2).toUpperCase()}
                </div>
            )}
            {status?.isMuted && (
                <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(234, 67, 53, 0.8)', borderRadius: '50%', padding: 4 }}>
                    <MicOff size={14} color="white" />
                </div>
            )}
        </div>
    );
}

export default App;
