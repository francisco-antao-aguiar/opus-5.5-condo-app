package com.condo.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Issue activity → in-app notifications + pushes (delivered synchronously in the test profile). */
class NotificationIT extends IssueTestSupport {

    /** Records pushes instead of calling Expo; tokens in {@link #dead} are reported as uninstalled. */
    static class RecordingPushSender implements PushSender {
        final List<PushMessage> sent = new CopyOnWriteArrayList<>();
        final Set<String> dead = new HashSet<>();

        @Override
        public Set<String> send(List<PushMessage> messages) {
            sent.addAll(messages);
            Set<String> gone = new HashSet<>();
            messages.forEach(m -> {
                if (dead.contains(m.token())) {
                    gone.add(m.token());
                }
            });
            return gone;
        }
    }

    @TestConfiguration
    static class PushConfig {
        @Bean
        @Primary
        RecordingPushSender recordingPushSender() {
            return new RecordingPushSender();
        }
    }

    @Autowired
    RecordingPushSender push;
    @Autowired
    PushTokenRepository pushTokens;

    @BeforeEach
    void resetPushes() {
        push.sent.clear();
        push.dead.clear();
    }

    private JsonNode notifications(Actor actor) throws Exception {
        return body(getAs(actor, "/api/me/notifications").andExpect(status().isOk())).get("items");
    }

    private void registerDevice(Actor actor, String token) throws Exception {
        postAs(actor, Map.of("token", token, "platform", "android"), "/api/me/push-tokens")
                .andExpect(status().isNoContent());
    }

    @Test
    void newIssuesReachTheTriagersNotTheReporter() throws Exception {
        String id = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();

        JsonNode adminInbox = notifications(admin);
        assertThat(adminInbox).hasSize(1);
        assertThat(adminInbox.get(0).get("type").asText()).isEqualTo("ISSUE_REPORTED");
        assertThat(adminInbox.get(0).get("title").asText()).isEqualTo("#1 Flickering");
        assertThat(adminInbox.get(0).get("body").asText()).isEqualTo("Roof light · Roof · reported by Tenant1A");
        assertThat(adminInbox.get(0).get("link").asText()).isEqualTo("/buildings/" + buildingId + "/issues/" + id);
        assertThat(adminInbox.get(0).get("read").asBoolean()).isFalse();
        assertThat(notifications(tenant1A)).isEmpty();
        assertThat(notifications(owner1B)).isEmpty();
    }

    @Test
    void privateIssuesOnlyNotifyTheUnitUntilShared() throws Exception {
        reported(owner1A, onAsset(heater1A, BOILER_NO_HOT_WATER));
        assertThat(notifications(admin)).isEmpty();
        assertThat(notifications(tenant1A)).hasSize(1); // the unit runs its own private issues
        assertThat(notifications(owner1B)).isEmpty();
    }

    @Test
    void statusChangesReachEveryoneAffectedButTheActor() throws Exception {
        registerDevice(tenant1A, "ExponentPushToken[tenant-phone]");
        String id = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        meToo(owner1B, id);
        push.sent.clear();

        changeStatus(admin, id, "ACKNOWLEDGED", "Electrician booked for Monday").andExpect(status().isOk());

        JsonNode tenantInbox = notifications(tenant1A);
        assertThat(tenantInbox.get(0).get("type").asText()).isEqualTo("ISSUE_STATUS_CHANGED");
        assertThat(tenantInbox.get(0).get("body").asText())
                .isEqualTo("Acknowledged by Admin: Electrician booked for Monday");
        assertThat(notifications(owner1B).get(0).get("type").asText()).isEqualTo("ISSUE_STATUS_CHANGED");
        assertThat(notifications(admin).findValuesAsText("type")).doesNotContain("ISSUE_STATUS_CHANGED");

        assertThat(push.sent).singleElement().satisfies(m -> {
            assertThat(m.token()).isEqualTo("ExponentPushToken[tenant-phone]");
            assertThat(m.title()).startsWith("#1 Flickering · ");
            assertThat(m.link()).isEqualTo("/buildings/" + buildingId + "/issues/" + id);
        });

        // Reopening reads as such.
        changeStatus(admin, id, "RESOLVED", null);
        changeStatus(owner1B, id, "REPORTED", null);
        assertThat(notifications(tenant1A).get(0).get("body").asText()).isEqualTo("Reopened by Owner1B");
    }

    @Test
    void commentsAndMergesAreNotified() throws Exception {
        String keep = reported(tenant1A, onAsset(roofLight, LIGHT_NOT_WORKING)).get("id").asText();
        String dup = reported(owner1B, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();

        postAs(admin, Map.of("text", "Bulbs ordered"), "/api/buildings/{b}/issues/{i}/comments", buildingId, keep)
                .andExpect(status().isOk());
        assertThat(notifications(tenant1A).get(0).get("type").asText()).isEqualTo("ISSUE_COMMENTED");
        assertThat(notifications(tenant1A).get(0).get("body").asText()).isEqualTo("Admin: Bulbs ordered");

        postAs(admin, Map.of("intoIssueId", keep), "/api/buildings/{b}/issues/{i}/merge", buildingId, dup)
                .andExpect(status().isOk());
        JsonNode merged = notifications(owner1B).get(0);
        assertThat(merged.get("type").asText()).isEqualTo("ISSUE_MERGED");
        assertThat(merged.get("body").asText()).isEqualTo("Merged into #1 by Admin — you'll get its updates");
        assertThat(merged.get("link").asText()).endsWith("/issues/" + keep); // points at the survivor
    }

    @Test
    void openingAnIssueReadsItsNotifications() throws Exception {
        String id = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        reported(owner1B, onAsset(roofLight, LIGHT_NOT_WORKING));
        getAs(admin, "/api/me/notifications/unread-count").andExpect(jsonPath("$.unread").value(2));
        getIssue(admin, id).andExpect(status().isOk());
        getAs(admin, "/api/me/notifications/unread-count").andExpect(jsonPath("$.unread").value(1));
    }

    @Test
    void readStateIsPerUser() throws Exception {
        reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING));
        reported(owner1B, onAsset(roofLight, LIGHT_NOT_WORKING));
        getAs(admin, "/api/me/notifications/unread-count").andExpect(jsonPath("$.unread").value(2));

        String first = notifications(admin).get(0).get("id").asText();
        postAs(tenant1A, null, "/api/me/notifications/{id}/read", first).andExpect(status().isNotFound());
        postAs(admin, null, "/api/me/notifications/{id}/read", first).andExpect(status().isNoContent());
        getAs(admin, "/api/me/notifications/unread-count").andExpect(jsonPath("$.unread").value(1));
        getAs(admin, "/api/me/notifications?unreadOnly=true").andExpect(jsonPath("$.total").value(1));

        postAs(admin, null, "/api/me/notifications/read-all").andExpect(status().isNoContent());
        getAs(admin, "/api/me/notifications/unread-count").andExpect(jsonPath("$.unread").value(0));
        getAs(admin, "/api/me/notifications").andExpect(jsonPath("$.total").value(2));
    }

    @Test
    void deviceTokensFollowWhoeverIsSignedInAndDeadOnesAreForgotten() throws Exception {
        postAs(tenant1A, Map.of("token", "not-a-token", "platform", "android"), "/api/me/push-tokens")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PUSH_TOKEN"));

        // A shared phone: tenant signs in, then owner1B signs in on the same device.
        registerDevice(tenant1A, "ExponentPushToken[shared-phone]");
        registerDevice(owner1B, "ExponentPushToken[shared-phone]");
        assertThat(pushTokens.findByToken("ExponentPushToken[shared-phone]").orElseThrow().getUserId())
                .isEqualTo(owner1B.userId());

        String id = reported(owner1B, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
        meToo(tenant1A, id);
        push.sent.clear();
        changeStatus(admin, id, "ACKNOWLEDGED", null);
        assertThat(push.sent).extracting(PushMessage::token).containsExactly("ExponentPushToken[shared-phone]");
        assertThat(notifications(tenant1A)).isNotEmpty(); // still notified in-app

        // The app was uninstalled: Expo says DeviceNotRegistered, so the token is dropped.
        push.dead.add("ExponentPushToken[shared-phone]");
        changeStatus(admin, id, "IN_PROGRESS", null);
        assertThat(pushTokens.findByToken("ExponentPushToken[shared-phone]")).isEmpty();

        // Logging out removes only your own registration.
        registerDevice(owner1B, "ExponentPushToken[owner-phone]");
        deleteAs(tenant1A, "/api/me/push-tokens?token=ExponentPushToken[owner-phone]").andExpect(status().isNoContent());
        assertThat(pushTokens.findByToken("ExponentPushToken[owner-phone]")).isPresent();
        deleteAs(owner1B, "/api/me/push-tokens?token=ExponentPushToken[owner-phone]").andExpect(status().isNoContent());
        assertThat(pushTokens.findByToken("ExponentPushToken[owner-phone]")).isEmpty();
    }
}
