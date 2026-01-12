const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const toggleAudio = document.getElementById('toggleAudio');
const toggleVideo = document.getElementById('toggleVideo');
const shareScreen = document.getElementById('shareScreen');
const hangup = document.getElementById('hangup');

const lobby = document.getElementById('lobby');
const callUI = document.getElementById('call-ui');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const roomNameDisplay = document.getElementById('roomNameDisplay');
const remoteStatus = document.getElementById('remoteStatus');

let localStream;
let peerConnection;
let socket;
let screenStream;
let currentRoom;

// Perfect Negotiation state
let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;
let polite = false;

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// Initialize WebSocket
function initWebSocket(roomId) {
    return new Promise((resolve) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/signal?room=${roomId}`);

        socket.onopen = () => console.log("WebSocket connected to room:", roomId);

        socket.onmessage = async ({ data }) => {
            try {
                const message = JSON.parse(data);
                console.log("Signaling message received:", message.type);

                if (message.type === 'role') {
                    polite = message.role === 'answerer';
                    console.log(`Assigned role: ${message.role} (polite: ${polite})`);
                    createPeerConnection();
                    resolve();
                } else if (message.type === 'peer-joined') {
                    console.log("New peer joined! Peer is now ready.");
                    if (!polite) { // Offerer (creator) initiates when someone joins
                        console.log("Initiating media stream and negotiation...");
                        startNegotiation();
                    }
                } else if (!peerConnection) {
                    console.warn("Received signaling message before PeerConnection was created. Ignoring.");
                    return;
                } else if (message.type === 'description') {
                    const description = new RTCSessionDescription(message.sdp);
                    const offerCollision = (description.type === 'offer') &&
                        (makingOffer || peerConnection.signalingState !== 'stable');

                    ignoreOffer = !polite && offerCollision;
                    if (ignoreOffer) {
                        console.log("Collision detected: Ignoring offer (impolite)");
                        return;
                    }

                    if (offerCollision) {
                        console.log("Collision detected: Rolling back for polite peer");
                        await Promise.all([
                            peerConnection.setLocalDescription({ type: 'rollback' }),
                            peerConnection.setRemoteDescription(description)
                        ]);
                    } else {
                        await peerConnection.setRemoteDescription(description);
                    }

                    if (description.type === 'offer') {
                        await peerConnection.setLocalDescription();
                        socket.send(JSON.stringify({ type: 'description', sdp: peerConnection.localDescription }));
                    }
                } else if (message.type === 'candidate') {
                    try {
                        console.log("Adding ICE candidate");
                        await peerConnection.addIceCandidate(message.candidate);
                    } catch (err) {
                        if (!ignoreOffer) console.error("Error adding candidate:", err);
                    }
                } else if (message.type === 'chat') {
                    appendMessage(message.text, 'received');
                }
            } catch (err) {
                console.error("Signaling error:", err);
            }
        };

        socket.onclose = () => {
            console.log("WebSocket closed");
        };
    });
}

async function joinRoom() {
    const roomId = roomInput.value.trim();
    if (!roomId) {
        roomInput.classList.add('error');
        setTimeout(() => roomInput.classList.remove('error'), 400);
        return;
    }

    currentRoom = roomId;
    roomNameDisplay.innerText = `Room: ${roomId}`;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        // Transition UI
        lobby.classList.add('app-hidden');
        callUI.classList.remove('app-hidden');

        await initWebSocket(roomId);

        // If I am the joiner (answerer/polite), I start immediately
        // The creator (offerer/impolite) waits for 'peer-joined'
        if (polite) {
            console.log("Joined as answerer, starting negotiation immediately...");
            startNegotiation();
        } else {
            console.log("Joined as creator, waiting for peer to join...");
        }
    } catch (err) {
        console.error("Failed to join room:", err);
        alert("Could not access camera/microphone. Please check permissions.");
    }
}

function startNegotiation() {
    if (!peerConnection || !localStream) {
        console.warn("Cannot start negotiation: PC or localStream missing");
        return;
    }

    // Check if tracks are already added to avoid duplicates
    const senders = peerConnection.getSenders();
    if (senders.length === 0) {
        console.log("Adding tracks to PeerConnection");
        for (const track of localStream.getTracks()) {
            peerConnection.addTrack(track, localStream);
        }
    } else {
        console.log("Tracks already added, negotiation should trigger via onnegotiationneeded or restartIce");
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onnegotiationneeded = async () => {
        try {
            makingOffer = true;
            await peerConnection.setLocalDescription();
            socket.send(JSON.stringify({ type: 'description', sdp: peerConnection.localDescription }));
        } catch (err) {
            console.error(err);
        } finally {
            makingOffer = false;
        }
    };

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            socket.send(JSON.stringify({ type: 'candidate', candidate }));
        }
    };

    peerConnection.ontrack = (event) => {
        console.log("Remote track received:", event.track.kind);
        const stream = event.streams[0];
        if (remoteVideo.srcObject !== stream) {
            remoteVideo.srcObject = stream;
            remoteStatus.classList.add('app-hidden');
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state: ${peerConnection.connectionState}`);
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            remoteStatus.innerText = "Peer disconnected";
            remoteStatus.classList.remove('app-hidden');
        }
    };
}

// Event Listeners
joinBtn.onclick = joinRoom;
roomInput.onkeypress = (e) => {
    if (e.key === 'Enter') joinRoom();
};

sendBtn.onclick = () => {
    const text = chatInput.value.trim();
    if (text && socket) {
        socket.send(JSON.stringify({ type: 'chat', text }));
        appendMessage(text, 'sent');
        chatInput.value = '';
    }
};

chatInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendBtn.onclick();
};

function appendMessage(text, side) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${side}`;
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Controls
toggleAudio.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudio.classList.toggle('active', !audioTrack.enabled);
        toggleAudio.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    }
};

toggleVideo.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideo.classList.toggle('active', !videoTrack.enabled);
        toggleVideo.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
};

shareScreen.onclick = async () => {
    try {
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);

            localVideo.srcObject = screenStream;
            screenTrack.onended = () => stopScreenShare();
            shareScreen.classList.add('active');
        } else {
            stopScreenShare();
        }
    } catch (err) {
        console.error("Error sharing screen:", err);
    }
};

function stopScreenShare() {
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
    localVideo.srcObject = localStream;

    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    shareScreen.classList.remove('active');
}

hangup.onclick = () => {
    location.reload();
};
