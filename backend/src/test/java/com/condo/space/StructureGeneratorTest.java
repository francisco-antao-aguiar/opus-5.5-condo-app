package com.condo.space;

import static org.assertj.core.api.Assertions.assertThat;

import com.condo.space.dto.SpaceDtos.CommonAreaKind;
import com.condo.space.dto.SpaceDtos.GenerateStructureRequest;
import com.condo.space.dto.SpaceDtos.GroundFloor;
import com.condo.space.dto.SpaceDtos.UnitNaming;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class StructureGeneratorTest {

    private final StructureGenerator generator = new StructureGenerator();
    private final Space root = Space.root(UUID.randomUUID(), "Root");

    private Map<String, Space> byName(List<Space> spaces) {
        return spaces.stream().collect(Collectors.toMap(Space::getName, Function.identity()));
    }

    @Test
    void generatesFloorsUnitsAndCommonAreasInTheRightPlaces() {
        var req = new GenerateStructureRequest(3, 4, 1, new GroundFloor(0, 1), UnitNaming.LETTERS,
                List.of(CommonAreaKind.LOBBY, CommonAreaKind.GARAGE, CommonAreaKind.ROOF), false);
        List<Space> out = generator.generate(root, req);
        Map<String, Space> n = byName(out);

        // 1 basement + ground + shop + 3 floors × (1 + 4) + 3 common areas
        assertThat(out).hasSize(1 + 1 + 1 + 15 + 3);
        assertThat(out).hasSize((int) StructureGenerator.estimate(req));

        assertThat(n.get("Floor 2").getParentId()).isEqualTo(root.getId());
        assertThat(n.get("2D").getParentId()).isEqualTo(n.get("Floor 2").getId());
        assertThat(n.get("2D").getType()).isEqualTo(SpaceType.UNIT);
        assertThat(n.get("2D").getVisibility()).isEqualTo(Visibility.PRIVATE);
        assertThat(n.get("Shop 1").getParentId()).isEqualTo(n.get("Ground floor").getId());
        assertThat(n.get("Lobby").getParentId()).isEqualTo(n.get("Ground floor").getId());
        assertThat(n.get("Garage").getParentId()).isEqualTo(n.get("Basement -1").getId());
        assertThat(n.get("Roof").getParentId()).isEqualTo(root.getId());
        assertThat(n.get("Roof").getVisibility()).isNull(); // inherits COMMON
        assertThat(n.get("Basement -1").getSortOrder()).isLessThan(n.get("Ground floor").getSortOrder());
    }

    @Test
    void maintainsMaterializedPathAndDepth() {
        List<Space> out = generator.generate(root,
                new GenerateStructureRequest(1, 1, 0, null, null, null, false));
        Map<String, Space> n = byName(out);
        Space floor = n.get("Floor 1");
        Space unit = n.get("1A");
        assertThat(floor.getPath()).isEqualTo(root.getPath() + floor.getId() + "/");
        assertThat(unit.getPath()).isEqualTo(floor.getPath() + unit.getId() + "/");
        assertThat(unit.getDepth()).isEqualTo(2);
        assertThat(unit.isWithin(root)).isTrue();
        assertThat(unit.isWithin(floor)).isTrue();
        assertThat(floor.isWithin(unit)).isFalse();
    }

    @Test
    void commonAreasFallBackToRootWithoutBasementOrGroundFloor() {
        Map<String, Space> n = byName(generator.generate(root, new GenerateStructureRequest(1, 0, 0, null, null,
                List.of(CommonAreaKind.LOBBY, CommonAreaKind.GARAGE), false)));
        assertThat(n.get("Lobby").getParentId()).isEqualTo(root.getId());
        assertThat(n.get("Garage").getParentId()).isEqualTo(root.getId());
    }

    @Test
    void unitNaming() {
        assertThat(StructureGenerator.unitName(3, 1, UnitNaming.LETTERS)).isEqualTo("3A");
        assertThat(StructureGenerator.unitName(3, 26, UnitNaming.LETTERS)).isEqualTo("3Z");
        assertThat(StructureGenerator.unitName(3, 27, UnitNaming.LETTERS)).isEqualTo("3AA");
        assertThat(StructureGenerator.unitName(0, 2, UnitNaming.LETTERS)).isEqualTo("GB");
        assertThat(StructureGenerator.unitName(12, 4, UnitNaming.NUMBERS)).isEqualTo("1204");
        assertThat(StructureGenerator.unitName(0, 1, UnitNaming.NUMBERS)).isEqualTo("001");
    }

    @Test
    void emptyRequestCreatesNothing() {
        assertThat(generator.generate(root, new GenerateStructureRequest(0, 0, null, null, null, null, null)))
                .isEmpty();
    }
}
