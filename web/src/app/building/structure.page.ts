import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CreateSpaceRequest,
  SPACE_TYPE_LABELS,
  SpaceDto,
  SpaceNode,
  SpaceType,
  UUID,
  UpdateSpaceRequest,
  Visibility,
} from '@condo/shared';
import { ApiService } from '../core/api.service';
import { ConfirmService } from '../core/confirm.service';
import { errorCode } from '../core/errors';
import { ToastService } from '../core/toast.service';
import { ModalComponent } from '../shared/modal.component';
import { flattenTree, moveTargets, reorderPlan, subtreeIds } from '../shared/space-utils';
import { StructureWizardComponent } from '../shared/structure-wizard.component';
import { BuildingContext } from './building-context.service';

type VisibilityChoice = 'INHERIT' | Visibility;
type ChildType = CreateSpaceRequest['type'];

export const SPACE_ICONS: Record<SpaceType, string> = {
  BUILDING: '🏢',
  FLOOR: '▤',
  UNIT: '🚪',
  ROOM: '▫',
  COMMON_AREA: '◎',
};

const CHILD_TYPES: ChildType[] = ['FLOOR', 'UNIT', 'ROOM', 'COMMON_AREA'];

/** Sensible default child type for a parent. */
function defaultChildType(parent: SpaceType): ChildType {
  switch (parent) {
    case 'BUILDING':
      return 'FLOOR';
    case 'FLOOR':
      return 'UNIT';
    default:
      return 'ROOM';
  }
}

@Component({
  selector: 'app-structure-page',
  imports: [ReactiveFormsModule, ModalComponent, StructureWizardComponent],
  templateUrl: './structure.page.html',
})
export class StructurePage {
  protected readonly ctx = inject(BuildingContext);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly wizard = viewChild(StructureWizardComponent);

  protected readonly typeLabels = SPACE_TYPE_LABELS;
  protected readonly icons = SPACE_ICONS;
  protected readonly childTypes = CHILD_TYPES;

  protected readonly filter = signal('');
  protected readonly expanded = signal<ReadonlySet<UUID>>(new Set());
  protected readonly openId = signal<UUID | null>(null);
  protected readonly busy = signal(false);

  protected readonly renameCtl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] });
  protected readonly addTypeCtl = new FormControl<ChildType>('FLOOR', { nonNullable: true });
  protected readonly addNameCtl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] });

  protected readonly moving = signal<SpaceDto | null>(null);
  protected readonly moveFilter = signal('');

  protected readonly wizardOpen = signal(false);
  protected readonly wizardConflict = signal(false);

  private initializedFor: UUID | null = null;

  /** Nodes the current user may edit (STRUCTURE_EDIT), computed once per spaces/permissions change. */
  protected readonly editable = computed(() => {
    const ids = new Set<UUID>();
    for (const s of this.ctx.spaces()) if (this.ctx.can('STRUCTURE_EDIT', s.id)) ids.add(s.id);
    return ids;
  });
  protected readonly canEditAny = computed(() => this.editable().size > 0);
  protected readonly canQuickSetup = computed(() => {
    const root = this.ctx.tree();
    return !!root && this.editable().has(root.id);
  });

  protected readonly nodeById = computed(() => {
    const map = new Map<UUID, SpaceNode>();
    const walk = (n: SpaceNode) => {
      map.set(n.id, n);
      n.children.forEach(walk);
    };
    const root = this.ctx.tree();
    if (root) walk(root);
    return map;
  });

  protected readonly rows = computed(() => flattenTree(this.ctx.tree(), this.expanded(), this.filter()));
  protected readonly filtering = computed(() => this.filter().trim().length > 0);

  protected readonly moveOptions = computed(() => {
    const node = this.moving();
    if (!node) return [];
    const editable = this.editable();
    const labels = this.ctx.labels();
    const q = this.moveFilter().trim().toLowerCase();
    return moveTargets(this.ctx.spaces(), node.id, (t) => editable.has(t.id))
      .map((s) => ({ space: s, label: labels.get(s.id) ?? s.name }))
      .filter((o) => !q || o.label.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  });

  constructor() {
    // First load of a building: expand the root; also its children when the tree is small.
    effect(() => {
      const root = this.ctx.tree();
      const id = this.ctx.buildingId();
      if (!root || id === this.initializedFor) return;
      this.initializedFor = id;
      const small = this.ctx.spaces().length <= 60;
      untracked(() => this.expanded.set(new Set([root.id, ...(small ? root.children.map((c) => c.id) : [])])));
    });
  }

  // ---------- tree navigation ----------

  protected toggle(id: UUID): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected expandAll(): void {
    this.expanded.set(new Set(this.ctx.spaces().map((s) => s.id)));
  }

  protected collapseAll(): void {
    const root = this.ctx.tree();
    this.expanded.set(new Set(root ? [root.id] : []));
  }

  private expand(id: UUID): void {
    if (!this.expanded().has(id)) this.toggle(id);
  }

  protected toggleTools(node: SpaceNode): void {
    if (this.openId() === node.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(node.id);
    this.renameCtl.reset(node.name);
    this.addNameCtl.reset('');
    this.addTypeCtl.setValue(defaultChildType(node.type));
  }

  protected visibilityChoice(node: SpaceDto): VisibilityChoice {
    return node.visibility ?? 'INHERIT';
  }

  /** Position among siblings: used to disable up/down at the edges. */
  protected siblingIndex(node: SpaceNode): { index: number; count: number } {
    const parent = node.parentId ? this.nodeById().get(node.parentId) : undefined;
    const siblings = parent?.children ?? [];
    return { index: siblings.findIndex((s) => s.id === node.id), count: siblings.length };
  }

  // ---------- mutations ----------

  private updateRequest(node: SpaceDto, patch: Partial<UpdateSpaceRequest>): UpdateSpaceRequest {
    return { name: node.name, type: node.type, visibility: node.visibility, sortOrder: node.sortOrder, ...patch };
  }

  /** Runs a mutation, reports errors, then refreshes the flat space list. */
  private async mutate(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      await fn();
      if (success) this.toast.success(success);
      return true;
    } catch (e) {
      this.toast.error(e);
      return false;
    } finally {
      await this.ctx.refreshSpaces();
      this.busy.set(false);
    }
  }

  private get bid(): UUID {
    return this.ctx.buildingId()!;
  }

  protected async rename(node: SpaceDto): Promise<void> {
    const name = this.renameCtl.value.trim();
    if (!name || name === node.name) return;
    await this.mutate(() => this.api.client.spaces.update(this.bid, node.id, this.updateRequest(node, { name })), 'Renamed');
  }

  protected async setVisibility(node: SpaceDto, choice: string): Promise<void> {
    const visibility = choice === 'INHERIT' ? null : (choice as Visibility);
    if (visibility === node.visibility) return;
    await this.mutate(() => this.api.client.spaces.update(this.bid, node.id, this.updateRequest(node, { visibility })));
  }

  protected async addChild(parent: SpaceDto): Promise<void> {
    this.addNameCtl.markAsTouched();
    const name = this.addNameCtl.value.trim();
    if (!name) return;
    const ok = await this.mutate(
      () => this.api.client.spaces.create(this.bid, { parentId: parent.id, type: this.addTypeCtl.value, name }),
      `Added “${name}”`,
    );
    if (ok) {
      this.addNameCtl.reset('');
      this.expand(parent.id);
    }
  }

  protected async reorder(node: SpaceNode, dir: -1 | 1): Promise<void> {
    const parent = node.parentId ? this.nodeById().get(node.parentId) : undefined;
    if (!parent) return;
    const plan = reorderPlan(parent.children, node.id, dir);
    if (!plan.length) return;
    const byId = this.ctx.spaceById();
    await this.mutate(async () => {
      for (const u of plan) {
        const s = byId.get(u.id);
        if (s) await this.api.client.spaces.update(this.bid, s.id, this.updateRequest(s, { sortOrder: u.sortOrder }));
      }
    });
  }

  protected async remove(node: SpaceNode): Promise<void> {
    const descendants = subtreeIds(this.ctx.spaces(), node.id).size - 1;
    const ok = await this.confirm.ask(
      descendants > 0
        ? {
            title: `Delete “${node.name}” and everything inside it?`,
            message: `This also deletes ${descendants} nested space${descendants === 1 ? '' : 's'}. This cannot be undone.`,
            confirmText: `Delete ${descendants + 1} spaces`,
            danger: true,
          }
        : { title: `Delete “${node.name}”?`, message: 'This cannot be undone.', confirmText: 'Delete', danger: true },
    );
    if (!ok) return;
    const deleted = await this.mutate(async () => {
      try {
        await this.api.client.spaces.remove(this.bid, node.id, descendants > 0);
      } catch (e) {
        // Someone added children since we loaded: ask again for a cascade.
        if (errorCode(e) !== 'SPACE_HAS_CHILDREN') throw e;
        const cascade = await this.confirm.ask({
          title: `“${node.name}” now has children`,
          message: 'Delete it together with all nested spaces?',
          confirmText: 'Delete all',
          danger: true,
        });
        if (cascade) await this.api.client.spaces.remove(this.bid, node.id, true);
      }
    }, `Deleted “${node.name}”`);
    if (deleted) this.openId.set(null);
  }

  // ---------- move ----------

  protected openMove(node: SpaceDto): void {
    this.moveFilter.set('');
    this.moving.set(node);
  }

  protected async moveTo(target: SpaceDto): Promise<void> {
    const node = this.moving();
    if (!node) return;
    const ok = await this.mutate(
      () => this.api.client.spaces.move(this.bid, node.id, { newParentId: target.id }),
      `Moved “${node.name}” to “${target.name}”`,
    );
    if (ok) {
      this.moving.set(null);
      this.expand(target.id);
    }
  }

  // ---------- quick setup ----------

  protected openWizard(): void {
    this.wizardConflict.set(false);
    this.wizardOpen.set(true);
  }

  protected async generate(append: boolean): Promise<void> {
    const wizard = this.wizard();
    if (!wizard) return;
    wizard.markAllTouched();
    if (!wizard.valid() || this.busy()) return;
    this.busy.set(true);
    try {
      const res = await this.api.client.spaces.generate(this.bid, { ...wizard.request(), ...(append ? { append: true } : {}) });
      this.toast.success(`Created ${res.created} spaces`);
      this.wizardOpen.set(false);
      this.initializedFor = null; // re-run the initial expansion for the new structure
      await this.ctx.refreshSpaces();
    } catch (e) {
      if (errorCode(e) === 'STRUCTURE_NOT_EMPTY' && !append) this.wizardConflict.set(true);
      else this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
