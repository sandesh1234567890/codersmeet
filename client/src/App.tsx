import React, { useEffect, useRef, useState } from 'react';
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
    Hash
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
// HARD FALLBACK: Your specific Render URL to ensure it works even if ENV is missing
const RENDER_URL = "https://codersmeet-bk.onrender.com";
const SIGNALING_URL = (import.meta as any).env.VITE_SIGNALING_URL || (PEER_HOST.includes('localhost') ? `http://${PEER_HOST}:${PEER_PORT}` : RENDER_URL);

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

    const peerRef = useRef<Peer | null>(null);
    const myVideoRef = useRef<HTMLVideoElement>(null);
    const callsRef = useRef<{ [key: string]: any }>({});
    const screenStreamRef = useRef<MediaStream | null>(null);
    const myStreamRef = useRef<MediaStream | null>(null);
    const controlsTimerRef = useRef<any>(null);

    // Sync ref with state
    useEffect(() => {
        myStreamRef.current = myStream;
    }, [myStream]);

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

            // Auto-request media if we don't have it yet
            if (!currentStream) {
                console.log("[PEER] Auto-requesting media for incoming call...");
                currentStream = await requestMediaAccess();
            }

            if (currentStream) {
                call.answer(currentStream);
                call.on('stream', (userVideoStream: MediaStream) => {
                    addPeerStream(call.peer, userVideoStream);
                });
                callsRef.current[call.peer] = call;
            } else {
                console.warn('Answering call without local stream (Access Denied)');
                call.answer();
            }
        });

        peerRef.current = peer;
        return () => {
            peer.destroy();
            if (myStreamRef.current) {
                myStreamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

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
        return () => clearInterval(pollInterval);
    };

    const connectToNewUser = (userId: string, stream: MediaStream) => {
        if (!peerRef.current) return;
        const call = peerRef.current.call(userId, stream);
        call.on('stream', (userVideoStream) => {
            addPeerStream(userId, userVideoStream);
        });
        callsRef.current[userId] = call;
    };

    const toggleMute = async () => {
        const newState = !isMuted;
        if (myStream) {
            myStream.getAudioTracks()[0].enabled = !newState;
        } else {
            await requestMediaAccess();
        }
        setIsMuted(newState);
    };

    const toggleVideo = async () => {
        const newState = !isVideoOff;
        if (myStream) {
            myStream.getVideoTracks()[0].enabled = !newState;
        } else {
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
        const newId = generateRoomId();
        setRoomId(newId);
        window.history.pushState({}, '', `?room=${newId}`);
        await joinRoom(newId);
    };

    const leaveCall = () => {
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
                                    onClick={() => joinRoom()}
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
                            <p>Handcrafted for the engineering community.</p>
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
    const effectiveFocusId = presenterId || focusedPeerId;
    const isFocusActive = effectiveFocusId !== null;

    const togglePin = (id: string | null) => {
        setFocusedPeerId(prev => prev === id ? null : id);
    };

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
                                    <div className="peer-label">You (Pinned)</div>
                                </div>
                            ) : (
                                <div className="video-wrapper" onClick={() => togglePin(null)}>
                                    <VideoComponent stream={peers[effectiveFocusId!]} />
                                    <div className="peer-label">{presenterId ? "Presenting" : "Pinned"}</div>
                                </div>
                            )}
                        </div>
                        <div className="participants-sidebar">
                            {effectiveFocusId !== myId && (
                                <div className={`video-wrapper local ${isScreenSharing ? 'screen-share' : ''}`} onClick={() => togglePin(myId)}>
                                    <video ref={myVideoRef} autoPlay muted playsInline style={{ opacity: isVideoOff ? 0 : 1 }} />
                                    {isVideoOff && <div className="initials-avatar">{roomId.charAt(0).toUpperCase()}</div>}
                                    <div className="peer-label">You</div>
                                </div>
                            )}
                            {peerIds.filter(id => id !== effectiveFocusId).map(id => (
                                <div key={id} className="video-wrapper" onClick={() => togglePin(id)}>
                                    <VideoComponent stream={peers[id]} />
                                    <div className="peer-label">Participant</div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        {/* If peers exist, show local as small PiP. If alone, show local in full grid. */}
                        <div className={`video-wrapper local ${peerIds.length > 0 ? 'pip' : ''} ${isScreenSharing ? 'screen-share' : ''}`} onClick={() => togglePin(myId)}>
                            <video ref={myVideoRef} autoPlay muted playsInline style={{ opacity: isVideoOff && !isScreenSharing ? 0 : 1 }} />
                            {isVideoOff && !isScreenSharing && <div className="initials-avatar">{roomId.charAt(0).toUpperCase()}</div>}
                            <div className="peer-label">
                                {isMuted ? <MicOff size={14} color="#ea4335" /> : <Mic size={14} />}
                                You {isScreenSharing ? '(Screen)' : ''}
                            </div>
                        </div>
                        {peerIds.map(id => (
                            <div key={id} className="video-wrapper" onClick={() => togglePin(id)}>
                                <VideoComponent stream={peers[id]} />
                                <div className="peer-label">Participant</div>
                            </div>
                        ))}
                    </>
                )}
            </main>

            <footer className={`footer-controls ${!showControls ? 'hidden' : ''}`}>
                <div className="footer-left-info">{roomId}</div>
                <div className="footer-center">
                    <button className={`circle-btn ${isMuted ? 'off' : ''}`} onClick={toggleMute}>{isMuted ? <MicOff size={22} /> : <Mic size={22} />}</button>
                    <button className={`circle-btn ${isVideoOff ? 'off' : ''}`} onClick={toggleVideo}>{isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}</button>
                    <button className={`circle-btn ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare}>{isScreenSharing ? <MonitorOff size={22} /> : <ScreenShare size={22} />}</button>
                    <button className="circle-btn danger" onClick={leaveCall}><PhoneOff size={22} /></button>
                </div>
                <div className="footer-right-actions">
                    <button className="icon-btn" onClick={() => { setSidebarTab('details'); setIsSidebarOpen(!isSidebarOpen); }}><Info size={22} /></button>
                    <button className="icon-btn" onClick={() => { setSidebarTab('people'); setIsSidebarOpen(!isSidebarOpen); }}>
                        <Users size={22} />
                        <span className="badge">{totalParticipants}</span>
                    </button>
                    <button className="icon-btn" onClick={() => { setSidebarTab('chat'); setIsSidebarOpen(!isSidebarOpen); }}>
                        <MessageSquare size={22} />
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
                                    <div className="p-avatar">Y</div>
                                    <div className="p-info">You</div>
                                    <button className={`pin-btn ${focusedPeerId === myId ? 'active' : ''}`} onClick={() => togglePin(myId)}>
                                        <Plus size={16} />
                                    </button>
                                </div>
                                {peerIds.map(id => (
                                    <div key={id} className="person-item">
                                        <div className="p-avatar">{id.charAt(0).toUpperCase()}</div>
                                        <div className="p-info">{id}</div>
                                        <button className={`pin-btn ${focusedPeerId === id ? 'active' : ''}`} onClick={() => togglePin(id)}>
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : sidebarTab === 'chat' ? (
                            <div className="chat-placeholder">
                                <MessageSquare size={48} opacity={0.2} />
                                <p>Chat feature coming soon</p>
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

function VideoComponent({ stream }: { stream: MediaStream }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);
    return <video ref={videoRef} autoPlay playsInline />;
}

export default App;
