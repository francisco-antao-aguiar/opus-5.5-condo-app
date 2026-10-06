package com.condo.cost;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.condo.common.error.ApiException;
import org.junit.jupiter.api.Test;

class MoneyTest {

    @Test
    void keepsTheCurrencysScale() {
        assertThat(Money.parse("120.5", "eur").plain()).isEqualTo("120.50");
        assertThat(Money.parse("120", "EUR").plain()).isEqualTo("120.00");
        assertThat(Money.parse("1200", "JPY").plain()).isEqualTo("1200");
        assertThat(Money.parse("1.234", "BHD").plain()).isEqualTo("1.234");
        assertThat(Money.parse("0.10", "USD").code()).isEqualTo("USD");
    }

    @Test
    void rejectsWhatWouldSilentlyRoundOrMislead() {
        assertInvalid("12.345", "EUR", "INVALID_AMOUNT");   // more decimals than euro cents
        assertInvalid("10.5", "JPY", "INVALID_AMOUNT");     // yen has no minor unit
        assertInvalid("1e3", "EUR", "INVALID_AMOUNT");      // no exponents
        assertInvalid("1,000.00", "EUR", "INVALID_AMOUNT"); // no grouping
        assertInvalid("0", "EUR", "INVALID_AMOUNT");
        assertInvalid("-5", "EUR", "INVALID_AMOUNT");
        assertInvalid("", "EUR", "INVALID_AMOUNT");
        assertInvalid("10", "EURO", "UNKNOWN_CURRENCY");
        assertInvalid("10", "XXX", "UNKNOWN_CURRENCY");     // pseudo-currency without minor unit
    }

    @Test
    void neverAddsDifferentCurrencies() {
        Money eur = Money.parse("10.00", "EUR");
        assertThat(eur.plus(Money.parse("0.50", "EUR")).plain()).isEqualTo("10.50");
        assertThatThrownBy(() -> eur.plus(Money.parse("1", "GBP"))).isInstanceOf(IllegalArgumentException.class);
    }

    private static void assertInvalid(String amount, String currency, String code) {
        assertThatThrownBy(() -> Money.parse(amount, currency))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", code);
    }
}
