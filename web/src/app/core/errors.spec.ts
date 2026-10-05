import { FormControl, FormGroup } from '@angular/forms';
import { ApiError, NetworkError } from '@condo/shared';
import { applyServerErrors, describeError } from './errors';
import { dateInputToInstant, instantToDateInput } from '../shared/dates';

describe('describeError', () => {
  it('uses a friendly headline for known codes and keeps the server detail', () => {
    const e = new ApiError(409, { title: 'Conflict', status: 409, code: 'LAST_ADMIN', detail: 'Alice is the only admin.' });
    expect(describeError(e)).toEqual({
      title: 'A building must always keep at least one active admin.',
      detail: 'Alice is the only admin.',
    });
  });

  it('falls back to detail, then title, for unknown codes', () => {
    expect(describeError(new ApiError(418, { title: 'Teapot', status: 418, code: 'X', detail: 'Short and stout' })).title).toBe('Short and stout');
    expect(describeError(new ApiError(418, { title: 'Teapot', status: 418, code: 'X' })).title).toBe('Teapot');
  });

  it('describes network failures', () => {
    expect(describeError(new NetworkError(new TypeError('fetch'))).title).toContain("Can't reach");
  });
});

describe('applyServerErrors', () => {
  it('maps field errors onto controls and returns unmatched ones', () => {
    const form = new FormGroup({ name: new FormControl('') });
    const e = new ApiError(400, {
      title: 'Bad Request',
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [
        { field: 'name', message: 'must not be blank' },
        { field: 'other', message: 'nope' },
      ],
    });
    expect(applyServerErrors(form, e)).toEqual(['other: nope']);
    expect(form.controls.name.errors).toEqual({ server: 'must not be blank' });
  });

  it('supports a field prefix for nested requests', () => {
    const form = new FormGroup({ floors: new FormControl(1) });
    const e = new ApiError(400, {
      title: 'Bad Request',
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'structure.floors', message: 'too many' }],
    });
    applyServerErrors(form, e, 'structure.');
    expect(form.controls.floors.errors).toEqual({ server: 'too many' });
  });
});

describe('member expiry date conversion', () => {
  it('round-trips a local date through an end-of-day instant', () => {
    const instant = dateInputToInstant('2027-03-15');
    expect(instant).not.toBeNull();
    expect(instantToDateInput(instant)).toBe('2027-03-15');
    expect(dateInputToInstant('')).toBeNull();
    expect(instantToDateInput(null)).toBe('');
  });
});
