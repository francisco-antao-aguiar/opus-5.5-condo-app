package com.condo.cost;

import com.condo.cost.CostEntry.Category;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class CostDtos {

    private CostDtos() {
    }

    /** Amount as a decimal string: clients never round through binary floats. */
    public record MoneyDto(String amount, String currency) {

        static MoneyDto of(Money m) {
            return new MoneyDto(m.plain(), m.code());
        }
    }

    public record MoneyInput(@NotBlank @Size(max = 20) String amount, @Size(min = 3, max = 3) String currency) {
    }

    public record CostReceiptDto(String url, Instant urlExpiresAt, String contentType) {
    }

    public record CostEntryDto(UUID id, UUID buildingId, MoneyDto amount, LocalDate incurredOn, Category category,
            String description, String vendor, UUID issueId, Integer issueNumber, UUID maintenancePlanId,
            String planTitle, UUID assetId, String assetName, UUID spaceId, String locationLabel,
            CostReceiptDto receipt, String createdByName, Instant createdAt, long version) {
    }

    public record SaveCostEntryRequest(
            @NotNull @Valid MoneyInput amount,
            @NotNull LocalDate incurredOn,
            @NotNull Category category,
            @NotBlank @Size(max = 500) String description,
            @Size(max = 160) String vendor,
            UUID issueId,
            UUID maintenancePlanId,
            UUID assetId,
            UUID spaceId,
            Long version) {
    }

    public record CostQuery(LocalDate from, LocalDate to, Category category, UUID assetId, UUID issueId,
            UUID maintenancePlanId, Integer page, Integer size) {
    }

    public enum GroupBy { MONTH, CATEGORY, ASSET, SPACE }

    public record CostSummaryRow(String key, String label, List<MoneyDto> totals, int count) {
    }

    public record CostSummary(String groupBy, List<CostSummaryRow> rows, List<MoneyDto> totals) {
    }
}
