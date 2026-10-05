import { DEFAULT_WIZARD_VALUE, WizardFormValue, estimateSpaceCount, toGenerateRequest } from './wizard';

const value = (patch: Partial<WizardFormValue>): WizardFormValue => ({ ...DEFAULT_WIZARD_VALUE, ...patch });

describe('wizard', () => {
  it('estimates floors + units + basements + ground floor + common areas', () => {
    const req = toGenerateRequest(
      value({
        floors: 5,
        unitsPerFloor: 4,
        basements: 2,
        groundFloor: true,
        groundUnits: 1,
        groundShops: 2,
        commonAreas: { LOBBY: true, GARAGE: true, ROOF: true },
      }),
    );
    // 5 floors + 20 units + 2 basements + (1 ground + 1 unit + 2 shops) + 3 common areas
    expect(estimateSpaceCount(req)).toBe(5 + 20 + 2 + 4 + 3);
  });

  it('ignores ground-floor counts when the ground floor is off', () => {
    const req = toGenerateRequest(value({ floors: 2, unitsPerFloor: 2, basements: 0, groundFloor: false, groundUnits: 9, groundShops: 9, commonAreas: {} }));
    expect(req.groundFloor).toBeNull();
    expect(estimateSpaceCount(req)).toBe(2 + 4);
  });

  it('clamps out-of-range and empty inputs to the server limits', () => {
    const req = toGenerateRequest(
      value({ floors: 999, unitsPerFloor: -3, basements: null as unknown as number, groundFloor: false }),
    );
    expect(req.floors).toBe(200);
    expect(req.unitsPerFloor).toBe(0);
    expect(req.basements).toBe(0);
  });

  it('lists only checked common areas in canonical order and sets append only when asked', () => {
    const v = value({ commonAreas: { STORAGE: true, LOBBY: true, ROOF: false } });
    expect(toGenerateRequest(v).commonAreas).toEqual(['LOBBY', 'STORAGE']);
    expect(toGenerateRequest(v).append).toBeUndefined();
    expect(toGenerateRequest(v, true).append).toBe(true);
  });
});
