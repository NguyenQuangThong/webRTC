package com.example.webrtc.config;

import com.example.webrtc.handler.SignalingHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Legacy P2P signaling - no longer needed with LiveKit
        // registry.addHandler(new SignalingHandler(), "/signal")
        //         .setAllowedOrigins("*");
    }
}
