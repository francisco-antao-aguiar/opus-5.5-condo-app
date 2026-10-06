import { Injectable, computed, inject, signal } from '@angular/core';
import { Action, BuildingDto, MyPermissions, SpaceDto, UUID, buildSpaceTree, canDo } from '@condo/shared';
import { ApiService } from '../core/api.service';
import { errorCode } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { pathLabels } from '../shared/space-utils';

/**
 * Building-scoped state shared by the shell and its child pages.
 * Provided by BuildingShellComponent, so each visit to a building gets a fresh instance.
 */
@Injectable()
export class BuildingContext {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private loadSeq = 0;

  readonly buildingId = signal<UUID | null>(null);
  readonly building = signal<BuildingDto | null>(null);
  readonly perms = signal<MyPermissions | null>(null);
  readonly spaces = signal<SpaceDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<unknown>(null);

  readonly tree = computed(() => buildSpaceTree(this.spaces()));
  readonly spaceById = computed(() => new Map(this.spaces().map((s) => [s.id, s])));
  readonly labels = computed(() => pathLabels(this.spaces()));
  readonly units = computed(() =>
    this.spaces()
      .filter((s) => s.type === 'UNIT')
      .map((s) => ({ id: s.id, label: this.labels().get(s.id) ?? s.name }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  );

  /** Full-page states for the shell. */
  readonly accessDenied = computed(() => {
    const code = errorCode(this.error());
    return code === 'NOT_A_MEMBER' || code === 'MEMBERSHIP_EXPIRED' || code === 'PERMISSION_DENIED' ? code : null;
  });
  readonly notFound = computed(() => errorCode(this.error()) === 'NOT_FOUND');

  /** Holds `action` with any scope (for showing a whole section; per-target checks use can()). */
  has(action: Action): boolean {
    return !!this.perms()?.actions.some((g) => g.action === action);
  }

  /** Client-side permission hint (the server re-checks). */
  can(action: Action, targetId?: UUID | null): boolean {
    return canDo(this.perms(), action, targetId, this.spaces());
  }

  async load(id: UUID): Promise<void> {
    const seq = ++this.loadSeq;
    if (this.buildingId() !== id) {
      // Switching buildings: drop the previous building's state so children re-initialise.
      this.building.set(null);
      this.perms.set(null);
      this.spaces.set([]);
    }
    this.buildingId.set(id);
    this.loading.set(true);
    this.error.set(null);
    try {
      const c = this.api.client;
      const [building, perms, spaces] = await Promise.all([c.buildings.get(id), c.buildings.myPermissions(id), c.spaces.list(id)]);
      if (seq !== this.loadSeq) return;
      this.building.set(building);
      this.perms.set(perms);
      this.spaces.set(spaces);
    } catch (e) {
      if (seq !== this.loadSeq) return;
      this.error.set(e);
      this.building.set(null);
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  async reload(): Promise<void> {
    const id = this.buildingId();
    if (id) await this.load(id);
  }

  async refreshSpaces(): Promise<void> {
    const id = this.buildingId();
    if (!id) return;
    try {
      this.spaces.set(await this.api.client.spaces.list(id));
    } catch (e) {
      this.toast.error(e);
    }
  }

  async refreshPermissions(): Promise<void> {
    const id = this.buildingId();
    if (!id) return;
    try {
      this.perms.set(await this.api.client.buildings.myPermissions(id));
    } catch (e) {
      this.toast.error(e);
    }
  }
}
