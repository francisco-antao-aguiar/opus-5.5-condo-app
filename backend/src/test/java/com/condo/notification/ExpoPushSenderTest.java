package com.condo.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.condo.common.config.AppProperties;
import java.util.List;
import java.util.stream.IntStream;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ExpoPushSenderTest {

    private static final String URL = "https://exp.host/--/api/v2/push/send";

    private MockRestServiceServer server;
    private ExpoPushSender sender;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        sender = new ExpoPushSender(builder, new AppProperties.Push(true, URL, "secret-token"));
    }

    private static List<PushMessage> messages(int n) {
        return IntStream.range(0, n)
                .mapToObj(i -> new PushMessage("ExponentPushToken[t" + i + "]", "#1 Flickering", "Acknowledged",
                        "/buildings/b/issues/i"))
                .toList();
    }

    private static String okTickets(int n) {
        return "{\"data\":[" + String.join(",", IntStream.range(0, n)
                .mapToObj(i -> "{\"status\":\"ok\",\"id\":\"r" + i + "\"}").toList()) + "]}";
    }

    @Test
    void sendsInBatchesOfAHundredAndReportsDeadDevices() {
        server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer secret-token"))
                .andExpect(jsonPath("$.length()").value(100))
                .andExpect(jsonPath("$[0].to").value("ExponentPushToken[t0]"))
                .andExpect(jsonPath("$[0].data.link").value("/buildings/b/issues/i"))
                .andExpect(jsonPath("$[0].channelId").value("issue-updates"))
                .andRespond(withSuccess(okTickets(100), MediaType.APPLICATION_JSON));
        // Second batch: the 2nd message's device uninstalled the app, the 3rd hit another error.
        server.expect(requestTo(URL)).andExpect(jsonPath("$.length()").value(30))
                .andRespond(withSuccess("""
                        {"data":[
                          {"status":"ok","id":"x"},
                          {"status":"error","message":"gone","details":{"error":"DeviceNotRegistered"}},
                          {"status":"error","message":"too big","details":{"error":"MessageTooBig"}}
                        ]}""", MediaType.APPLICATION_JSON));

        assertThat(sender.send(messages(130))).containsExactly("ExponentPushToken[t101]");
        server.verify();
    }

    @Test
    void providerFailuresAreSwallowed() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$[*].to", Matchers.hasSize(2)))
                .andRespond(withServerError());
        assertThat(sender.send(messages(2))).isEmpty();
        server.verify();
    }
}
