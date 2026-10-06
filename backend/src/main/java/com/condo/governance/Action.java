package com.condo.governance;

/**
 * Things a member can try to do in a building. Which roles may do them is data
 * ({@code permission_policy}), never code. New features add a constant here plus policy rows.
 */
public enum Action {
    BUILDING_VIEW,
    BUILDING_SETTINGS,
    STRUCTURE_EDIT,
    ASSET_CREATE,
    ASSET_EDIT,
    ASSET_DELETE,
    ISSUE_REPORT,
    ISSUE_TRIAGE,
    CATALOG_EDIT,
    MEMBER_INVITE,
    MEMBER_MANAGE,
    MAINTENANCE_VIEW,
    MAINTENANCE_MANAGE,
    BOOKING_CREATE,
    BOOKING_MANAGE,
    COST_VIEW,
    COST_MANAGE
}
