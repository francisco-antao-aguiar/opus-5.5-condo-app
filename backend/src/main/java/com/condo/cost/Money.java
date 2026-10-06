package com.condo.cost;

import com.condo.common.error.ApiException;
import com.condo.common.error.ErrorCodes;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * An amount in one ISO 4217 currency. Parsed from decimal text (never a binary float), checked against the
 * currency's minor units (2 for EUR, 0 for JPY, 3 for BHD) and kept at that scale. Different currencies are never
 * added together.
 */
public record Money(BigDecimal amount, Currency currency) {

    /** Plain decimal: no exponents, grouping or signs other than a leading minus. */
    private static final Pattern DECIMAL = Pattern.compile("^-?\\d{1,13}(\\.\\d{1,4})?$");

    public Money {
        int digits = currency.getDefaultFractionDigits();
        amount = amount.setScale(digits, RoundingMode.UNNECESSARY);
    }

    public static Money parse(String amount, String currencyCode) {
        Currency currency = currency(currencyCode);
        String text = amount == null ? "" : amount.trim();
        if (!DECIMAL.matcher(text).matches()) {
            throw invalid("Write the amount as a plain number like 120.50.");
        }
        BigDecimal value = new BigDecimal(text);
        if (value.signum() <= 0) {
            throw invalid("The amount must be greater than zero.");
        }
        int digits = currency.getDefaultFractionDigits();
        if (value.stripTrailingZeros().scale() > digits) {
            throw invalid(currency.getCurrencyCode() + " amounts have at most " + digits + " decimal"
                    + (digits == 1 ? "" : "s") + ".");
        }
        return new Money(value, currency);
    }

    /** Real currencies only: pseudo-codes like XXX/XAU have no minor unit. */
    public static Currency currency(String code) {
        try {
            Currency c = Currency.getInstance(code == null ? "" : code.trim().toUpperCase(Locale.ROOT));
            if (c.getDefaultFractionDigits() < 0) {
                throw new IllegalArgumentException();
            }
            return c;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(ErrorCodes.UNKNOWN_CURRENCY, "Unknown currency " + code + ".");
        }
    }

    public Money plus(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("Can't add " + other.currency + " to " + currency);
        }
        return new Money(amount.add(other.amount), currency);
    }

    /** "120.50" — the API form. */
    public String plain() {
        return amount.toPlainString();
    }

    public String code() {
        return currency.getCurrencyCode();
    }

    private static ApiException invalid(String message) {
        return ApiException.badRequest(ErrorCodes.INVALID_AMOUNT, message);
    }
}
