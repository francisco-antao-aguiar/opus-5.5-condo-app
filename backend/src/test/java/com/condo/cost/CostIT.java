package com.condo.cost;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.condo.support.IssueTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class CostIT extends IssueTestSupport {

    private Map<String, Object> cost(String amount, String currency, String category, String description) {
        Map<String, Object> money = new HashMap<>();
        money.put("amount", amount);
        money.put("currency", currency);
        Map<String, Object> m = new HashMap<>();
        m.put("amount", money);
        m.put("incurredOn", "2026-09-15");
        m.put("category", category);
        m.put("description", description);
        return m;
    }

    private JsonNode created(Actor actor, Map<String, Object> cost) throws Exception {
        return body(postAs(actor, cost, "/api/buildings/{b}/costs", buildingId).andExpect(status().isCreated()));
    }

    @Test
    void costsOnAnIssueInheritItsPlaceAndOwnersSeeThemInManagedBuildings() throws Exception {
        String issueId = reported(tenant1A, onAsset(roofLight, LIGHT_NOT_WORKING)).get("id").asText();
        Map<String, Object> repair = cost("120.5", null, "REPAIR", "New LED fitting");
        repair.put("issueId", issueId);
        repair.put("vendor", "Luz & Cia");
        JsonNode entry = created(admin, repair);
        assertThat(entry.get("amount").get("amount").asText()).isEqualTo("120.50"); // scale of EUR
        assertThat(entry.get("amount").get("currency").asText()).isEqualTo("EUR"); // building default
        assertThat(entry.get("assetId").asText()).isEqualTo(roofLight.toString());
        assertThat(entry.get("issueNumber").asInt()).isEqualTo(1);

        getAs(owner1B, "/api/buildings/{b}/costs", buildingId)
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        getAs(tenant1A, "/api/buildings/{b}/costs", buildingId).andExpect(status().isForbidden());
        postAs(owner1A, cost("10", "EUR", "OTHER", "x"), "/api/buildings/{b}/costs", buildingId)
                .andExpect(status().isForbidden());
        getAs(admin, "/api/buildings/{b}/costs?issueId={i}", buildingId, issueId)
                .andExpect(jsonPath("$.items[0].vendor").value("Luz & Cia"));
    }

    @Test
    void amountsAreValidatedPerCurrency() throws Exception {
        expectCode(cost("12.345", "EUR", "REPAIR", "Too precise"), "INVALID_AMOUNT");
        expectCode(cost("-5", "EUR", "REPAIR", "Negative"), "INVALID_AMOUNT");
        expectCode(cost("0", "EUR", "REPAIR", "Zero"), "INVALID_AMOUNT");
        expectCode(cost("1e3", "EUR", "REPAIR", "Exponent"), "INVALID_AMOUNT");
        expectCode(cost("100.5", "JPY", "REPAIR", "Yen has no cents"), "INVALID_AMOUNT");
        expectCode(cost("10", "XYZ", "REPAIR", "Made up"), "UNKNOWN_CURRENCY");
        created(admin, cost("1500", "JPY", "REPAIR", "Yen is fine"));
    }

    @Test
    void summariesNeverMixCurrencies() throws Exception {
        created(admin, cost("100.00", "EUR", "REPAIR", "A"));
        created(admin, cost("50.25", "EUR", "CLEANING", "B"));
        created(admin, cost("10", "USD", "REPAIR", "C"));

        JsonNode summary = body(getAs(admin, "/api/buildings/{b}/costs/summary?groupBy=category", buildingId)
                .andExpect(status().isOk()));
        assertThat(summary.get("totals")).hasSize(2);
        assertThat(summary.get("totals").findValuesAsText("currency")).containsExactly("EUR", "USD");
        assertThat(summary.get("totals").get(0).get("amount").asText()).isEqualTo("150.25");
        JsonNode repair = null;
        for (JsonNode row : summary.get("rows")) {
            if (row.get("key").asText().equals("REPAIR")) {
                repair = row;
            }
        }
        assertThat(repair).isNotNull();
        assertThat(repair.get("count").asInt()).isEqualTo(2);
        assertThat(repair.get("totals")).hasSize(2);
    }

    @Test
    void csvExportIsSafeToOpenInASpreadsheet() throws Exception {
        created(admin, cost("10.00", "EUR", "OTHER", "=HYPERLINK(\"http://evil\")"));
        byte[] csv = getAs(admin, "/api/buildings/{b}/costs/export.csv", buildingId)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(csv[0]).isEqualTo((byte) 0xEF); // UTF-8 BOM for Excel
        String text = new String(csv, StandardCharsets.UTF_8);
        assertThat(text).contains("'=HYPERLINK").doesNotContain(",=HYPERLINK").contains("10.00");
        getAs(owner1A, "/api/buildings/{b}/costs/export.csv", buildingId).andExpect(status().isOk());
        getAs(tenant1A, "/api/buildings/{b}/costs/export.csv", buildingId).andExpect(status().isForbidden());
    }

    @Test
    void deletingNeedsAReasonAndHidesTheEntry() throws Exception {
        String id = created(admin, cost("10.00", "EUR", "OTHER", "Oops")).get("id").asText();
        deleteAs(admin, "/api/buildings/{b}/costs/{c}", buildingId, id).andExpect(status().isBadRequest());
        deleteAs(admin, "/api/buildings/{b}/costs/{c}?reason={r}", buildingId, id, "Entered twice")
                .andExpect(status().isNoContent());
        getAs(admin, "/api/buildings/{b}/costs/{c}", buildingId, id).andExpect(status().isNotFound());
        getAs(admin, "/api/buildings/{b}/costs", buildingId).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void receiptsAreServedThroughSignedLinks() throws Exception {
        String id = created(admin, cost("10.00", "EUR", "OTHER", "With receipt")).get("id").asText();
        byte[] png = Arrays.copyOf(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}, 64);
        JsonNode entry = body(mvc.perform(multipart("/api/buildings/{b}/costs/{c}/receipt", buildingId, id)
                        .file(new MockMultipartFile("file", "r.png", "image/png", png))
                        .header("Authorization", "Bearer " + admin.token()))
                .andExpect(status().isOk()));
        String url = entry.get("receipt").get("url").asText();
        URI uri = URI.create(url);
        mvc.perform(get(uri.getRawPath() + "?" + uri.getRawQuery())).andExpect(status().isOk());
        mvc.perform(get(uri.getRawPath() + "?" + uri.getRawQuery().replaceAll("sig=[^&]+", "sig=bogus")))
                .andExpect(status().isForbidden());

        byte[] text = "hello".getBytes(StandardCharsets.UTF_8);
        mvc.perform(multipart("/api/buildings/{b}/costs/{c}/receipt", buildingId, id)
                        .file(new MockMultipartFile("file", "r.png", "image/png", text))
                        .header("Authorization", "Bearer " + admin.token()))
                .andExpect(status().isUnsupportedMediaType());
    }

    private void expectCode(Map<String, Object> cost, String code) throws Exception {
        postAs(admin, cost, "/api/buildings/{b}/costs", buildingId)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(code));
    }
}
