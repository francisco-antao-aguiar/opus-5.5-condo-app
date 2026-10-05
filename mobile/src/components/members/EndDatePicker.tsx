import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { addMonths, endOfDayIso, formatDate, parseDateInput, toDateInput } from '../../lib/format';
import { spacing, useTheme } from '../../theme';
import { Chip, ChipGroup } from '../Controls';
import { TextField } from '../TextField';

type Choice = 'none' | 'keep' | 'm3' | 'm6' | 'y1' | 'custom';

export interface EndDateValue {
  /** End-of-day ISO instant, or null for "no end date". */
  iso: string | null;
  valid: boolean;
}

interface Props {
  /** Presets are counted from this date (e.g. the current end date when extending). Default today. */
  base?: Date;
  /** Current value, offered as "Keep …" when given. */
  current?: string | null;
  allowNone?: boolean;
  noneLabel?: string;
  /** Initial selection. */
  initial?: Choice;
  onChange: (value: EndDateValue) => void;
}

const PRESETS: { choice: Choice; months: number; label: string }[] = [
  { choice: 'm3', months: 3, label: '3 months' },
  { choice: 'm6', months: 6, label: '6 months' },
  { choice: 'y1', months: 12, label: '1 year' },
];

/**
 * Membership end date as preset chips (3 months / 6 months / 1 year from `base`), "No end date" and
 * a custom YYYY-MM-DD field. Always yields the end of the chosen local day, so access lasts the
 * whole last day. No native date picker dependency.
 */
export function EndDatePicker({ base, current, allowNone = true, noneLabel = 'No end date', initial, onChange }: Props) {
  const { colors } = useTheme();
  const from = useMemo(() => base ?? new Date(), [base]);
  const [choice, setChoice] = useState<Choice>(initial ?? (current !== undefined ? 'keep' : allowNone ? 'none' : 'm6'));
  const [custom, setCustom] = useState(toDateInput(current) || toDateInput(addMonths(from, 6).toISOString()));

  const result = useMemo<EndDateValue & { error?: string }>(() => {
    switch (choice) {
      case 'none':
        return { iso: null, valid: true };
      case 'keep':
        return { iso: current ?? null, valid: true };
      case 'custom': {
        const d = parseDateInput(custom);
        if (!d) return { iso: null, valid: false, error: 'Use the format YYYY-MM-DD, e.g. 2027-06-30' };
        const iso = endOfDayIso(d);
        if (new Date(iso).getTime() <= Date.now()) return { iso, valid: false, error: 'Pick a date in the future' };
        return { iso, valid: true };
      }
      default: {
        const months = PRESETS.find((p) => p.choice === choice)!.months;
        return { iso: endOfDayIso(addMonths(from, months)), valid: true };
      }
    }
  }, [choice, custom, current, from]);

  useEffect(() => {
    onChange({ iso: result.iso, valid: result.valid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.iso, result.valid]);

  return (
    <View style={{ gap: spacing.sm }}>
      <ChipGroup>
        {current !== undefined ? (
          <Chip
            label={current ? 'Keep ' + formatDate(current) : 'Keep: no end date'}
            selected={choice === 'keep'}
            onPress={() => setChoice('keep')}
          />
        ) : null}
        {allowNone && current !== null ? (
          <Chip label={noneLabel} selected={choice === 'none'} onPress={() => setChoice('none')} />
        ) : null}
        {PRESETS.map((p) => (
          <Chip key={p.choice} label={'+ ' + p.label} selected={choice === p.choice} onPress={() => setChoice(p.choice)} />
        ))}
        <Chip label="Pick a date" selected={choice === 'custom'} onPress={() => setChoice('custom')} />
      </ChipGroup>
      {choice === 'custom' ? (
        <TextField
          label="End date"
          value={custom}
          onChangeText={setCustom}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          error={result.error}
          hint={result.valid && result.iso ? 'Access ends at the end of ' + formatDate(result.iso) : undefined}
        />
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          {result.iso ? 'Access ends at the end of ' + formatDate(result.iso) : 'Access does not expire'}
        </Text>
      )}
    </View>
  );
}
