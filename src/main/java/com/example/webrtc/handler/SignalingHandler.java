package com.example.webrtc.handler;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class SignalingHandler extends TextWebSocketHandler {

    private static final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String roomId = getRoomId(session);
        Set<WebSocketSession> roomSessions = rooms.computeIfAbsent(roomId, k -> Collections.synchronizedSet(new HashSet<>()));
        
        // Assign role based on number of active sessions in this room
        String role = roomSessions.isEmpty() ? "offerer" : "answerer";
        
        // Notify existing peers that someone new has joined
        for (WebSocketSession s : roomSessions) {
            if (s.isOpen()) {
                s.sendMessage(new TextMessage("{\"type\": \"peer-joined\"}"));
            }
        }
        
        roomSessions.add(session);
        session.sendMessage(new TextMessage("{\"type\": \"role\", \"role\": \"" + role + "\"}"));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String roomId = getRoomId(session);
        Set<WebSocketSession> roomSessions = rooms.get(roomId);
        
        if (roomSessions == null) return;

        // Broadcast signaling message to all other connected peers in the SAME room
        for (WebSocketSession s : roomSessions) {
            if (s.isOpen() && !s.getId().equals(session.getId())) {
                s.sendMessage(message);
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = getRoomId(session);
        Set<WebSocketSession> roomSessions = rooms.get(roomId);
        if (roomSessions != null) {
            roomSessions.remove(session);
            if (roomSessions.isEmpty()) {
                rooms.remove(roomId);
            }
        }
    }

    private String getRoomId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri != null && uri.getQuery() != null) {
            String query = uri.getQuery();
            for (String param : query.split("&")) {
                if (param.startsWith("room=")) {
                    return param.substring(5);
                }
            }
        }
        return "default";
    }
}
