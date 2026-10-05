import { CommonAreaKind, GenerateStructureRequest, UnitNaming } from '@condo/shared';

export const COMMON_AREA_KINDS: { kind: CommonAreaKind; label: string }[] = [
  { kind: 'LOBBY', label: 'Lobby' },
  { kind: 'GARAGE', label: 'Garage' },
  { kind: 'ROOF', label: 'Roof' },
  { kind: 'ELEVATOR_SHAFT', label: 'Elevator shaft' },
  { kind: 'STAIRWELL', label: 'Stairwell' },
  { kind: 'STORAGE', label: 'Storage' },
];

export const WIZARD_LIMITS = {
  floors: { min: 0, max: 200 },
  unitsPerFloor: { min: 0, max: 50 },
  basements: { min: 0, max: 10 },
  groundUnits: { min: 0, max: 50 },
  groundShops: { min: 0, max: 50 },
} as const;

/** Raw value of the wizard form (flat, form-friendly). */
export interface WizardFormValue {
  floors: number;
  unitsPerFloor: number;
  basements: number;
  groundFloor: boolean;
  groundUnits: number;
  groundShops: number;
  unitNaming: UnitNaming;
  commonAreas: Partial<Record<CommonAreaKind, boolean>>;
}

export const DEFAULT_WIZARD_VALUE: WizardFormValue = {
  floors: 4,
  unitsPerFloor: 2,
  basements: 0,
  groundFloor: true,
  groundUnits: 0,
  groundShops: 1,
  unitNaming: 'LETTERS',
  commonAreas: { LOBBY: true, STAIRWELL: true },
};

const clampInt = (v: unknown, min: number, max: number): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

/** Converts the form value into the API request (clamped to the server's limits). */
export function toGenerateRequest(v: WizardFormValue, append = false): GenerateStructureRequest {
  const L = WIZARD_LIMITS;
  return {
    floors: clampInt(v.floors, L.floors.min, L.floors.max),
    unitsPerFloor: clampInt(v.unitsPerFloor, L.unitsPerFloor.min, L.unitsPerFloor.max),
    basements: clampInt(v.basements, L.basements.min, L.basements.max),
    groundFloor: v.groundFloor
      ? {
          units: clampInt(v.groundUnits, L.groundUnits.min, L.groundUnits.max),
          shops: clampInt(v.groundShops, L.groundShops.min, L.groundShops.max),
        }
      : null,
    unitNaming: v.unitNaming,
    commonAreas: COMMON_AREA_KINDS.map((c) => c.kind).filter((k) => v.commonAreas[k]),
    ...(append ? { append: true } : {}),
  };
}

/**
 * Approximate number of spaces the generator creates: one FLOOR per level (above ground, ground, basements),
 * the units on each, ground-floor units/shops, and one COMMON_AREA per selected kind.
 * The server is the authority — the UI shows this as "~N".
 */
export function estimateSpaceCount(req: GenerateStructureRequest): number {
  const floors = Math.max(0, req.floors);
  const basements = Math.max(0, req.basements ?? 0);
  const ground = req.groundFloor ? 1 + Math.max(0, req.groundFloor.units ?? 0) + Math.max(0, req.groundFloor.shops ?? 0) : 0;
  return floors + floors * Math.max(0, req.unitsPerFloor) + basements + ground + (req.commonAreas?.length ?? 0);
}
