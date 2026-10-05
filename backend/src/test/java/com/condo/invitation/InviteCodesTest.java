package com.condo.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class InviteCodesTest {

    @Test
    void generatedCodesUseOnlyUnambiguousSymbols() {
        for (int i = 0; i < 1_000; i++) {
            String code = InviteCodes.generate();
            assertThat(code).hasSize(8).matches("[" + InviteCodes.ALPHABET + "]{8}");
            assertThat(code).doesNotContain("0", "O", "1", "I", "L");
        }
    }

    @Test
    void codesDontRepeatInPractice() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 20_000; i++) {
            seen.add(InviteCodes.generate());
        }
        assertThat(seen).hasSize(20_000);
    }

    @Test
    void normalizeAcceptsWhatPeopleType() {
        assertThat(InviteCodes.normalize("abcd-efgh")).isEqualTo("ABCDEFGH");
        assertThat(InviteCodes.normalize("  ABCD EFGH ")).isEqualTo("ABCDEFGH");
        assertThat(InviteCodes.normalize(null)).isEmpty();
        assertThat(InviteCodes.normalize("%27;drop")).isEqualTo("27DROP");
    }

    @Test
    void formatSplitsInTwoGroups() {
        assertThat(InviteCodes.format("ABCDEFGH")).isEqualTo("ABCD-EFGH");
        assertThat(InviteCodes.format("ABC")).isEqualTo("ABC");
    }
}
