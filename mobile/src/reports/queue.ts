import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import {
  ApiError,
  NetworkError,
  type DuplicateIssueInfo,
  type IssueDto,
  type ReportIssueRequest,
  type UUID,
} from '@condo/shared';
import { api } from '../api/client';
import { queryClient } from '../api/queryClient';
import { queryKeys } from '../api/queryKeys';
import { errorMessage } from '../lib/errors';
import { photoForm, type LocalPhoto } from '../lib/photos';
import { newId } from '../lib/uuid';

/**
 * Offline-tolerant report outbox.
 *
 * Every report is written here (AsyncStorage) *before* the first send attempt, with the
 * clientRequestId it was created with, so nothing is lost if the app dies or the network drops.
 * The server makes re-sends idempotent per clientRequestId. Items are retried on reconnect and on
 * app start (see ReportQueueRunner). Non-network failures move to "failed" for retry/discard.
 */

export interface QueuedReport {
  clientRequestId: UUID;
  /** Only the user who wrote it sends it (shared devices, sign-out/in). */
  userId: UUID;
  buildingId: UUID;
  req: ReportIssueRequest;
  /** For lists/notices: "Flickering · Stairwell light". */
  title: string;
  location: string;
  photos: LocalPhoto[];
  createdAt: string;
  state: 'pending' | 'failed';
  /** Set once the issue exists (created, or the duplicate we joined); remaining work = photos. */
  issueId?: UUID;
  issueNumber?: number;
  error?: string;
  attempts: number;
}

export interface QueueNotice {
  id: string;
  buildingId: UUID;
  issueId?: UUID;
  text: string;
  at: string;
}

interface State {
  loaded: boolean;
  items: QueuedReport[];
  notices: QueueNotice[];
}

const KEY = 'condo.reportQueue.v1';
let state: State = { loaded: false, items: [], notices: [] };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ items: state.items, notices: state.notices }));
  } catch (e) {
    console.warn('Could not persist report queue', e);
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
  void persist();
}

export function loadQueue(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const parsed = raw ? (JSON.parse(raw) as Partial<State>) : {};
        state = { loaded: true, items: parsed.items ?? [], notices: parsed.notices ?? [] };
      } catch {
        state = { ...state, loaded: true };
      }
      emit();
    })();
  }
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useReportQueue(userId: UUID | undefined, buildingId?: UUID) {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const mine = s.items.filter((i) => i.userId === userId && (!buildingId || i.buildingId === buildingId));
  return {
    pending: mine.filter((i) => i.state === 'pending'),
    failed: mine.filter((i) => i.state === 'failed'),
    notices: s.notices.filter((n) => !buildingId || n.buildingId === buildingId),
  };
}

function update(id: UUID, patch: Partial<QueuedReport>) {
  set({ items: state.items.map((i) => (i.clientRequestId === id ? { ...i, ...patch } : i)) });
}

function remove(id: UUID) {
  set({ items: state.items.filter((i) => i.clientRequestId !== id) });
}

export function addNotice(n: Omit<QueueNotice, 'id' | 'at'>) {
  set({ notices: [{ ...n, id: newId(), at: new Date().toISOString() }, ...state.notices].slice(0, 20) });
}

export function dismissNotice(id: string) {
  set({ notices: state.notices.filter((n) => n.id !== id) });
}

export async function enqueue(item: Omit<QueuedReport, 'state' | 'attempts' | 'createdAt'>): Promise<QueuedReport> {
  await loadQueue();
  const full: QueuedReport = { ...item, state: 'pending', attempts: 0, createdAt: new Date().toISOString() };
  set({ items: [...state.items.filter((i) => i.clientRequestId !== item.clientRequestId), full] });
  return full;
}

export function discard(id: UUID) {
  remove(id);
}

export function retryFailed(id: UUID) {
  update(id, { state: 'pending', error: undefined });
}

function invalidateIssues(buildingId: UUID) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.issues(buildingId) });
}

export type SendOutcome =
  | { kind: 'sent'; issue: IssueDto }
  | { kind: 'duplicate'; duplicate: DuplicateIssueInfo }
  | { kind: 'joined'; duplicate: DuplicateIssueInfo }
  | { kind: 'queued' }
  | { kind: 'failed'; error: unknown };

/** Upload the item's remaining photos. Returns false when the network dropped (item stays queued). */
async function uploadPhotos(item: QueuedReport): Promise<boolean> {
  let photos = [...item.photos];
  while (photos.length) {
    const p = photos[0];
    try {
      await api.issues.uploadPhoto(item.buildingId, item.issueId!, await photoForm(p));
    } catch (e) {
      if (e instanceof NetworkError) {
        update(item.clientRequestId, { photos });
        return false;
      }
      // Bad file, limit reached, or the local file is gone: drop that photo, but say so.
      addNotice({
        buildingId: item.buildingId,
        issueId: item.issueId,
        text: `A photo couldn't be attached to #${item.issueNumber ?? ''} (${errorMessage(e)}).`,
      });
    }
    photos = photos.slice(1);
    update(item.clientRequestId, { photos });
  }
  return true;
}

/**
 * Sends one queued item. `interactive`: the user is watching (report screen) — a duplicate is
 * handed back for them to decide (Me too). In the background a duplicate is joined automatically.
 */
export async function sendOne(id: UUID, interactive = false): Promise<SendOutcome> {
  await loadQueue();
  let item = state.items.find((i) => i.clientRequestId === id);
  if (!item) return { kind: 'failed', error: new Error('Report not found') };
  update(id, { attempts: item.attempts + 1 });

  let outcome: SendOutcome;
  if (!item.issueId) {
    try {
      const issue = await api.issues.report(item.buildingId, { ...item.req, clientRequestId: item.clientRequestId });
      update(id, { issueId: issue.id, issueNumber: issue.number });
      outcome = { kind: 'sent', issue };
      if (!interactive) {
        addNotice({ buildingId: item.buildingId, issueId: issue.id, text: `Your report “${item.title}” was sent (#${issue.number}).` });
      }
    } catch (e) {
      if (e instanceof NetworkError) return { kind: 'queued' };
      const dup = e instanceof ApiError && e.problem.code === 'DUPLICATE_ISSUE' ? e.problem.duplicate : undefined;
      if (dup && interactive) {
        // The report screen shows the duplicate card; the user chooses Me too (photos follow then).
        remove(id);
        return { kind: 'duplicate', duplicate: dup };
      }
      if (dup) {
        try {
          if (!dup.alreadyAffected) await api.issues.meToo(item.buildingId, dup.issueId);
        } catch (e2) {
          if (e2 instanceof NetworkError) return { kind: 'queued' };
          update(id, { state: 'failed', error: errorMessage(e2) });
          return { kind: 'failed', error: e2 };
        }
        update(id, { issueId: dup.issueId, issueNumber: dup.number });
        addNotice({
          buildingId: item.buildingId,
          issueId: dup.issueId,
          text: dup.alreadyAffected
            ? `You had already reported “${dup.title}” (#${dup.number}).`
            : `Someone had already reported “${dup.title}” — we added you as affected (#${dup.number}).`,
        });
        outcome = { kind: 'joined', duplicate: dup };
      } else {
        update(id, { state: 'failed', error: errorMessage(e) });
        return { kind: 'failed', error: e };
      }
    }
  } else {
    outcome = { kind: 'queued' };
  }

  const current = state.items.find((i) => i.clientRequestId === id)!;
  invalidateIssues(current.buildingId);
  const onlyPhotosLeft = outcome.kind === 'queued';
  const finish = async (): Promise<boolean> => {
    const done = await uploadPhotos(current);
    if (done) {
      remove(id);
      if (current.photos.length) invalidateIssues(current.buildingId);
      if (onlyPhotosLeft) {
        addNotice({ buildingId: current.buildingId, issueId: current.issueId, text: `Photos added to #${current.issueNumber ?? ''}.` });
      }
    }
    // Not done = network dropped mid-upload; the item stays pending with the remaining photos.
    return done;
  };
  if (interactive) {
    // The issue exists: don't make the user wait for photo uploads.
    void finish();
    return outcome;
  }
  const done = await finish();
  return done || !onlyPhotosLeft ? outcome : { kind: 'queued' };
}

let running: Promise<void> | null = null;

/** Retry every pending item of this user. Single-flight; stops at the first network failure. */
export function processQueue(userId: UUID): Promise<void> {
  if (!running) {
    running = (async () => {
      try {
        await loadQueue();
        const ids = state.items.filter((i) => i.userId === userId && i.state === 'pending').map((i) => i.clientRequestId);
        for (const id of ids) {
          const outcome = await sendOne(id);
          if (outcome.kind === 'queued' && state.items.some((i) => i.clientRequestId === id)) break;
        }
      } finally {
        running = null;
      }
    })();
  }
  return running;
}
