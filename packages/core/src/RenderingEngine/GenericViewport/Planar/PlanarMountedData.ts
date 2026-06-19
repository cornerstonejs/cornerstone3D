import type { ActorEntry, VOIRange } from '../../../types';
import type {
  BindingRole,
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import type {
  PlanarDataPresentation,
  PlanarPayload,
  PlanarSetDataOptions,
} from './PlanarViewportTypes';

export type PlanarDataBinding = ViewportDataBinding<PlanarDataPresentation>;

export type PlanarMountedDataHost = {
  getBinding(dataId: string): PlanarDataBinding | undefined;
  getFirstBinding(): PlanarDataBinding | undefined;
  getBindings(): Iterable<[string, PlanarDataBinding]>;
  removeData(dataId: string): void;
};

class PlanarMountedData {
  private sourceDataId?: string;

  constructor(private readonly host: PlanarMountedDataHost) {}

  resolveBindingRole(options: PlanarSetDataOptions): BindingRole {
    return options.role === 'source' ? 'source' : 'overlay';
  }

  getActiveDataId(): string | undefined {
    return this.sourceDataId;
  }

  clearActiveDataId(): void {
    this.sourceDataId = undefined;
  }

  getCurrentBinding(): PlanarDataBinding | undefined {
    if (this.sourceDataId) {
      return (
        this.host.getBinding(this.sourceDataId) ?? this.host.getFirstBinding()
      );
    }

    return this.host.getFirstBinding();
  }

  getFirstBoundDataId(): string | undefined {
    for (const [dataId] of this.host.getBindings()) {
      return dataId;
    }
  }

  hasBinding(dataId: string): boolean {
    return Boolean(this.host.getBinding(dataId));
  }

  promoteSourceDataId(dataId: string): void {
    for (const [bindingDataId, binding] of this.host.getBindings()) {
      binding.role = bindingDataId === dataId ? 'source' : 'overlay';
    }

    this.sourceDataId = dataId;
  }

  handleRemovedData(dataId: string): void {
    if (this.sourceDataId !== dataId) {
      return;
    }

    this.sourceDataId = undefined;
    this.promoteFirstAvailableBindingToSource();
  }

  removeBindingsExcept(keepDataIds: Set<string>): void {
    const dataIds = Array.from(this.host.getBindings(), ([dataId]) => dataId);

    for (const dataId of dataIds) {
      if (!keepDataIds.has(dataId)) {
        this.host.removeData(dataId);
      }
    }
  }

  getActorForDataId(dataId: string): ActorEntry | undefined {
    const binding = this.host.getBinding(dataId);

    return binding?.getActorEntry?.(binding.data);
  }

  getBindingActor(dataId: string): unknown {
    const rendering = this.host.getBinding(dataId)?.rendering as
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

      const actorEntry = binding.getActorEntry?.(binding.data);

      if (actorEntry) {
        actorEntries.push(actorEntry);
      }
    }

    return actorEntries;
  }

  findBindingDataIdByActorEntryUID(actorEntryUID: string): string | undefined {
    for (const [dataId, binding] of this.host.getBindings()) {
      const actorEntry = binding.getActorEntry?.(binding.data);

      if (actorEntry?.uid === actorEntryUID) {
        return dataId;
      }
    }
  }

  findDataIdByVolumeId(volumeId: string): string | undefined {
    for (const [dataId, binding] of this.host.getBindings()) {
      const bindingVolumeId = (
        binding.data as LoadedData<PlanarPayload> | undefined
      )?.volumeId;

      if (bindingVolumeId === volumeId) {
        return dataId;
      }
    }
  }

  getDefaultVOIRange(dataId?: string): VOIRange | undefined {
    const targetDataId =
      dataId ?? this.sourceDataId ?? this.getCurrentBinding()?.data.id;
    const rendering = targetDataId
      ? (this.host.getBinding(targetDataId)?.rendering as
          | { defaultVOIRange?: VOIRange }
          | undefined)
      : undefined;
    const defaultVOIRange = rendering?.defaultVOIRange;

    return defaultVOIRange ? { ...defaultVOIRange } : undefined;
  }

  private promoteFirstAvailableBindingToSource(): void {
    const firstBindingDataId = this.getFirstBoundDataId();

    if (firstBindingDataId) {
      this.promoteSourceDataId(firstBindingDataId);
    }
  }
}

export default PlanarMountedData;
