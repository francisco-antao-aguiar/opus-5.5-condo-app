package com.condo.maintenance;

import com.condo.building.Building;
import com.condo.building.BuildingRepository;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Hourly: generates due maintenance tasks and flags overdue ones, each building in its own time zone. Hourly (not
 * daily) so a building's "today" is picked up soon after its local midnight. Every step is idempotent.
 * Single-node assumption: add a DB lock (e.g. ShedLock) before running several backend instances.
 */
@Component
public class MaintenanceJob {

    private static final Logger log = LoggerFactory.getLogger(MaintenanceJob.class);

    private final MaintenanceService maintenance;
    private final MaintenancePlanRepository plans;
    private final BuildingRepository buildings;

    public MaintenanceJob(MaintenanceService maintenance, MaintenancePlanRepository plans,
            BuildingRepository buildings) {
        this.maintenance = maintenance;
        this.plans = plans;
        this.buildings = buildings;
    }

    @Scheduled(cron = "${app.maintenance.jobs-cron}")
    public void run() {
        int created = 0;
        for (UUID planId : plans.findSchedulableIds()) {
            try {
                created += maintenance.runPlan(planId);
            } catch (RuntimeException e) {
                log.error("Generating tasks for maintenance plan {} failed", planId, e);
            }
        }
        int overdue = 0;
        for (UUID buildingId : buildings.findAll().stream().map(Building::getId).toList()) {
            try {
                overdue += maintenance.flagOverdue(buildingId);
            } catch (RuntimeException e) {
                log.error("Flagging overdue maintenance in building {} failed", buildingId, e);
            }
        }
        if (created + overdue > 0) {
            log.info("Maintenance: {} task(s) created, {} newly overdue", created, overdue);
        }
    }
}
