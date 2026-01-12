const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const toggleAudio = document.getElementById('toggleAudio');
const toggleVideo = document.getElementById('toggleVideo');
const shareScreen = document.getElementById('shareScreen');
const hangup = document.getElementById('hangup');

let localStream;
let peerConnection;
let socket;
let screenStream;

// Perfect Negotiation state
let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;
const polite = Math.random() > 0.5; // Simple random politeness for 2-peer test

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// Initialize WebSocket
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/signal`);

    socket.onmessage = async ({ data }) => {
        try {
            const message = JSON.parse(data);

            if (message.type === 'description') {
                const description = new RTCSessionDescription(message.sdp);
                const offerCollision = (description.type === 'offer') &&
                    (makingOffer || peerConnection.signalingState !== 'stable');

                ignoreOffer = !polite && offerCollision;
                if (ignoreOffer) return;

                await peerConnection.setRemoteDescription(description);
                if (description.type === 'offer') {
                    await peerConnection.setLocalDescription();
                    socket.send(JSON.stringify({ type: 'description', sdp: peerConnection.localDescription }));
                }
            } else if (message.type === 'candidate') {
                try {
                    await peerConnection.addIceCandidate(message.candidate);
                } catch (err) {
                    if (!ignoreOffer) throw err;
                }
            } else if (message.type === 'chat') {
                appendMessage(message.text, 'received');
            }
        } catch (err) {
            console.error(err);
        }
    };
}

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        initWebSocket();
        createPeerConnection();

        for (const track of localStream.getTracks()) {
            peerConnection.addTrack(track, localStream);
        }
    } catch (err) {
        console.error("Failed to start call:", err);
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

    peerConnection.ontrack = ({ streams: [stream] }) => {
        if (remoteVideo.srcObject !== stream) {
            remoteVideo.srcObject = stream;
        }
    };
}

// Chat functions
sendBtn.onclick = () => {
    const text = chatInput.value.trim();
    if (text && socket) {
        socket.send(JSON.stringify({ type: 'chat', text }));
        appendMessage(text, 'sent');
        chatInput.value = '';
    }
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
    if (peerConnection) peerConnection.close();
    if (socket) socket.close();
    location.reload();
};

startCall();
