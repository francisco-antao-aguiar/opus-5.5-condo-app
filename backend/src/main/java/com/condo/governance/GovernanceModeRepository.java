package com.condo.governance;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GovernanceModeRepository extends JpaRepository<GovernanceMode, String> {

    List<GovernanceMode> findAllByOrderByCodeAsc();
}
