package com.condo.maintenance;

import com.condo.maintenance.MaintenanceDtos.MaintenancePlanDto;
import com.condo.maintenance.MaintenanceDtos.RecurrencePreview;
import com.condo.maintenance.MaintenanceDtos.RecurrencePreviewRequest;
import com.condo.maintenance.MaintenanceDtos.SaveMaintenancePlanRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/buildings/{buildingId}/maintenance-plans")
@Tag(name = "Maintenance")
public class MaintenanceController {

    private final MaintenanceService service;

    public MaintenanceController(MaintenanceService service) {
        this.service = service;
    }

    @GetMapping
    public List<MaintenancePlanDto> list(@PathVariable UUID buildingId) {
        return service.list(buildingId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a plan; tasks already within the lead window are generated right away")
    public MaintenancePlanDto create(@PathVariable UUID buildingId, @Valid @RequestBody SaveMaintenancePlanRequest req) {
        return service.create(buildingId, req);
    }

    @PostMapping("/preview")
    @Operation(summary = "Next due dates and wording for a recurrence (for the plan form)")
    public RecurrencePreview preview(@PathVariable UUID buildingId, @Valid @RequestBody RecurrencePreviewRequest req) {
        return service.preview(buildingId, req);
    }

    @GetMapping("/{planId}")
    public MaintenancePlanDto get(@PathVariable UUID buildingId, @PathVariable UUID planId) {
        return service.get(buildingId, planId);
    }

    @PutMapping("/{planId}")
    public MaintenancePlanDto update(@PathVariable UUID buildingId, @PathVariable UUID planId,
            @Valid @RequestBody SaveMaintenancePlanRequest req) {
        return service.update(buildingId, planId, req);
    }

    @PostMapping("/{planId}/pause")
    public MaintenancePlanDto pause(@PathVariable UUID buildingId, @PathVariable UUID planId) {
        return service.pause(buildingId, planId);
    }

    @PostMapping("/{planId}/resume")
    public MaintenancePlanDto resume(@PathVariable UUID buildingId, @PathVariable UUID planId) {
        return service.resume(buildingId, planId);
    }
}
