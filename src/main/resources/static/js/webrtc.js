const videoContainer = document.getElementById('video-container');
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
const identityInput = document.getElementById('identityInput');
const joinBtn = document.getElementById('joinBtn');
const roomNameDisplay = document.getElementById('roomNameDisplay');

let room;
let currentRoom;

// Initialize LiveKit Room
async function joinRoom() {
    const roomId = roomInput.value.trim();
    const identity = identityInput.value.trim() || 'User_' + Math.floor(Math.random() * 1000);

    if (!roomId) {
        roomInput.classList.add('error');
        setTimeout(() => roomInput.classList.remove('error'), 400);
        return;
    }

    currentRoom = roomId;
    roomNameDisplay.innerText = `Room: ${roomId}`;

    try {
        // 1. Get token from backend
        const response = await fetch(`/getToken?room=${roomId}&identity=${identity}`);
        const { token } = await response.json();

        // 2. Setup Room
        room = new LiveKit.Room({
            adaptiveStream: true,
            dynacast: true,
            publishDefaults: {
                videoSimulcast: true,
            },
        });

        // 3. Connect to room
        // NOTE: In production, the host should be configurable. 
        // For development, we assume LiveKit is running on localhost:7880
        await room.connect('ws://localhost:7880', token);
        console.log('Connected to room', room.name);

        // 4. Set up event listeners
        setupRoomListeners();

        // 5. Publish local media
        await room.localParticipant.enableCameraAndMicrophone();
        handleParticipantJoined(room.localParticipant);

        // Transition UI
        lobby.classList.add('app-hidden');
        callUI.classList.remove('app-hidden');

    } catch (err) {
        console.error("Failed to join room:", err);
        alert("Could not connect to LiveKit. Make sure LiveKit server is running at http://localhost:7880 \nError: " + err.message);
    }
}

function setupRoomListeners() {
    room
        .on(LiveKit.RoomEvent.ParticipantConnected, handleParticipantJoined)
        .on(LiveKit.RoomEvent.ParticipantDisconnected, handleParticipantLeft)
        .on(LiveKit.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            attachTrack(track, participant);
        })
        .on(LiveKit.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            track.detach();
        })
        .on(LiveKit.RoomEvent.LocalTrackPublished, (publication, participant) => {
            attachTrack(publication.track, participant);
        })
        .on(LiveKit.RoomEvent.DataReceived, (payload, participant) => {
            const str = new TextDecoder().decode(payload);
            try {
                const data = JSON.parse(str);
                if (data.type === 'chat') {
                    appendMessage(data.text, 'received', participant?.identity || 'System');
                }
            } catch (e) {
                console.error("Error parsing data message", e);
            }
        });
}

function handleParticipantJoined(participant) {
    console.log('Participant joined:', participant.identity);
    createParticipantContainer(participant);

    // For participants already in the room
    participant.tracks.forEach(publication => {
        if (publication.isSubscribed && publication.track) {
            attachTrack(publication.track, participant);
        }
    });
}

function handleParticipantLeft(participant) {
    console.log('Participant left:', participant.identity);
    const container = document.getElementById(`p-${participant.identity}`);
    if (container) container.remove();
}

function createParticipantContainer(participant) {
    if (document.getElementById(`p-${participant.identity}`)) return;

    const container = document.createElement('div');
    container.id = `p-${participant.identity}`;
    container.className = 'video-wrapper';

    const nameLabel = document.createElement('div');
    nameLabel.className = 'user-name';
    nameLabel.innerText = participant.identity + (participant === room.localParticipant ? ' (You)' : '');
    container.appendChild(nameLabel);

    videoContainer.appendChild(container);
}

function attachTrack(track, participant) {
    const container = document.getElementById(`p-${participant.identity}`);
    if (!container) return;

    if (track.kind === 'video' || track.kind === 'audio') {
        const element = track.attach();
        container.appendChild(element);
    }
}

// Chat Logic
async function sendMessage() {
    const text = chatInput.value.trim();
    if (text && room) {
        const data = JSON.stringify({ type: 'chat', text });
        const encoder = new TextEncoder();
        await room.localParticipant.publishData(encoder.encode(data), LiveKit.DataPacket_Kind.RELIABLE);
        appendMessage(text, 'sent', 'You');
        chatInput.value = '';
    }
}

function appendMessage(text, side, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${side}`;

    const senderSpan = document.createElement('div');
    senderSpan.style.fontSize = '10px';
    senderSpan.style.marginBottom = '4px';
    senderSpan.style.opacity = '0.7';
    senderSpan.innerText = sender;

    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(document.createTextNode(text));

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Controls
toggleAudio.onclick = async () => {
    const enabled = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    toggleAudio.classList.toggle('active', !enabled);
    toggleAudio.innerHTML = enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
};

toggleVideo.onclick = async () => {
    const enabled = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(enabled);
    toggleVideo.classList.toggle('active', !enabled);
    toggleVideo.innerHTML = enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
};

shareScreen.onclick = async () => {
    const enabled = !room.localParticipant.isScreenShareEnabled;
    await room.localParticipant.setScreenShareEnabled(enabled);
    shareScreen.classList.toggle('active', enabled);
};

hangup.onclick = () => {
    if (room) room.disconnect();
    location.reload();
};

sendBtn.onclick = sendMessage;
chatInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
};

joinBtn.onclick = joinRoom;
roomInput.onkeypress = (e) => {
    if (e.key === 'Enter') joinRoom();
};
identityInput.onkeypress = (e) => {
    if (e.key === 'Enter') joinRoom();
};
