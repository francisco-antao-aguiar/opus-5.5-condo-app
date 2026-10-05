package com.condo.issue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

class IssuePhotoIT extends IssueTestSupport {

    private static final byte[] PNG = png();

    private String issueId;

    @BeforeEach
    void reportIssue() throws Exception {
        issueId = reported(tenant1A, onAsset(roofLight, LIGHT_FLICKERING)).get("id").asText();
    }

    private static byte[] png() {
        byte[] bytes = Arrays.copyOf(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}, 64);
        Arrays.fill(bytes, 8, 64, (byte) 7);
        return bytes;
    }

    private ResultActions upload(Actor actor, byte[] bytes, String claimedType) throws Exception {
        // The client-claimed name/type are ignored; the bytes decide.
        return mvc.perform(multipart("/api/buildings/{b}/issues/{i}/photos", buildingId, issueId)
                .file(new MockMultipartFile("file", "photo.png", claimedType, bytes))
                .header("Authorization", "Bearer " + actor.token()));
    }

    private String pathOf(String absoluteUrl) {
        URI uri = URI.create(absoluteUrl);
        return uri.getRawPath() + "?" + uri.getRawQuery();
    }

    @Test
    void uploadAndViewThroughASignedLink() throws Exception {
        JsonNode photo = body(upload(tenant1A, PNG, "image/png").andExpect(status().isCreated()));
        assertThat(photo.get("contentType").asText()).isEqualTo("image/png");
        assertThat(photo.get("sizeBytes").asLong()).isEqualTo(PNG.length);
        assertThat(photo.get("uploadedByName").asText()).isEqualTo("Tenant1A");
        String url = photo.get("url").asText();
        assertThat(url).contains("/api/files/photos/").contains("sig=");

        // No Authorization header needed: the signature is the credential.
        mvc.perform(get(pathOf(url)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(PNG));
        mvc.perform(get(pathOf(url).replaceAll("sig=[^&]+", "sig=forged"))).andExpect(status().isForbidden());

        getIssue(owner1B, issueId)
                .andExpect(jsonPath("$.photoCount").value(1))
                .andExpect(jsonPath("$.photos[0].url").isNotEmpty())
                .andExpect(jsonPath("$.timeline[-1].type").value("PHOTO_ADDED"));
    }

    @Test
    void onlyImagesAreAccepted() throws Exception {
        byte[] script = "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8);
        upload(tenant1A, script, "image/png")
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
        upload(tenant1A, new byte[0], "image/png").andExpect(status().isBadRequest());
    }

    @Test
    void whoMayAddAndRemovePhotos() throws Exception {
        upload(owner1B, PNG, "image/png").andExpect(status().isForbidden()); // not involved yet
        meToo(owner1B, issueId);
        String photoId = body(upload(owner1B, PNG, "image/png").andExpect(status().isCreated())).get("id").asText();
        upload(admin, PNG, "image/png").andExpect(status().isCreated()); // triager

        // The UI hint matches the rule: uploader or triager.
        getIssue(owner1B, issueId).andExpect(jsonPath("$.photos[?(@.id=='" + photoId + "')].canDelete",
                org.hamcrest.Matchers.contains(true)));
        getIssue(tenant1A, issueId).andExpect(jsonPath("$.photos[?(@.id=='" + photoId + "')].canDelete",
                org.hamcrest.Matchers.contains(false)));
        getIssue(admin, issueId).andExpect(jsonPath("$.photos[*].canDelete",
                org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is(true))));

        deleteAs(tenant1A, "/api/buildings/{b}/issues/{i}/photos/{p}", buildingId, issueId, photoId)
                .andExpect(status().isForbidden());
        deleteAs(owner1B, "/api/buildings/{b}/issues/{i}/photos/{p}", buildingId, issueId, photoId)
                .andExpect(status().isNoContent());
    }

    @Test
    void atMostFivePhotos() throws Exception {
        for (int i = 0; i < 5; i++) {
            upload(tenant1A, PNG, "image/png").andExpect(status().isCreated());
        }
        upload(tenant1A, PNG, "image/png")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PHOTO_LIMIT"));
        getIssue(tenant1A, issueId).andExpect(jsonPath("$.me.canAddPhoto").value(false));
    }
}
