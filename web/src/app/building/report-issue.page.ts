import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AssetDto, AssetTypeDto, DuplicateIssueInfo, IssueSummaryDto, SpaceDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, errorCode, ErrorText, problemOf } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { allowedSpaceIds, assetCodeIcon, assetTypeIcon, spacesInTreeOrder } from '../shared/assets';
import {
  MAX_PHOTOS,
  STATUS_BADGE,
  buildReportRequest,
  newClientRequestId,
  pickPhotos,
  reportProblemReady,
  statusLabel,
} from '../shared/issues';
import { BuildingContext } from './building-context.service';

type Step = 0 | 1 | 2 | 3;
const STEPS = ['Place', 'Item', 'Problem', 'Details'];

@Component({
  selector: 'app-report-issue-page',
  imports: [RouterLink],
  templateUrl: './report-issue.page.html',
})
export class ReportIssuePage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Query params: start from a place or straight from an asset. */
  readonly space = input<string>();
  readonly asset = input<string>();

  protected readonly steps = STEPS;
  protected readonly step = signal<Step>(0);
  protected readonly statusLabel = statusLabel;
  protected readonly badge = STATUS_BADGE;
  protected readonly typeIcon = assetTypeIcon;
  protected readonly codeIcon = assetCodeIcon;
  protected readonly maxPhotos = MAX_PHOTOS;

  // step 0
  protected readonly placeFilter = signal('');
  protected readonly placeId = signal<UUID | null>(null);
  // step 1
  protected readonly assets = signal<AssetDto[]>([]);
  protected readonly assetsLoading = signal(false);
  /** undefined = not chosen yet; null = "Something else here". */
  protected readonly chosenAsset = signal<AssetDto | null | undefined>(undefined);
  // step 2
  protected readonly catalog = signal<AssetTypeDto[]>([]);
  protected readonly openIssues = signal<IssueSummaryDto[]>([]);
  protected readonly problemTypeId = signal<UUID | null>(null);
  protected readonly other = signal(false);
  protected readonly otherText = signal('');
  // step 3
  protected readonly note = signal('');
  protected readonly share = signal(false);
  protected readonly photos = signal<File[]>([]);
  protected readonly photoErrors = signal<string[]>([]);

  protected readonly submitting = signal(false);
  protected readonly error = signal<ErrorText | null>(null);
  protected readonly duplicate = signal<DuplicateIssueInfo | null>(null);
  /** Stable across retries of the same report so a resend can't create a second issue. */
  private clientRequestId = newClientRequestId();

  protected readonly reportable = computed(() => allowedSpaceIds(this.ctx.perms(), this.ctx.spaces(), 'ISSUE_REPORT'));
  protected readonly places = computed(() => {
    const q = this.placeFilter().trim().toLowerCase();
    const ok = this.reportable();
    return spacesInTreeOrder(this.ctx.spaces()).filter((o) => ok.has(o.space.id) && (!q || o.label.toLowerCase().includes(q)));
  });
  protected readonly place = computed<SpaceDto | null>(() => (this.placeId() ? (this.ctx.spaceById().get(this.placeId()!) ?? null) : null));
  protected readonly placeLabel = computed(() => {
    const id = this.placeId();
    return id ? (spacesInTreeOrder(this.ctx.spaces()).find((o) => o.space.id === id)?.label ?? '') : '';
  });
  protected readonly assetType = computed(() => {
    const a = this.chosenAsset();
    return a ? (this.catalog().find((t) => t.code === a.type) ?? null) : null;
  });
  protected readonly problems = computed(() => (this.assetType()?.problemTypes ?? []).filter((p) => p.active));
  protected readonly isPrivate = computed(() => {
    const a = this.chosenAsset();
    return (a ? a.effectiveVisibility : this.place()?.effectiveVisibility) === 'PRIVATE';
  });
  protected readonly problemTitle = computed(() =>
    this.other() || !this.chosenAsset() ? this.otherText().trim() : (this.problems().find((p) => p.id === this.problemTypeId())?.label ?? ''),
  );
  protected readonly ready = computed(() =>
    reportProblemReady({ assetId: this.chosenAsset()?.id ?? null, problemTypeId: this.other() ? null : this.problemTypeId(), otherText: this.otherText() }),
  );

  private started = false;

  constructor() {
    effect(() => {
      const b = this.ctx.buildingId();
      if (b) untracked(() => this.api.client.catalog.get(b).then((c) => this.catalog.set(c), (e) => this.toast.error(e)));
    });
    // Deep links: ?asset= jumps to the problem step, ?space= to the item step.
    effect(() => {
      const b = this.ctx.buildingId();
      const spacesLoaded = this.ctx.spaces().length > 0;
      if (!b || !spacesLoaded || this.started) return;
      this.started = true;
      const assetId = this.asset();
      const spaceId = this.space();
      untracked(() => {
        if (assetId) void this.startFromAsset(b, assetId);
        else if (spaceId && this.ctx.spaceById().has(spaceId)) void this.pickPlace(spaceId);
      });
    });
  }

  private get bid(): UUID {
    return this.ctx.buildingId()!;
  }

  private async startFromAsset(b: UUID, assetId: UUID): Promise<void> {
    try {
      const a = await this.api.client.assets.get(b, assetId);
      if (a.spaceId) this.placeId.set(a.spaceId);
      await this.loadAssets();
      await this.pickAsset(a);
    } catch (e) {
      this.toast.error(e);
    }
  }

  protected goTo(step: Step): void {
    if (step < this.step()) this.step.set(step);
  }

  // ---------- step 0 → 1 ----------

  protected async pickPlace(id: UUID): Promise<void> {
    if (id !== this.placeId()) {
      this.chosenAsset.set(undefined);
      this.resetProblem();
    }
    this.placeId.set(id);
    this.step.set(1);
    await this.loadAssets();
  }

  private async loadAssets(): Promise<void> {
    const id = this.placeId();
    if (!id) return;
    this.assetsLoading.set(true);
    try {
      this.assets.set(await this.api.client.assets.list(this.bid, { spaceId: id, includeDescendants: false }));
    } catch (e) {
      this.toast.error(e);
      this.assets.set([]);
    } finally {
      this.assetsLoading.set(false);
    }
  }

  // ---------- step 1 → 2 ----------

  private resetProblem(): void {
    this.problemTypeId.set(null);
    this.other.set(false);
    this.otherText.set('');
    this.openIssues.set([]);
    this.duplicate.set(null);
    this.error.set(null);
  }

  protected async pickAsset(a: AssetDto | null): Promise<void> {
    if (a?.id !== this.chosenAsset()?.id || this.chosenAsset() === undefined) this.resetProblem();
    this.chosenAsset.set(a);
    if (!a) {
      this.other.set(true);
      this.step.set(2);
      return;
    }
    try {
      this.openIssues.set(await this.api.client.issues.openOnAsset(this.bid, a.id));
    } catch {
      this.openIssues.set([]); // not essential; the server still catches duplicates on submit
    }
    this.step.set(2);
  }

  protected pickProblem(id: UUID | null): void {
    this.duplicate.set(null);
    if (id === null) {
      this.other.set(true);
      this.problemTypeId.set(null);
    } else {
      this.other.set(false);
      this.problemTypeId.set(id);
      this.step.set(3);
    }
  }

  protected continueOther(): void {
    if (this.otherText().trim()) this.step.set(3);
  }

  // ---------- me too ----------

  protected async meToo(issueId: UUID): Promise<void> {
    try {
      const i = await this.api.client.issues.meToo(this.bid, issueId);
      this.toast.success(`You're on #${i.number}`, "We'll keep you posted. No need to report it again.");
      await this.router.navigate(['/buildings', this.bid, 'issues', i.id]);
    } catch (e) {
      this.toast.error(e);
    }
  }

  // ---------- step 3 ----------

  protected addPhotos(input: HTMLInputElement): void {
    const files = [...(input.files ?? [])];
    input.value = '';
    const { accepted, errors } = pickPhotos(files, this.photos().length);
    this.photoErrors.set(errors);
    this.photos.update((list) => [...list, ...accepted.map((i) => files[i]!)]);
  }

  protected removePhoto(i: number): void {
    this.photos.update((list) => list.filter((_, idx) => idx !== i));
  }

  protected async submit(): Promise<void> {
    const placeId = this.placeId();
    if (!placeId || !this.ready() || this.submitting()) return;
    const asset = this.chosenAsset() ?? null;
    this.submitting.set(true);
    this.error.set(null);
    this.duplicate.set(null);
    try {
      const issue = await this.api.client.issues.report(
        this.bid,
        buildReportRequest({
          spaceId: placeId,
          assetId: asset?.id ?? null,
          problemTypeId: this.other() ? null : this.problemTypeId(),
          otherText: this.otherText(),
          note: this.note(),
          sharedWithAdmins: this.share(),
          spaceIsPrivate: this.isPrivate(),
          clientRequestId: this.clientRequestId,
        }),
      );
      const failed: string[] = [];
      for (const f of this.photos()) {
        const form = new FormData();
        form.append('file', f, f.name);
        try {
          await this.api.client.issues.uploadPhoto(this.bid, issue.id, form);
        } catch (e) {
          failed.push(`${f.name}: ${describeError(e).title}`);
        }
      }
      if (failed.length) this.toast.info(`Reported #${issue.number}, but some photos failed`, failed.join(' · '));
      else this.toast.success(`Reported #${issue.number}`, 'Thanks! You can follow it here.');
      this.clientRequestId = newClientRequestId();
      await this.router.navigate(['/buildings', this.bid, 'issues', issue.id]);
    } catch (e) {
      if (errorCode(e) === 'DUPLICATE_ISSUE' && problemOf(e)?.duplicate) {
        this.duplicate.set(problemOf(e)!.duplicate!);
        this.clientRequestId = newClientRequestId();
      } else if (errorCode(e) === 'INVALID_PROBLEM_TYPE') {
        this.error.set(describeError(e));
        this.step.set(2);
        void this.api.client.catalog.get(this.bid).then((c) => this.catalog.set(c));
      } else {
        this.error.set(describeError(e));
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
