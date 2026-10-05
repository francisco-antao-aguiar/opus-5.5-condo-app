package com.condo.governance;

public enum PermissionScope {
    /** Anywhere in the building. */
    ANY,
    /** Only when the target space is the member's unit or lies inside it. */
    OWN_UNIT
}
