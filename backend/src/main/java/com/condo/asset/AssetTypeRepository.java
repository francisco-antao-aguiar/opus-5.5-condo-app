package com.condo.asset;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AssetTypeRepository extends JpaRepository<AssetType, String> {

    List<AssetType> findAllByOrderBySortOrderAsc();
}
