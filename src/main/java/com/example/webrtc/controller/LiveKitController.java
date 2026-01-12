package com.example.webrtc.controller;

import io.livekit.server.AccessToken;
import io.livekit.server.CanPublish;
import io.livekit.server.CanPublishData;
import io.livekit.server.CanSubscribe;
import io.livekit.server.RoomJoin;
import io.livekit.server.RoomName;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class LiveKitController {

    @Value("${livekit.api.key}")
    private String apiKey;

    @Value("${livekit.api.secret}")
    private String apiSecret;

    @GetMapping("/getToken")
    public Map<String, String> getToken(@RequestParam String room, @RequestParam String identity) {
        AccessToken token = new AccessToken(apiKey, apiSecret);

        token.setIdentity(identity);
        token.setName(identity);

// Grant quyền join room
        token.addGrants(new RoomJoin(true));
        token.addGrants(new RoomName(room));

// Grant quyền media
        token.addGrants(new CanPublish(true));
        token.addGrants(new CanSubscribe(true));
        token.addGrants(new CanPublishData(true));

        return Map.of("token", token.toJwt());
    }
}
