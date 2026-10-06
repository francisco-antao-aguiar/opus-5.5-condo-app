package com.condo.cost;

import com.condo.cost.CostDtos.CostEntryDto;
import com.condo.cost.CostDtos.CostQuery;
import com.condo.cost.CostDtos.CostSummary;
import com.condo.cost.CostDtos.GroupBy;
import com.condo.cost.CostDtos.SaveCostEntryRequest;
import com.condo.cost.CostEntry.Category;
import com.condo.cost.CostService.ServedReceipt;
import com.condo.issue.dto.IssueDtos.Page;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Validated
@Tag(name = "Costs")
public class CostController {

    private final CostService service;

    public CostController(CostService service) {
        this.service = service;
    }

    @GetMapping("/api/buildings/{buildingId}/costs")
    public Page<CostEntryDto> list(@PathVariable UUID buildingId, @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to, @RequestParam(required = false) Category category,
            @RequestParam(required = false) UUID assetId, @RequestParam(required = false) UUID issueId,
            @RequestParam(required = false) UUID maintenancePlanId,
            @RequestParam(required = false) @Min(0) Integer page,
            @RequestParam(required = false) @Min(1) @Max(100) Integer size) {
        return service.list(buildingId, new CostQuery(from, to, category, assetId, issueId, maintenancePlanId, page,
                size));
    }

    @GetMapping("/api/buildings/{buildingId}/costs/summary")
    @Operation(summary = "Totals per month/category/asset/space, one total per currency")
    public CostSummary summary(@PathVariable UUID buildingId, @RequestParam(defaultValue = "month") String groupBy,
            @RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Category category, @RequestParam(required = false) UUID assetId,
            @RequestParam(required = false) UUID issueId, @RequestParam(required = false) UUID maintenancePlanId) {
        GroupBy g;
        try {
            g = GroupBy.valueOf(groupBy.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw com.condo.common.error.ApiException.invalidField("groupBy", "use month, category, asset or space");
        }
        return service.summary(buildingId, g, new CostQuery(from, to, category, assetId, issueId, maintenancePlanId,
                null, null));
    }

    @GetMapping("/api/buildings/{buildingId}/costs/export.csv")
    @Operation(summary = "CSV export for the accountant")
    public ResponseEntity<byte[]> export(@PathVariable UUID buildingId, @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to) {
        byte[] csv = service.exportCsv(buildingId, from, to).getBytes(StandardCharsets.UTF_8);
        String name = "costs" + (from != null ? "-" + from : "") + (to != null ? "-to-" + to : "") + ".csv";
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build()
                        .toString())
                .body(csv);
    }

    @GetMapping("/api/buildings/{buildingId}/costs/{costId}")
    public CostEntryDto get(@PathVariable UUID buildingId, @PathVariable UUID costId) {
        return service.get(buildingId, costId);
    }

    @PostMapping("/api/buildings/{buildingId}/costs")
    @ResponseStatus(HttpStatus.CREATED)
    public CostEntryDto create(@PathVariable UUID buildingId, @Valid @RequestBody SaveCostEntryRequest req) {
        return service.create(buildingId, req);
    }

    @PutMapping("/api/buildings/{buildingId}/costs/{costId}")
    public CostEntryDto update(@PathVariable UUID buildingId, @PathVariable UUID costId,
            @Valid @RequestBody SaveCostEntryRequest req) {
        return service.update(buildingId, costId, req);
    }

    @DeleteMapping("/api/buildings/{buildingId}/costs/{costId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Soft delete with a reason (kept for the audit trail)")
    public void delete(@PathVariable UUID buildingId, @PathVariable UUID costId,
            @RequestParam(required = false) String reason) {
        service.delete(buildingId, costId, reason);
    }

    @PostMapping(path = "/api/buildings/{buildingId}/costs/{costId}/receipt",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CostEntryDto uploadReceipt(@PathVariable UUID buildingId, @PathVariable UUID costId,
            @RequestPart("file") MultipartFile file) {
        return service.uploadReceipt(buildingId, costId, file);
    }

    @GetMapping("/api/files/receipts/{costId}")
    @Operation(summary = "Receipt bytes for a signed, short-lived link")
    public ResponseEntity<Resource> receipt(@PathVariable UUID costId, @RequestParam long exp,
            @RequestParam String sig) {
        ServedReceipt served = service.serveReceipt(costId, exp, sig);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(served.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(served.resource());
    }
}
