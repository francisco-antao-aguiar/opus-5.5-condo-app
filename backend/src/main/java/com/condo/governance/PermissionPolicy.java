package com.condo.governance;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One row of the policy table: in {@code governanceMode}, {@code roleCode} may do {@code action} within {@code scope}. */
@Entity
@Table(name = "permission_policy")
public class PermissionPolicy {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "governance_mode", nullable = false, length = 32)
    private String governanceMode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 48)
    private Action action;

    @Column(name = "role_code", nullable = false, length = 32)
    private String roleCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private PermissionScope scope;

    protected PermissionPolicy() {
    }

    public PermissionPolicy(String governanceMode, Action action, String roleCode, PermissionScope scope) {
        this.governanceMode = governanceMode;
        this.action = action;
        this.roleCode = roleCode;
        this.scope = scope;
    }

    public String getGovernanceMode() {
        return governanceMode;
    }

    public Action getAction() {
        return action;
    }

    public String getRoleCode() {
        return roleCode;
    }

    public PermissionScope getScope() {
        return scope;
    }
}
