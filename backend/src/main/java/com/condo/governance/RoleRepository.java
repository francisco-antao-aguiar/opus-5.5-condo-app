package com.condo.governance;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<Role, String> {

    List<Role> findAllByOrderByRankDesc();
}
