import { useState } from 'react';
import { Text } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { BuildingDto, CostCategory } from '@condo/shared';
import { Button } from '../../../../../components/Button';
import { Chip, ChipGroup } from '../../../../../components/Controls';
import { PhotoPicker } from '../../../../../components/issues/PhotoPicker';
import { Card, FormError, ScrollScreen, SectionTitle } from '../../../../../components/Layout';
import { QueryGate, StateView } from '../../../../../components/StateView';
import { TextField } from '../../../../../components/TextField';
import { useBuilding, useCreateCost } from '../../../../../hooks/queries';
import { errorMessage, fieldError } from '../../../../../lib/errors';
import { parseDateInput } from '../../../../../lib/format';
import { formatMoney, isKnownCurrency, parseAmount } from '../../../../../lib/money';
import type { LocalPhoto } from '../../../../../lib/photos';
import { todayIn } from '../../../../../lib/time';
import { useTheme } from '../../../../../theme';

const CATEGORIES: { value: CostCategory; label: string }[] = [
  { value: 'REPAIR', label: 'Repair' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * Add a cost on site (COST_MANAGE): /buildings/{b}/costs/new?issueId=…|assetId=…
 * Amount stays a decimal string validated against the currency's decimals; receipt uploaded after save.
 */
export default function AddCostScreen() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const building = useBuilding(buildingId);
  return (
    <>
      <Stack.Screen options={{ title: 'Add cost' }} />
      <QueryGate queries={[building]}>{() => <CostForm building={building.data!} />}</QueryGate>
    </>
  );
}

function CostForm({ building }: { building: BuildingDto }) {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ issueId?: string; assetId?: string; title?: string; category?: string }>();
  const { issueId, assetId, title } = params;
  const initialCategory = CATEGORIES.find((c) => c.value === params.category)?.value;
  const create = useCreateCost(building.id);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(building.currency || 'EUR');
  const [date, setDate] = useState(todayIn(building.timeZone));
  const [category, setCategory] = useState<CostCategory>(initialCategory ?? (issueId ? 'REPAIR' : 'MAINTENANCE'));
  const [description, setDescription] = useState(title ?? '');
  const [vendor, setVendor] = useState('');
  const [receipt, setReceipt] = useState<LocalPhoto[]>([]);
  const [touched, setTouched] = useState(false);
  const [receiptFailed, setReceiptFailed] = useState<unknown>(null);

  const code = currency.trim().toUpperCase();
  const currencyOk = isKnownCurrency(code);
  const parsed = parseAmount(amount, currencyOk ? code : 'EUR');
  const dateOk = !!parseDateInput(date);
  const canSave = 'amount' in parsed && currencyOk && dateOk && description.trim().length > 0;

  function save() {
    setTouched(true);
    if (!canSave || !('amount' in parsed)) return;
    create.mutate(
      {
        req: {
          amount: { amount: parsed.amount, currency: code },
          incurredOn: date,
          category,
          description: description.trim(),
          vendor: vendor.trim() || null,
          issueId: issueId ?? null,
          assetId: issueId ? null : (assetId ?? null),
        },
        receipt: receipt[0] ?? null,
      },
      {
        onSuccess: ({ receiptError }) => {
          if (receiptError) setReceiptFailed(receiptError);
          else router.back();
        },
      },
    );
  }

  if (receiptFailed && create.data) {
    return (
      <StateView
        glyph="🧾"
        title={`Cost saved: ${formatMoney(create.data.cost.amount)}`}
        message={`But the receipt couldn't be uploaded (${errorMessage(receiptFailed)}). You can attach it from the web app.`}
        action={{ label: 'Done', onPress: () => router.back() }}
      />
    );
  }

  return (
    <ScrollScreen>
      <FormError message={create.error ? errorMessage(create.error) : null} />
      <Card>
        <TextField
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          autoFocus
          style={{ fontSize: 28, fontWeight: '700', minHeight: 64 }}
          error={(touched || amount) && 'error' in parsed ? parsed.error : fieldError(create.error, 'amount.amount') ?? fieldError(create.error, 'amount')}
          hint={'amount' in parsed && currencyOk ? formatMoney({ amount: parsed.amount, currency: code }) : undefined}
        />
        <TextField
          label="Currency"
          value={currency}
          onChangeText={(t) => setCurrency(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={3}
          error={!currencyOk ? 'Use a 3-letter ISO code, e.g. EUR' : undefined}
        />
        <TextField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          error={!dateOk ? 'Use YYYY-MM-DD' : fieldError(create.error, 'incurredOn')}
        />
      </Card>
      <SectionTitle>Category</SectionTitle>
      <ChipGroup>
        {CATEGORIES.map((c) => (
          <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
        ))}
      </ChipGroup>
      <Card>
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Replaced the door closer"
          maxLength={500}
          error={touched && !description.trim() ? 'Required' : fieldError(create.error, 'description')}
        />
        <TextField label="Vendor (optional)" value={vendor} onChangeText={setVendor} placeholder="e.g. Schindler" maxLength={160} />
      </Card>
      <SectionTitle>Receipt (optional)</SectionTitle>
      <PhotoPicker photos={receipt} onChange={setReceipt} max={1} />
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
        Costs are for tracking only — nothing is charged to anyone.
      </Text>
      <Button title="Save cost" onPress={save} loading={create.isPending} disabled={create.isPending} style={{ minHeight: 60 }} />
    </ScrollScreen>
  );
}
