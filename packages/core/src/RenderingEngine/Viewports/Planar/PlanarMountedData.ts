import type {
  ActorEntry,
  IImage,
  IImageVolume,
  VOIRange,
} from '../../../types';
import type { VOILUTFunctionType } from '../../../enums';
import { isImageRenderMode } from '../../helpers/renderBackendRegistry';
import { isSegmentationOverlayData } from '../renderingFidelity';
import { getImageScalarRange, getVolumeScalarRange } from '../scalarRange';
import type {
  BindingRole,
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import type {
  PlanarDisplaySetAppearance,
  PlanarPayload,
  PlanarMountOptions,
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

  resolveBindingRole(options: PlanarMountOptions): BindingRole {
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

  /**
   * The display set whose data has this volume id: the source when its data
   * has it, else the first such display set in mount order.
   */
  findDisplaySetIdByVolumeId(volumeId: string): string | undefined {
    let firstDisplaySetId: string | undefined;

    for (const [displaySetId, binding] of this.host.getBindings()) {
      const bindingVolumeId = (
        binding.data as LoadedData<PlanarPayload> | undefined
      )?.volumeId;

      if (bindingVolumeId !== volumeId) {
        continue;
      }

      if (binding.role === 'source') {
        return displaySetId;
      }

      firstDisplaySetId ??= displaySetId;
    }

    return firstDisplaySetId;
  }

  /**
   * The ids of the volumes that the display sets draw, each once: the
   * source first, then in mount order. A display set drawn as images (stack
   * mode) draws no volume. The labelmap overlay of a segmentation is left
   * out unless `includeSegmentations` is true.
   */
  getVolumeIds(includeSegmentations: boolean): string[] {
    const bindings = Array.from(
      this.host.getBindings(),
      ([, binding]) => binding
    );
    const volumeIds = new Set<string>();

    for (const binding of [
      ...bindings.filter(({ role }) => role === 'source'),
      ...bindings.filter(({ role }) => role !== 'source'),
    ]) {
      const data = binding.data as LoadedData<PlanarPayload> | undefined;
      const options = {
        renderMode: binding.rendering.renderMode,
        role: binding.role,
      };

      if (
        !data?.volumeId ||
        isImageRenderMode(options.renderMode) ||
        (!includeSegmentations && isSegmentationOverlayData(data, options))
      ) {
        continue;
      }

      volumeIds.add(data.volumeId);
    }

    return Array.from(volumeIds);
  }

  /**
   * The volume that a display set draws (the current one when not given),
   * or undefined when it draws images.
   */
  getImageVolume(displaySetId?: string): IImageVolume | undefined {
    const binding = this.getTargetBinding(displaySetId);

    if (!binding || isImageRenderMode(binding.rendering.renderMode)) {
      return;
    }

    const rendering = binding.rendering as { imageVolume?: IImageVolume };

    return (
      rendering.imageVolume ??
      (binding.data as LoadedData<PlanarPayload>).imageVolume
    );
  }

  /**
   * The range of the values of the data of a display set (the current one
   * when not given): of the image on display when it draws images, of the
   * whole volume when it draws a volume. See
   * `PlanarViewport.getScalarRange`.
   */
  getScalarRange(displaySetId?: string): [number, number] | undefined {
    const binding = this.getTargetBinding(displaySetId);

    if (!binding) {
      return;
    }

    if (!isImageRenderMode(binding.rendering.renderMode)) {
      return getVolumeScalarRange(this.getImageVolume(displaySetId));
    }

    const rendering = binding.rendering as {
      currentImage?: IImage;
      enabledElement?: { image?: IImage };
    };

    return getImageScalarRange(
      rendering.currentImage ??
        rendering.enabledElement?.image ??
        (binding.data as LoadedData<PlanarPayload>).image
    );
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

  /**
   * The VOI LUT function of the image of a display set from its metadata,
   * which its rendering draws with when the appearance does not set one, or
   * undefined when the rendering has none.
   */
  getDefaultVOILUTFunction(
    displaySetId?: string
  ): VOILUTFunctionType | undefined {
    const targetDisplaySetId =
      displaySetId ??
      this.sourceDisplaySetId ??
      this.getCurrentBinding()?.data.id;
    const rendering = targetDisplaySetId
      ? (this.host.getBinding(targetDisplaySetId)?.rendering as
          | { defaultVOILUTFunction?: VOILUTFunctionType }
          | undefined)
      : undefined;

    return rendering?.defaultVOILUTFunction;
  }

  private getTargetBinding(
    displaySetId?: string
  ): PlanarDataBinding | undefined {
    return displaySetId
      ? this.host.getBinding(displaySetId)
      : this.getCurrentBinding();
  }

  private promoteFirstAvailableBindingToSource(): void {
    const firstBindingDisplaySetId = this.getFirstBoundDisplaySetId();

    if (firstBindingDisplaySetId) {
      this.promoteSourceDisplaySetId(firstBindingDisplaySetId);
    }
  }
}

export default PlanarMountedData;
