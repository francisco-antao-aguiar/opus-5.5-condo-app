import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { onlineManager } from '@tanstack/react-query';
import {
  buildSpaceTree,
  spacePath,
  type AssetDto,
  type AssetTypeDto,
  type DuplicateIssueInfo,
  type IssueDto,
  type MyPermissions,
  type ProblemTypeDto,
  type SpaceDto,
  type SpaceNode,
  type UUID,
  type Visibility,
} from '@condo/shared';
import { api } from '../../../../api/client';
import { useAuth } from '../../../../auth/AuthProvider';
import { AssetIcon, AssetRow } from '../../../../components/assets/AssetParts';
import { SpaceTypeIcon } from '../../../../components/Badges';
import { Button } from '../../../../components/Button';
import { ToggleRow } from '../../../../components/Controls';
import { AlreadyReportedCard, duplicateCardProps, InlineLoading } from '../../../../components/issues/IssueParts';
import { PhotoPicker } from '../../../../components/issues/PhotoPicker';
import { Card, FormError, SectionTitle } from '../../../../components/Layout';
import { ListRow } from '../../../../components/ListRow';
import { QueryGate, StateView } from '../../../../components/StateView';
import { TextField } from '../../../../components/TextField';
import {
  useAssets,
  useCatalog,
  useMyPermissions,
  useOpenIssuesOnAsset,
  useSpaces,
} from '../../../../hooks/queries';
import { errorMessage } from '../../../../lib/errors';
import { affectedText } from '../../../../lib/issues';
import type { LocalPhoto } from '../../../../lib/photos';
import { newId } from '../../../../lib/uuid';
import { discard, enqueue, sendOne } from '../../../../reports/queue';
import { radius, spacing, TAP_MIN, useTheme } from '../../../../theme';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../../api/queryKeys';

/**
 * The 10-second report: place → asset → problem → Send.
 *   /buildings/{b}/report                 start at the building (or "Your home" shortcuts)
 *   /buildings/{b}/report?spaceId=…       start inside a space
 *   /buildings/{b}/report?assetId=…       start at the problem step (asset screen, phase 5 QR)
 */
export default function ReportScreen() {
  const { buildingId, assetId, spaceId } = useLocalSearchParams<{ buildingId: string; assetId?: string; spaceId?: string }>();
  const spacesQuery = useSpaces(buildingId);
  const assetsQuery = useAssets(buildingId);
  const catalogQuery = useCatalog(buildingId);
  const permsQuery = useMyPermissions(buildingId);
  return (
    <>
      <Stack.Screen options={{ title: 'Report a problem' }} />
      <QueryGate queries={[spacesQuery, assetsQuery, catalogQuery, permsQuery]}>
        {() => (
          <ReportFlow
            buildingId={buildingId}
            spaces={spacesQuery.data!}
            assets={assetsQuery.data!}
            catalog={catalogQuery.data!}
            perms={permsQuery.data!}
            initialAssetId={assetId}
            initialSpaceId={spaceId}
          />
        )}
      </QueryGate>
    </>
  );
}

type Problem = { kind: 'catalog'; type: ProblemTypeDto } | { kind: 'other' };

type Step =
  | { name: 'place' }
  | { name: 'problem' }
  | { name: 'confirm' }
  | { name: 'duplicate'; duplicate: DuplicateIssueInfo }
  | { name: 'done'; issue?: IssueDto; queued?: boolean; joined?: DuplicateIssueInfo };

function ReportFlow({
  buildingId,
  spaces,
  assets,
  catalog,
  perms,
  initialAssetId,
  initialSpaceId,
}: {
  buildingId: UUID;
  spaces: SpaceDto[];
  assets: AssetDto[];
  catalog: AssetTypeDto[];
  perms: MyPermissions;
  initialAssetId?: string;
  initialSpaceId?: string;
}) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const userId = useAuth().me?.user.id;
  const tree = useMemo(() => buildSpaceTree(spaces), [spaces]);
  const byId = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const initialAsset = initialAssetId ? assets.find((a) => a.id === initialAssetId) : undefined;

  const [placeId, setPlaceId] = useState<UUID>(
    initialAsset?.spaceId ?? (initialSpaceId && byId.has(initialSpaceId) ? initialSpaceId : tree?.id ?? ''),
  );
  const [asset, setAsset] = useState<AssetDto | null>(initialAsset ?? null);
  const [step, setStep] = useState<Step>(initialAsset ? { name: 'problem' } : { name: 'place' });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [otherText, setOtherText] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [share, setShare] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [meTooBusy, setMeTooBusy] = useState(false);
  // One id per report attempt (new problem / new place = new report); reused by every retry.
  const clientRequestId = useRef(newId());

  const place = byId.get(placeId);
  const visibility: Visibility | null = asset ? asset.effectiveVisibility : place?.effectiveVisibility ?? null;
  const location = asset?.spacePath ?? (place ? spacePath(spaces, place.id).slice(1).map((s) => s.name).join(' › ') || place.name : '');

  // Hardware back walks back through the steps instead of closing the flow.
  const goBack = (): boolean => {
    if (sending) return true;
    switch (step.name) {
      case 'confirm':
      case 'duplicate':
        setStep(asset ? { name: 'problem' } : { name: 'place' });
        return true;
      case 'problem':
        if (initialAsset) return false;
        setAsset(null);
        setStep({ name: 'place' });
        return true;
      case 'place': {
        const parent = place?.parentId;
        if (parent && placeId !== initialSpaceId) {
          setPlaceId(parent);
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  });

  function chooseAsset(a: AssetDto) {
    setAsset(a);
    if (a.spaceId) setPlaceId(a.spaceId);
    setStep({ name: 'problem' });
  }

  function chooseProblem(p: Problem) {
    setProblem(p);
    setError(null);
    clientRequestId.current = newId();
    setStep({ name: 'confirm' });
  }

  function somethingElse() {
    setAsset(null);
    chooseProblem({ kind: 'other' });
  }

  const title =
    problem?.kind === 'catalog' ? problem.type.label : otherText.trim() || 'Something else';
  const canSend = problem?.kind === 'catalog' || otherText.trim().length > 0;

  async function send() {
    if (!userId || !problem || !canSend) return;
    setSending(true);
    setError(null);
    const id = clientRequestId.current;
    await enqueue({
      clientRequestId: id,
      userId,
      buildingId,
      title: title + (asset ? ' · ' + asset.name : ''),
      location,
      photos,
      req: {
        assetId: asset?.id ?? null,
        spaceId: asset ? null : placeId,
        problemTypeId: problem.kind === 'catalog' ? problem.type.id : null,
        otherText: problem.kind === 'other' ? otherText.trim() : null,
        note: note.trim() || null,
        sharedWithAdmins: visibility === 'PRIVATE' ? share : undefined,
      },
    });
    if (!onlineManager.isOnline()) {
      setSending(false);
      setStep({ name: 'done', queued: true });
      return;
    }
    const outcome = await sendOne(id, true);
    setSending(false);
    switch (outcome.kind) {
      case 'sent':
        setStep({ name: 'done', issue: outcome.issue });
        break;
      case 'queued':
        setStep({ name: 'done', queued: true });
        break;
      case 'duplicate':
      case 'joined':
        setStep({ name: 'duplicate', duplicate: outcome.duplicate });
        break;
      case 'failed':
        // The user is right here: show the error inline instead of parking it in "Couldn't send".
        discard(id);
        setError(outcome.error);
        break;
    }
  }

  /** Me too on an existing issue; photos picked so far follow it via the outbox. */
  async function meToo(issueId: UUID, number: number, already: boolean) {
    if (!userId) return;
    setMeTooBusy(true);
    setError(null);
    try {
      if (!already) await api.issues.meToo(buildingId, issueId);
      if (photos.length) {
        const id = newId();
        await enqueue({
          clientRequestId: id,
          userId,
          buildingId,
          title: title,
          location,
          photos,
          issueId,
          issueNumber: number,
          req: {},
        });
        void sendOne(id);
      }
      void qc.invalidateQueries({ queryKey: queryKeys.issues(buildingId) });
      setStep({
        name: 'done',
        joined: { issueId, number, title, status: 'REPORTED', affectedCount: 0, alreadyAffected: already },
      });
    } catch (e) {
      setError(e);
    } finally {
      setMeTooBusy(false);
    }
  }

  // ---------- render ----------

  if (!tree || !place) {
    return <StateView glyph="?" title="Nothing to report on yet" message="This building has no places set up." />;
  }

  if (step.name === 'done') {
    return <Done step={step} buildingId={buildingId} onAnother={() => {
      setAsset(null);
      setProblem(null);
      setOtherText('');
      setNote('');
      setPhotos([]);
      setShare(false);
      setStep({ name: 'place' });
    }} />;
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {step.name !== 'place' || place.parentId ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!goBack()) router.back();
          }}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>‹ Back</Text>
        </Pressable>
      ) : null}

      {step.name === 'place' ? (
        <PlaceStep
          spaces={spaces}
          assets={assets}
          catalog={catalog}
          perms={perms}
          place={place}
          tree={tree}
          onOpenPlace={setPlaceId}
          onAsset={chooseAsset}
          onSomethingElse={somethingElse}
        />
      ) : null}

      {step.name === 'problem' && asset ? (
        <ProblemStep
          buildingId={buildingId}
          asset={asset}
          catalog={catalog}
          meTooBusy={meTooBusy}
          error={error}
          onProblem={chooseProblem}
          onMeToo={(id, n) => void meToo(id, n, false)}
        />
      ) : null}

      {step.name === 'confirm' || step.name === 'duplicate' ? (
        <>
          <Card style={styles.summary}>
            {asset ? <AssetIcon type={asset.type} catalog={catalog} size={48} /> : null}
            <View style={styles.flex}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>
                {problem?.kind === 'catalog' ? problem.type.label : 'Something else'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>
                {asset ? asset.name + ' · ' : ''}
                {location}
              </Text>
            </View>
          </Card>

          {step.name === 'duplicate' ? (
            <AlreadyReportedCard
              {...duplicateCardProps(step.duplicate)}
              loading={meTooBusy}
              onMeToo={() => void meToo(step.duplicate.issueId, step.duplicate.number, false)}
              onOpen={() => router.replace(`/buildings/${buildingId}/issues/${step.duplicate.issueId}`)}
            />
          ) : null}
          {step.name === 'duplicate' && step.duplicate.alreadyAffected ? (
            <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>You already reported this.</Text>
          ) : null}

          <FormError message={error ? errorMessage(error) : null} />

          {step.name === 'confirm' ? (
            <>
              {problem?.kind === 'other' ? (
                <TextField
                  label={asset ? "What's wrong?" : "What's wrong here?"}
                  value={otherText}
                  onChangeText={setOtherText}
                  placeholder={asset ? 'e.g. Makes a loud noise' : 'e.g. Water on the floor near the stairs'}
                  autoFocus
                  maxLength={200}
                />
              ) : null}
              <TextField
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="Anything that helps fix it"
                multiline
                maxLength={1000}
                style={{ minHeight: 64, paddingTop: spacing.md, textAlignVertical: 'top' }}
              />
              <PhotoPicker photos={photos} onChange={setPhotos} />
              {visibility === 'PRIVATE' ? (
                <ToggleRow
                  label="Share with building management"
                  description="This place is private: only your unit sees the report unless you share it."
                  value={share}
                  onChange={setShare}
                />
              ) : null}
              <Button title="Send report" onPress={() => void send()} loading={sending} disabled={!canSend} style={styles.send} />
            </>
          ) : (
            <Button title="Close" variant="ghost" onPress={() => router.back()} />
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function PlaceStep({
  spaces,
  assets,
  catalog,
  perms,
  place,
  tree,
  onOpenPlace,
  onAsset,
  onSomethingElse,
}: {
  spaces: SpaceDto[];
  assets: AssetDto[];
  catalog: AssetTypeDto[];
  perms: MyPermissions;
  place: SpaceDto;
  tree: SpaceNode;
  onOpenPlace: (id: UUID) => void;
  onAsset: (a: AssetDto) => void;
  onSomethingElse: () => void;
}) {
  const { colors } = useTheme();
  const node = useMemo(() => {
    const find = (n: SpaceNode): SpaceNode | null =>
      n.id === place.id ? n : n.children.reduce<SpaceNode | null>((f, c) => f ?? find(c), null);
    return find(tree);
  }, [tree, place.id]);
  const path = useMemo(() => spacePath(spaces, place.id), [spaces, place.id]);
  const isRoot = !place.parentId;

  // Assets per space including everything below (for "3 assets" hints on places).
  const subtreeCount = useMemo(() => {
    const parent = new Map(spaces.map((s) => [s.id, s.parentId]));
    const counts = new Map<UUID, number>();
    for (const a of assets) {
      let cur: UUID | null | undefined = a.spaceId;
      while (cur) {
        counts.set(cur, (counts.get(cur) ?? 0) + 1);
        cur = parent.get(cur);
      }
    }
    return counts;
  }, [spaces, assets]);

  const here = assets
    .filter((a) => a.spaceId === place.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  // "Your home": everything inside my unit, one tap away from the start.
  const myUnitId = perms.unitId;
  const homeAssets = useMemo(() => {
    if (!isRoot || !myUnitId) return [];
    const parent = new Map(spaces.map((s) => [s.id, s.parentId]));
    const inUnit = (id: UUID | null) => {
      let cur: UUID | null | undefined = id;
      while (cur) {
        if (cur === myUnitId) return true;
        cur = parent.get(cur);
      }
      return false;
    };
    return assets.filter((a) => inUnit(a.spaceId)).slice(0, 8);
  }, [isRoot, myUnitId, spaces, assets]);
  const unit = myUnitId ? spaces.find((s) => s.id === myUnitId) : undefined;

  return (
    <View style={styles.step}>
      <Text accessibilityRole="header" style={[styles.h1, { color: colors.text }]}>
        {isRoot ? 'Where is the problem?' : place.name}
      </Text>
      {path.length > 1 ? (
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>{path.map((s) => s.name).join(' › ')}</Text>
      ) : null}

      {homeAssets.length && unit ? (
        <>
          <SectionTitle>{'Your home · ' + unit.name}</SectionTitle>
          {homeAssets.map((a) => (
            <ListRow
              key={a.id}
              title={a.name}
              subtitle={a.spacePath ?? a.typeName}
              leading={<AssetIcon type={a.type} catalog={catalog} />}
              onPress={() => onAsset(a)}
            />
          ))}
        </>
      ) : null}

      {here.length ? (
        <>
          <SectionTitle>{isRoot ? 'Building-wide' : 'In ' + place.name}</SectionTitle>
          {here.map((a) => (
            <AssetRow key={a.id} asset={a} catalog={catalog} onPress={() => onAsset(a)} />
          ))}
        </>
      ) : null}

      {node?.children.length ? (
        <>
          <SectionTitle>{isRoot ? 'Places' : 'Inside ' + place.name}</SectionTitle>
          {node.children.map((c) => {
            const n = subtreeCount.get(c.id) ?? 0;
            return (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={n ? n + (n === 1 ? ' thing to report on' : ' things to report on') : undefined}
                leading={<SpaceTypeIcon type={c.type} />}
                onPress={() => onOpenPlace(c.id)}
              />
            );
          })}
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onSomethingElse}
        style={({ pressed }) => [styles.else, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={{ fontSize: 24 }}>❓</Text>
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>Something else here</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Not in the list? Describe it in a few words.</Text>
        </View>
      </Pressable>
    </View>
  );
}

function ProblemStep({
  buildingId,
  asset,
  catalog,
  meTooBusy,
  error,
  onProblem,
  onMeToo,
}: {
  buildingId: UUID;
  asset: AssetDto;
  catalog: AssetTypeDto[];
  meTooBusy: boolean;
  error: unknown;
  onProblem: (p: Problem) => void;
  onMeToo: (issueId: UUID, number: number) => void;
}) {
  const { colors } = useTheme();
  const open = useOpenIssuesOnAsset(buildingId, asset.id);
  const problems = (catalog.find((t) => t.code === asset.type)?.problemTypes ?? []).filter((p) => p.active);
  const openByProblem = new Map((open.data ?? []).filter((i) => i.problemTypeId).map((i) => [i.problemTypeId!, i]));

  return (
    <View style={styles.step}>
      <Card style={styles.summary}>
        <AssetIcon type={asset.type} catalog={catalog} size={48} />
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{asset.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>{asset.spacePath}</Text>
        </View>
      </Card>

      <FormError message={error ? errorMessage(error) : null} />

      {open.isPending && open.fetchStatus !== 'idle' ? <InlineLoading /> : null}
      {open.data?.length ? (
        <>
          <SectionTitle>Already reported — is it one of these?</SectionTitle>
          {open.data.map((i) => (
            <AlreadyReportedCard
              key={i.id}
              number={i.number}
              title={i.title}
              status={i.status}
              affectedCount={i.affectedCount}
              loading={meTooBusy}
              alreadyAffected={i.affectedByMe}
              onMeToo={() => onMeToo(i.id, i.number)}
              onOpen={() => router.push(`/buildings/${buildingId}/issues/${i.id}`)}
            />
          ))}
        </>
      ) : null}

      <SectionTitle>{open.data?.length ? 'Or something new?' : "What's wrong?"}</SectionTitle>
      <View style={styles.chips}>
        {problems.map((p) => {
          const already = openByProblem.get(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityHint={already ? `Already reported, ${affectedText(already.affectedCount)}` : undefined}
              onPress={() =>
                already
                  ? already.affectedByMe
                    ? router.push(`/buildings/${buildingId}/issues/${already.id}`)
                    : onMeToo(already.id, already.number)
                  : onProblem({ kind: 'catalog', type: p })
              }
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: already ? colors.surfaceAlt : colors.surface,
                  borderColor: already ? colors.warning : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{p.label}</Text>
              {already ? (
                <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>
                  {already.affectedByMe ? "Reported · you're on it" : 'Reported · tap for Me too'}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => onProblem({ kind: 'other' })}
          style={({ pressed }) => [styles.chip, { borderColor: colors.border, borderStyle: 'dashed', opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.chipText, { color: colors.text }]}>Other…</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Done({ step, buildingId, onAnother }: { step: Extract<Step, { name: 'done' }>; buildingId: UUID; onAnother: () => void }) {
  const issueId = step.issue?.id ?? step.joined?.issueId;
  return (
    <StateView
      glyph={step.queued ? '⇪' : '✓'}
      title={
        step.queued
          ? 'Saved — will send when you’re back online'
          : step.joined
            ? step.joined.alreadyAffected
              ? `You’re already on #${step.joined.number}`
              : `Added you as affected on #${step.joined.number}`
            : `Sent! #${step.issue?.number}`
      }
      message={
        step.queued
          ? 'Your report is stored on this phone and will be sent automatically.'
          : step.joined
            ? "You'll follow its progress together with your neighbours."
            : "Thanks — you'll see updates under Issues."
      }
      action={issueId ? { label: 'View issue', onPress: () => router.replace(`/buildings/${buildingId}/issues/${issueId}`) } : { label: 'Done', onPress: () => router.back() }}
      secondaryAction={issueId ? { label: 'Done', onPress: () => router.back() } : { label: 'Report another', onPress: onAnother }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  back: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  step: { gap: spacing.md },
  h1: { fontSize: 24, fontWeight: '800' },
  summary: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: TAP_MIN + 8,
    minWidth: '47%',
    flexGrow: 1,
    borderWidth: 2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  chipText: { fontSize: 18, fontWeight: '700' },
  else: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_MIN + 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  send: { minHeight: 64 },
});
