package com.condo.governance;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PermissionPolicyRepository extends JpaRepository<PermissionPolicy, Long> {

    Optional<PermissionPolicy> findByGovernanceModeAndActionAndRoleCode(String governanceMode, Action action,
            String roleCode);

    List<PermissionPolicy> findByGovernanceModeAndRoleCode(String governanceMode, String roleCode);

    List<PermissionPolicy> findByGovernanceModeOrderByActionAscRoleCodeAsc(String governanceMode);
}
