package com.condo.space;

public enum SpaceType {
    /** The tree root; exactly one per building. */
    BUILDING,
    FLOOR,
    UNIT,
    ROOM,
    /** Garage, roof, lobby, elevator shaft, stairwell, storage… */
    COMMON_AREA
}
