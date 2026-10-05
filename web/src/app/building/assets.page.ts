import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AssetDto, AssetTypeDto, UUID } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { describeError, ErrorText } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { allowedSpaceIds, assetQuery, assetSpaceTargets, assetTypeIcon, spacesInTreeOrder } from '../shared/assets';
import { AssetDialogComponent } from './asset-dialog.component';
import { BuildingContext } from './building-context.service';
import { BulkAssetsDialogComponent } from './bulk-assets-dialog.component';

@Component({
  selector: 'app-assets-page',
  imports: [AssetDialogComponent, BulkAssetsDialogComponent],
  templateUrl: './assets.page.html',
})
export class AssetsPage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** ?space=<id> (component input binding), e.g. from the structure page's asset chip. */
  readonly space = input<string>();

  protected readonly icon = assetTypeIcon;
  protected readonly catalog = signal<AssetTypeDto[]>([]);
  protected readonly assets = signal<AssetDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<ErrorText | null>(null);

  // filters
  protected readonly spaceId = signal('');
  protected readonly includeDescendants = signal(true);
  protected readonly type = signal('');
  protected readonly search = signal('');
  private readonly q = signal('');
  protected readonly includeArchived = signal(false);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private loadSeq = 0;

  // dialogs
  protected readonly editing = signal<AssetDto | 'new' | null>(null);
  protected readonly bulkOpen = signal(false);

  protected readonly spaceOptions = computed(() => spacesInTreeOrder(this.ctx.spaces()));
  protected readonly createAllowed = computed(() => allowedSpaceIds(this.ctx.perms(), this.ctx.spaces(), 'ASSET_CREATE'));
  protected readonly canCreate = computed(() => this.createAllowed().size > 0);
  protected readonly editAllowed = computed(() => {
    const e = this.editing();
    if (!e) return new Set<UUID>();
    return e === 'new' ? this.createAllowed() : assetSpaceTargets(this.ctx.perms(), this.ctx.spaces(), { currentSpaceId: e.spaceId });
  });
  protected readonly typeByCode = computed(() => new Map(this.catalog().map((t) => [t.code, t])));
  protected readonly filtered = computed(() => !!(this.spaceId() || this.type() || this.q() || this.includeArchived()));
  protected readonly filterSpaceName = computed(() => this.ctx.spaceById().get(this.spaceId())?.name ?? '');

  constructor() {
    // Query param → space filter.
    effect(() => {
      const s = this.space() ?? '';
      untracked(() => this.spaceId.set(s));
    });
    effect(() => {
      const id = this.ctx.buildingId();
      if (id) untracked(() => void this.loadCatalog(id));
    });
    effect(() => {
      const id = this.ctx.buildingId();
      const query = assetQuery({
        spaceId: this.spaceId(),
        includeDescendants: this.includeDescendants(),
        type: this.type(),
        q: this.q(),
        includeArchived: this.includeArchived(),
      });
      if (id) untracked(() => void this.load(id, query));
    });
  }

  private async loadCatalog(buildingId: UUID): Promise<void> {
    try {
      this.catalog.set(await this.api.client.catalog.get(buildingId));
    } catch (e) {
      this.toast.error(e);
    }
  }

  private async load(buildingId: UUID, query: ReturnType<typeof assetQuery>): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.api.client.assets.list(buildingId, query);
      if (seq === this.loadSeq) this.assets.set(list);
    } catch (e) {
      if (seq === this.loadSeq) this.loadError.set(describeError(e));
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  protected reload(): void {
    // Re-run the load effect with the same filters.
    const id = this.ctx.buildingId();
    if (!id) return;
    void this.load(
      id,
      assetQuery({
        spaceId: this.spaceId(),
        includeDescendants: this.includeDescendants(),
        type: this.type(),
        q: this.q(),
        includeArchived: this.includeArchived(),
      }),
    );
    void this.ctx.refreshSpaces(); // asset counts on the structure page
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.q.set(value), 250);
  }

  protected setSpace(id: string): void {
    this.spaceId.set(id);
    // Keep the URL shareable / in sync with the structure page link.
    void this.router.navigate([], { queryParams: { space: id || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected clearFilters(): void {
    this.setSpace('');
    this.type.set('');
    this.setSearch('');
    this.includeArchived.set(false);
    this.includeDescendants.set(true);
  }

  protected indent(depth: number): string {
    return '  '.repeat(depth);
  }

  protected canEdit(a: AssetDto): boolean {
    return !a.archived && this.ctx.can('ASSET_EDIT', a.spaceId);
  }

  protected canArchive(a: AssetDto): boolean {
    return this.ctx.can('ASSET_DELETE', a.spaceId);
  }

  protected async restore(a: AssetDto): Promise<void> {
    try {
      const r = await this.api.client.assets.restore(this.ctx.buildingId()!, a.id);
      this.toast.success(`Restored “${r.name}”`);
      this.reload();
    } catch (e) {
      this.toast.error(e);
    }
  }
}
