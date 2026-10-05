package com.condo.notification;

import com.condo.common.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Sends through Expo's push API (https://docs.expo.dev/push-notifications/sending-notifications/): batches of
 * 100, one ticket per message in the same order. Tickets with {@code DeviceNotRegistered} mean the app is gone
 * from that device, so the token is reported back for deletion. Delivery failures are logged, never thrown:
 * a push is best effort, the in-app notification is the record.
 */
public class ExpoPushSender implements PushSender {

    static final int BATCH = 100;
    private static final Logger log = LoggerFactory.getLogger(ExpoPushSender.class);

    private final RestClient http;

    public ExpoPushSender(RestClient.Builder builder, AppProperties.Push config) {
        RestClient.Builder b = builder.baseUrl(config.expoUrl())
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE);
        if (config.accessToken() != null && !config.accessToken().isBlank()) {
            b.defaultHeader("Authorization", "Bearer " + config.accessToken());
        }
        this.http = b.build();
    }

    @Override
    public Set<String> send(List<PushMessage> messages) {
        Set<String> dead = new HashSet<>();
        for (int from = 0; from < messages.size(); from += BATCH) {
            List<PushMessage> batch = messages.subList(from, Math.min(from + BATCH, messages.size()));
            try {
                JsonNode response = http.post()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(batch.stream().map(ExpoPushSender::toExpo).toList())
                        .retrieve()
                        .body(JsonNode.class);
                dead.addAll(deadTokens(batch, response));
            } catch (RestClientException e) {
                log.warn("Expo push batch of {} failed: {}", batch.size(), e.getMessage());
            }
        }
        return dead;
    }

    private static Map<String, Object> toExpo(PushMessage m) {
        return Map.of(
                "to", m.token(),
                "title", m.title(),
                "body", m.body(),
                "data", Map.of("link", m.link()),
                "sound", "default",
                "priority", "high",
                "channelId", "issue-updates");
    }

    private static Set<String> deadTokens(List<PushMessage> batch, JsonNode response) {
        Set<String> dead = new HashSet<>();
        JsonNode tickets = response != null ? response.path("data") : null;
        if (tickets == null || !tickets.isArray()) {
            return dead;
        }
        List<String> errors = new ArrayList<>();
        for (int i = 0; i < tickets.size() && i < batch.size(); i++) {
            JsonNode t = tickets.get(i);
            if ("error".equals(t.path("status").asText())) {
                String code = t.path("details").path("error").asText("");
                if ("DeviceNotRegistered".equals(code)) {
                    dead.add(batch.get(i).token());
                } else {
                    errors.add(code.isEmpty() ? t.path("message").asText() : code);
                }
            }
        }
        if (!errors.isEmpty()) {
            log.warn("Expo push errors: {}", errors);
        }
        return dead;
    }
}
