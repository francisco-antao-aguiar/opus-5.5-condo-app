package com.condo.issue;

import static com.condo.issue.IssueStatus.ACKNOWLEDGED;
import static com.condo.issue.IssueStatus.IN_PROGRESS;
import static com.condo.issue.IssueStatus.REPORTED;
import static com.condo.issue.IssueStatus.RESOLVED;
import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** Pure rules: lifecycle transitions, "Other" text normalization, image sniffing. */
class IssueRulesTest {

    @Test
    void lifecycleMovesForwardAndOnlyReopensFromResolved() {
        assertThat(REPORTED.canMoveTo(ACKNOWLEDGED)).isTrue();
        assertThat(REPORTED.canMoveTo(RESOLVED)).isTrue(); // skipping ahead is fine
        assertThat(ACKNOWLEDGED.canMoveTo(IN_PROGRESS)).isTrue();
        assertThat(IN_PROGRESS.canMoveTo(ACKNOWLEDGED)).isFalse(); // no going back…
        assertThat(ACKNOWLEDGED.canMoveTo(REPORTED)).isFalse();
        assertThat(REPORTED.canMoveTo(REPORTED)).isFalse();
        assertThat(RESOLVED.canMoveTo(REPORTED)).isTrue(); // …except reopening
        assertThat(RESOLVED.canMoveTo(IN_PROGRESS)).isFalse();
        assertThat(RESOLVED.isOpen()).isFalse();
    }

    @Test
    void otherTextsNormalizeToTheSameKey() {
        String key = OtherTexts.normalize("Smells of gas!");
        assertThat(key).isEqualTo("smells of gas");
        assertThat(OtherTexts.normalize("  smells   OF gas.. ")).isEqualTo(key);
        assertThat(OtherTexts.normalize("¡¡Smells of gas?!")).isEqualTo(key); // Unicode punctuation too
        assertThat(OtherTexts.normalize("Porta não fecha")).isEqualTo("porta não fecha"); // accents kept
        assertThat(OtherTexts.normalize(" ... ")).isNull();
        assertThat(OtherTexts.normalize(null)).isNull();
    }

    @Test
    void imagesAreRecognizedByTheirBytes() {
        assertThat(ImageTypes.sniff(new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0}))
                .hasValueSatisfying(t -> assertThat(t.contentType()).isEqualTo("image/jpeg"));
        assertThat(ImageTypes.sniff(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}))
                .hasValueSatisfying(t -> assertThat(t.extension()).isEqualTo("png"));
        assertThat(ImageTypes.sniff("RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.US_ASCII)))
                .hasValueSatisfying(t -> assertThat(t.contentType()).isEqualTo("image/webp"));
        assertThat(ImageTypes.sniff("\0\0\0\u0018ftypheic\0\0\0\0".getBytes(StandardCharsets.US_ASCII)))
                .hasValueSatisfying(t -> assertThat(t.contentType()).isEqualTo("image/heic"));
        assertThat(ImageTypes.sniff("<script>alert(1)</script>".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(ImageTypes.sniff("GIF89a".getBytes(StandardCharsets.US_ASCII))).isEmpty();
        assertThat(ImageTypes.sniff(new byte[0])).isEmpty();
    }
}
