import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import type { CommonAreaKind, GenerateStructureRequest, GovernanceModeCode, UnitNaming } from '@condo/shared';
import { Button } from '../../../components/Button';
import { Chip, ChipGroup, Segmented, Stepper, ToggleRow } from '../../../components/Controls';
import { Card, FormError, ScrollScreen, SectionTitle } from '../../../components/Layout';
import { TextField } from '../../../components/TextField';
import { useCreateBuilding, useGovernanceModes } from '../../../hooks/queries';
import { errorMessage, fieldError } from '../../../lib/errors';
import { useTheme } from '../../../theme';

const COMMON_AREAS: { kind: CommonAreaKind; label: string }[] = [
  { kind: 'LOBBY', label: 'Lobby' },
  { kind: 'GARAGE', label: 'Garage' },
  { kind: 'ROOF', label: 'Roof' },
  { kind: 'ELEVATOR_SHAFT', label: 'Elevator shaft' },
  { kind: 'STAIRWELL', label: 'Stairwell' },
  { kind: 'STORAGE', label: 'Storage' },
];

export default function NewBuildingScreen() {
  const { colors } = useTheme();
  const modesQuery = useGovernanceModes();
  const create = useCreateBuilding();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [mode, setMode] = useState<GovernanceModeCode | null>(null);

  const [quickSetup, setQuickSetup] = useState(true);
  const [floors, setFloors] = useState(4);
  const [unitsPerFloor, setUnitsPerFloor] = useState(2);
  const [basements, setBasements] = useState(0);
  const [hasGround, setHasGround] = useState(true);
  const [groundUnits, setGroundUnits] = useState(0);
  const [groundShops, setGroundShops] = useState(1);
  const [naming, setNaming] = useState<UnitNaming>('LETTERS');
  const [areas, setAreas] = useState<Set<CommonAreaKind>>(new Set(['LOBBY', 'STAIRWELL']));

  // Default to the first mode the server offers (MANAGED in the seed).
  useEffect(() => {
    if (mode === null && modesQuery.data?.length) setMode(modesQuery.data[0].code);
  }, [mode, modesQuery.data]);

  const selectedMode = modesQuery.data?.find((m) => m.code === mode);

  function toggleArea(kind: CommonAreaKind) {
    setAreas((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function submit() {
    const structure: GenerateStructureRequest | null = quickSetup
      ? {
          floors,
          unitsPerFloor,
          basements,
          groundFloor: hasGround ? { units: groundUnits, shops: groundShops } : null,
          unitNaming: naming,
          commonAreas: COMMON_AREAS.map((a) => a.kind).filter((k) => areas.has(k)),
        }
      : null;
    create.mutate(
      {
        name: name.trim(),
        address: address.trim() || null,
        governanceMode: mode ?? undefined,
        structure,
      },
      {
        onSuccess: (building) => {
          router.dismissTo('/');
          router.push(`/buildings/${building.id}`);
        },
      },
    );
  }

  const err = create.error;
  const unitPreview =
    naming === 'LETTERS' ? '1A, 1B, 2A' : '101, 102, 201';

  return (
    <ScrollScreen>
      <FormError message={err ? errorMessage(err) : null} />
      <TextField
        label="Building name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rua Augusta 120"
        autoFocus
        error={fieldError(err, 'name')}
      />
      <TextField
        label="Address (optional)"
        value={address}
        onChangeText={setAddress}
        autoComplete="street-address"
        error={fieldError(err, 'address')}
      />

      <SectionTitle>Who can change things</SectionTitle>
      <Card>
        {modesQuery.isError ? (
          <Text style={{ color: colors.danger }}>Couldn't load governance modes. {errorMessage(modesQuery.error)}</Text>
        ) : (
          <>
            <Segmented
              accessibilityLabel="Governance mode"
              options={(modesQuery.data ?? []).map((m) => ({ value: m.code, label: m.name }))}
              value={mode}
              onChange={setMode}
            />
            {selectedMode ? (
              <Text style={{ color: colors.textMuted, fontSize: 15, lineHeight: 21 }}>{selectedMode.description}</Text>
            ) : null}
          </>
        )}
        {fieldError(err, 'governanceMode') ? (
          <Text style={{ color: colors.danger }}>{fieldError(err, 'governanceMode')}</Text>
        ) : null}
      </Card>

      <SectionTitle>Structure</SectionTitle>
      <Card>
        <ToggleRow
          label="Quick setup"
          description="Generate floors, units and common areas now. You can edit everything later."
          value={quickSetup}
          onChange={setQuickSetup}
        />
        {quickSetup ? (
          <>
            <Stepper label="Floors above ground" value={floors} onChange={setFloors} max={200} />
            <Stepper label="Units per floor" value={unitsPerFloor} onChange={setUnitsPerFloor} max={50} />
            <Stepper label="Basement levels" value={basements} onChange={setBasements} max={10} />
            <ToggleRow label="Ground floor" value={hasGround} onChange={setHasGround} />
            {hasGround ? (
              <>
                <Stepper label="Ground floor units" value={groundUnits} onChange={setGroundUnits} max={50} />
                <Stepper label="Ground floor shops" value={groundShops} onChange={setGroundShops} max={50} />
              </>
            ) : null}
            <Text style={[styles.label, { color: colors.textMuted }]}>Unit naming</Text>
            <Segmented
              accessibilityLabel="Unit naming"
              options={[
                { value: 'LETTERS' as UnitNaming, label: 'Letters' },
                { value: 'NUMBERS' as UnitNaming, label: 'Numbers' },
              ]}
              value={naming}
              onChange={setNaming}
            />
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>e.g. {unitPreview}</Text>
            <Text style={[styles.label, { color: colors.textMuted }]}>Common areas</Text>
            <ChipGroup>
              {COMMON_AREAS.map((a) => (
                <Chip key={a.kind} label={a.label} selected={areas.has(a.kind)} onPress={() => toggleArea(a.kind)} />
              ))}
            </ChipGroup>
          </>
        ) : null}
      </Card>

      <Button title="Create building" onPress={submit} loading={create.isPending} disabled={!name.trim()} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginTop: 4 },
});
