package com.condo.space;

import com.condo.space.dto.SpaceDtos.CommonAreaKind;
import com.condo.space.dto.SpaceDtos.GenerateStructureRequest;
import com.condo.space.dto.SpaceDtos.UnitNaming;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Quick-setup wizard: turns "N floors × M units + extras" into ordinary {@link Space} nodes. Nothing about the
 * result is special — every generated node can be renamed, moved or removed afterwards like any other.
 * Pure function (no persistence) so it is trivially unit-testable.
 */
@Component
public class StructureGenerator {

    public static final int MAX_NODES = 2000;

    private static final int ROOT_EXTRAS_SORT = 10_000;

    public List<Space> generate(Space root, GenerateStructureRequest req) {
        List<Space> out = new ArrayList<>();
        UnitNaming naming = req.unitNaming() != null ? req.unitNaming() : UnitNaming.LETTERS;
        Set<CommonAreaKind> extras = req.commonAreas() == null || req.commonAreas().isEmpty()
                ? EnumSet.noneOf(CommonAreaKind.class)
                : EnumSet.copyOf(req.commonAreas());

        Space firstBasement = null;
        int basements = req.basements() != null ? req.basements() : 0;
        for (int level = 1; level <= basements; level++) {
            Space b = add(out, Space.childOf(root, SpaceType.FLOOR, "Basement -" + level, -level, null));
            if (level == 1) {
                firstBasement = b;
            }
        }

        Space ground = null;
        if (req.groundFloor() != null) {
            ground = add(out, Space.childOf(root, SpaceType.FLOOR, "Ground floor", 0, null));
            int units = nz(req.groundFloor().units());
            for (int u = 1; u <= units; u++) {
                add(out, Space.childOf(ground, SpaceType.UNIT, unitName(0, u, naming), u, Visibility.PRIVATE));
            }
            int shops = nz(req.groundFloor().shops());
            for (int s = 1; s <= shops; s++) {
                add(out, Space.childOf(ground, SpaceType.UNIT, "Shop " + s, units + s, Visibility.PRIVATE));
            }
        }

        for (int floor = 1; floor <= req.floors(); floor++) {
            Space f = add(out, Space.childOf(root, SpaceType.FLOOR, "Floor " + floor, floor, null));
            for (int u = 1; u <= req.unitsPerFloor(); u++) {
                add(out, Space.childOf(f, SpaceType.UNIT, unitName(floor, u, naming), u, Visibility.PRIVATE));
            }
        }

        // Common areas inherit COMMON from their parent. Placement follows where they physically are.
        if (extras.contains(CommonAreaKind.LOBBY)) {
            add(out, commonArea(ground != null ? ground : root, "Lobby", ground != null ? 0 : ROOT_EXTRAS_SORT));
        }
        if (extras.contains(CommonAreaKind.GARAGE)) {
            add(out, commonArea(firstBasement != null ? firstBasement : root, "Garage",
                    firstBasement != null ? 0 : ROOT_EXTRAS_SORT + 1));
        }
        if (extras.contains(CommonAreaKind.STORAGE)) {
            add(out, commonArea(firstBasement != null ? firstBasement : root, "Storage",
                    firstBasement != null ? 1 : ROOT_EXTRAS_SORT + 2));
        }
        if (extras.contains(CommonAreaKind.STAIRWELL)) {
            add(out, commonArea(root, "Stairwell", ROOT_EXTRAS_SORT + 3));
        }
        if (extras.contains(CommonAreaKind.ELEVATOR_SHAFT)) {
            add(out, commonArea(root, "Elevator shaft", ROOT_EXTRAS_SORT + 4));
        }
        if (extras.contains(CommonAreaKind.ROOF)) {
            add(out, commonArea(root, "Roof", ROOT_EXTRAS_SORT + 5));
        }
        return out;
    }

    /** Node count the request would produce, checked before generating. */
    public static long estimate(GenerateStructureRequest req) {
        long n = (long) req.floors() * (1 + req.unitsPerFloor());
        n += req.basements() != null ? req.basements() : 0;
        if (req.groundFloor() != null) {
            n += 1 + nz(req.groundFloor().units()) + nz(req.groundFloor().shops());
        }
        n += req.commonAreas() != null ? new HashSet<>(req.commonAreas()).size() : 0;
        return n;
    }

    /** LETTERS: 1A, 1B … 1Z, 1AA; ground floor GA. NUMBERS: 101, 102; ground floor 001. */
    static String unitName(int floor, int index, UnitNaming naming) {
        if (naming == UnitNaming.NUMBERS) {
            return String.format("%d%02d", floor, index);
        }
        return (floor == 0 ? "G" : String.valueOf(floor)) + letters(index);
    }

    private static String letters(int index) {
        StringBuilder sb = new StringBuilder();
        int n = index;
        while (n > 0) {
            n--;
            sb.insert(0, (char) ('A' + n % 26));
            n /= 26;
        }
        return sb.toString();
    }

    private static Space commonArea(Space parent, String name, int sortOrder) {
        return Space.childOf(parent, SpaceType.COMMON_AREA, name, sortOrder, null);
    }

    private static Space add(List<Space> out, Space s) {
        out.add(s);
        return s;
    }

    private static int nz(Integer v) {
        return v != null ? v : 0;
    }
}
