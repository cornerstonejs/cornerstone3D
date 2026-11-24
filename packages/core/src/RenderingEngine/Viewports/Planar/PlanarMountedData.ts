import type { ActorEntry, VOIRange } from '../../../types';
import type {
  BindingRole,
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import type {
  PlanarDisplaySetAppearance,
  PlanarPayload,
  PlanarSetDataOptions,
} from './PlanarViewportTypes';

export type PlanarDataBinding = ViewportDataBinding<PlanarDisplaySetAppearance>;

export type PlanarMountedDataHost = {
  getBinding(displaySetId: string): PlanarDataBinding | undefined;
  getFirstBinding(): PlanarDataBinding | undefined;
  getBindings(): Iterable<[string, PlanarDataBinding]>;
  removeDisplaySet(displaySetId: string): void;
};

class PlanarMountedData {
  private sourceDisplaySetId?: string;

  constructor(private readonly host: PlanarMountedDataHost) {}

  resolveBindingRole(options: PlanarSetDataOptions): BindingRole {
    return options.role === 'source' ? 'source' : 'overlay';
  }

  getSourceDisplaySetId(): string | undefined {
    return this.sourceDisplaySetId;
  }

  clearSourceDisplaySetId(): void {
    this.sourceDisplaySetId = undefined;
  }

  getCurrentBinding(): PlanarDataBinding | undefined {
    if (this.sourceDisplaySetId) {
      return (
        this.host.getBinding(this.sourceDisplaySetId) ??
        this.host.getFirstBinding()
      );
    }

    return this.host.getFirstBinding();
  }

  getFirstBoundDisplaySetId(): string | undefined {
    for (const [displaySetId] of this.host.getBindings()) {
      return displaySetId;
    }
  }

  hasBinding(displaySetId: string): boolean {
    return Boolean(this.host.getBinding(displaySetId));
  }

  promoteSourceDisplaySetId(displaySetId: string): void {
    for (const [bindingDisplaySetId, binding] of this.host.getBindings()) {
      binding.role =
        bindingDisplaySetId === displaySetId ? 'source' : 'overlay';
    }

    this.sourceDisplaySetId = displaySetId;
  }

  handleRemovedData(displaySetId: string): void {
    if (this.sourceDisplaySetId !== displaySetId) {
      return;
    }

    this.sourceDisplaySetId = undefined;
    this.promoteFirstAvailableBindingToSource();
  }

  removeBindingsExcept(keepDisplaySetIds: Set<string>): void {
    const displaySetIds = Array.from(
      this.host.getBindings(),
      ([displaySetId]) => displaySetId
    );

    for (const displaySetId of displaySetIds) {
      if (!keepDisplaySetIds.has(displaySetId)) {
        this.host.removeDisplaySet(displaySetId);
      }
    }
  }

  getActorForDisplaySetId(displaySetId: string): ActorEntry | undefined {
    const binding = this.host.getBinding(displaySetId);

    return binding?.getActorEntry?.(binding.data);
  }

  getBindingActor(displaySetId: string): unknown {
    const rendering = this.host.getBinding(displaySetId)?.rendering as
      | { actor?: unknown; compatibilityActor?: unknown }
      | undefined;

    return rendering?.actor ?? rendering?.compatibilityActor;
  }

  getActors(): ActorEntry[] {
    return [
      ...this.getProjectedActorEntries('source'),
      ...this.getProjectedActorEntries('overlay'),
    ];
  }

  getDefaultActor(): ActorEntry | undefined {
    return (
      this.getProjectedActorEntries('source')[0] ??
      this.getProjectedActorEntries()[0]
    );
  }

  getProjectedActorEntries(role?: BindingRole): ActorEntry[] {
    const actorEntries: ActorEntry[] = [];

    for (const [, binding] of this.host.getBindings()) {
      if (role && binding.role !== role) {
        continue;
      }

      if (binding.getActorEntries) {
        actorEntries.push(...binding.getActorEntries(binding.data));
        continue;
      }

      const actorEntry = binding.getActorEntry?.(binding.data);

      if (actorEntry) {
        actorEntries.push(actorEntry);
      }
    }

    return actorEntries;
  }

  findBindingDisplaySetIdByActorEntryUID(
    actorEntryUID: string
  ): string | undefined {
    for (const [displaySetId, binding] of this.host.getBindings()) {
      const actorEntry = binding.getActorEntry?.(binding.data);

      if (actorEntry?.uid === actorEntryUID) {
        return displaySetId;
      }
    }
  }

  findDisplaySetIdByVolumeId(volumeId: string): string | undefined {
    for (const [displaySetId, binding] of this.host.getBindings()) {
      const bindingVolumeId = (
        binding.data as LoadedData<PlanarPayload> | undefined
      )?.volumeId;

      if (bindingVolumeId === volumeId) {
        return displaySetId;
      }
    }
  }

  getDefaultVOIRange(displaySetId?: string): VOIRange | undefined {
    const targetDisplaySetId =
      displaySetId ??
      this.sourceDisplaySetId ??
      this.getCurrentBinding()?.data.id;
    const rendering = targetDisplaySetId
      ? (this.host.getBinding(targetDisplaySetId)?.rendering as
          | { defaultVOIRange?: VOIRange }
          | undefined)
      : undefined;
    const defaultVOIRange = rendering?.defaultVOIRange;

    return defaultVOIRange ? { ...defaultVOIRange } : undefined;
  }

  /**
   * The invert flag that the image of a display set starts with, from its
   * rendering, or undefined when the rendering has none.
   */
  getDefaultInvert(displaySetId?: string): boolean | undefined {
    const targetDisplaySetId =
      displaySetId ??
      this.sourceDisplaySetId ??
      this.getCurrentBinding()?.data.id;
    const rendering = targetDisplaySetId
      ? (this.host.getBinding(targetDisplaySetId)?.rendering as
          | { defaultInvert?: boolean }
          | undefined)
      : undefined;

    return rendering?.defaultInvert;
  }

  private promoteFirstAvailableBindingToSource(): void {
    const firstBindingDisplaySetId = this.getFirstBoundDisplaySetId();

    if (firstBindingDisplaySetId) {
      this.promoteSourceDisplaySetId(firstBindingDisplaySetId);
    }
  }
}

export default PlanarMountedData;
