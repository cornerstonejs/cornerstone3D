import cache from '../../../cache/cache';
import BlendModes from '../../../enums/BlendModes';
import { Events, OrientationAxis } from '../../../enums';
import {
  getRenderBackendForRenderMode,
  getSampledVolumeRenderModeForBackend,
  isVolumeRenderMode,
} from '../../helpers/renderBackendRegistry';
import RENDERING_DEFAULTS from '../../../constants/rendering';
import { getConfiguration } from '../../../init';
import { boundsRadius } from '../../helpers/boundsRadius';
import type { ActorEntry, ColormapPublic, IVolumeInput } from '../../../types';
import type { OpacityMapping } from '../../../types/Colormap';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  findMatchingColormap,
  getMaxOpacity,
  getThresholdValue,
} from '../../../utilities/colormap';
import { getTransferFunctionNodes } from '../../../utilities/transferFunctionUtils';
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import type { PlanarRendering } from './planarRuntimeTypes';
import {
  clonePlanarLegacyProperties,
  mergePlanarLegacyProperties,
  clonePlanarOrientation,
  type PlanarLegacyViewportProperties,
  toPlanarDataPresentation,
} from './planarLegacyCompatibility';
import { mapSlabTypeToBlendMode } from './planarVolumeSliceBlendMode';
import { getPlanarVolumesBounds } from './planarVolumeBounds';
import type {
  PlanarViewState,
  PlanarDataPresentation,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
} from './PlanarViewportTypes';

export const PLANAR_LEGACY_PER_IMAGE_DEFAULT_PROPERTIES_LIMIT = 2048;

export type PlanarLegacyCompatibilityHost = {
  getElement(): HTMLDivElement;
  getViewportId(): string;
  getRequestedOrientation(): PlanarViewState['orientation'];
  prepareVolumeCompatibilityCamera(): void;
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: PlanarSetDataOptions }>
  ): Promise<void>;
  addDisplaySet(
    displaySetId: string,
    options?: PlanarSetDataOptions
  ): Promise<void>;
  setImageIdIndex(imageIdIndex: number): Promise<string>;
  getCurrentImageId(): string | undefined;
  render(): void;
  removeBindingsExcept(keepDataIds: Set<string>): void;
  setCameraOrientation(orientation: PlanarViewState['orientation']): void;
  setDataPresentationState(
    dataId: string,
    presentation: PlanarDataPresentation
  ): void;
  setDisplaySetPresentation(
    displaySetId: string,
    presentation: Partial<PlanarDataPresentation>
  ): void;
  getDisplaySetPresentation(dataId: string): PlanarDataPresentation | undefined;
  notifyDataPresentationModified(
    dataId: string,
    presentation: Partial<PlanarDataPresentation>
  ): void;
  getCameraOrientation(): PlanarViewState['orientation'];
  triggerCameraReset(): void;
  getCurrentPlanarRendering(): PlanarRendering | undefined;
  getActiveDataId(): string | undefined;
  getFirstBoundDataId(): string | undefined;
  findDataIdByVolumeId(volumeId: string): string | undefined;
  getBindingActor(dataId: string): unknown;
  getBindingRenderMode(dataId: string): string | undefined;
  getDefaultVOIRange(
    dataId: string
  ): { lower: number; upper: number } | undefined;
  getDefaultInvert(dataId: string): boolean | undefined;
  getImageCount(): number;
  getMaxImageIdIndex(): number;
};

class PlanarLegacyCompatibilityController {
  private readonly managedDataIds = new Set<string>();
  // The data ids that a mount is currently applying to the viewport. See
  // mountVolumes and removeData.
  private readonly mountingDataIds = new Set<string>();
  private readonly volumeDataIds = new Map<string, string>();
  private stackSetRequestId = 0;
  private readonly properties = new Map<
    string,
    PlanarLegacyViewportProperties
  >();
  private readonly globalDefaultProperties = new Map<
    string,
    PlanarLegacyViewportProperties
  >();
  private readonly perImageIdDefaultProperties = new Map<
    string,
    PlanarLegacyViewportProperties
  >();

  private readonly onStackNewImage = (event: Event) => {
    if (this.perImageIdDefaultProperties.size === 0) {
      return;
    }

    const detail = (event as CustomEvent<{ imageId?: string }>).detail;
    const imageId = detail?.imageId;
    const targetDataId = this.resolveTargetDataId();

    if (!targetDataId) {
      return;
    }

    const perImageProps = imageId
      ? this.getPerImageDefaultProperties(imageId)
      : undefined;
    const globalProps = this.globalDefaultProperties.get(targetDataId);
    const propsToApply = perImageProps || globalProps;

    if (!propsToApply) {
      return;
    }

    this.setProperties(propsToApply);
  };

  constructor(private readonly host: PlanarLegacyCompatibilityHost) {
    host
      .getElement()
      .addEventListener(Events.STACK_NEW_IMAGE, this.onStackNewImage);
  }

  /**
   * Shows a stack of images. The images show in their acquisition plane,
   * whatever orientation the viewport options give, as on the legacy stack
   * viewport, which does not read that option.
   */
  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    if (!imageIds.length) {
      throw new Error('[PlanarViewport] Cannot set an empty stack');
    }

    const requestId = ++this.stackSetRequestId;
    const dataId = this.getLegacyStackDataId();
    const clampedImageIdIndex = Math.min(
      Math.max(0, currentImageIdIndex),
      imageIds.length - 1
    );
    let registered = false;

    try {
      this.host.removeBindingsExcept(new Set());
      this.registerDataSet(dataId, {
        imageIds,
        initialImageIdIndex: clampedImageIdIndex,
      });
      registered = true;

      await this.host.setDisplaySets({
        displaySetId: dataId,
        options: {
          orientation: OrientationAxis.ACQUISITION,
        },
      });

      if (requestId !== this.stackSetRequestId) {
        return imageIds[clampedImageIdIndex];
      }

      const resolvedImageId =
        await this.host.setImageIdIndex(clampedImageIdIndex);

      this.prunePerImageDefaultProperties(new Set(imageIds));

      return this.host.getCurrentImageId() || resolvedImageId;
    } catch (error) {
      if (registered && requestId === this.stackSetRequestId) {
        this.removeData(dataId);
      }
      throw error;
    }
  }

  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, true, suppressEvents);

    if (immediate) {
      this.host.render();
    }
  }

  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, false, suppressEvents);

    if (immediate) {
      this.host.render();
    }
  }

  /**
   * Sets the properties of a volume, or of the data that the viewport shows.
   * The second argument is the volume id, as on the legacy volume viewport,
   * or `suppressEvents`, as on the legacy stack viewport. VOI_MODIFIED is
   * suppressed by either form.
   */
  setProperties(
    properties: PlanarLegacyViewportProperties = {},
    volumeIdOrSuppressEvents?: string | boolean,
    suppressEvents = false
  ): void {
    const volumeId =
      typeof volumeIdOrSuppressEvents === 'string'
        ? volumeIdOrSuppressEvents
        : undefined;
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const nextProperties = mergePlanarLegacyProperties(
      this.properties.get(targetDataId) || {},
      properties
    );

    const currentDefaults =
      this.globalDefaultProperties.get(targetDataId) || {};
    this.globalDefaultProperties.set(
      targetDataId,
      mergePlanarLegacyProperties(properties, currentDefaults)
    );

    this.properties.set(targetDataId, nextProperties);

    if (properties.orientation !== undefined) {
      this.host.setCameraOrientation(
        clonePlanarOrientation(properties.orientation)
      );
    }

    this.host.setDataPresentationState(
      targetDataId,
      toPlanarDataPresentation(nextProperties)
    );

    if (volumeIdOrSuppressEvents !== true && !suppressEvents) {
      this.emitVOIModified(targetDataId, properties);
    }

    if (!suppressEvents && properties.colormap !== undefined) {
      this.emitColormapModified(targetDataId, volumeId);
    }
  }

  setDefaultProperties(
    properties: PlanarLegacyViewportProperties = {},
    imageId?: string
  ): void {
    if (imageId == null) {
      const targetDataId = this.resolveTargetDataId();
      if (!targetDataId) {
        return;
      }
      this.globalDefaultProperties.set(
        targetDataId,
        clonePlanarLegacyProperties(properties)
      );
      return;
    }

    this.setPerImageDefaultProperties(
      imageId,
      clonePlanarLegacyProperties(properties)
    );

    if (this.host.getCurrentImageId() === imageId) {
      this.setProperties(properties);
    }
  }

  clearDefaultProperties(imageId?: string): void {
    if (imageId == null) {
      const targetDataId = this.resolveTargetDataId();
      if (targetDataId) {
        this.globalDefaultProperties.delete(targetDataId);
      }
      this.resetProperties();
      return;
    }

    this.perImageIdDefaultProperties.delete(imageId);
    this.resetToDefaultProperties();
  }

  resetToDefaultProperties(): void {
    const targetDataId = this.resolveTargetDataId();
    if (!targetDataId) {
      return;
    }

    const currentImageId = this.host.getCurrentImageId();
    const defaultProperties =
      (currentImageId
        ? this.getPerImageDefaultProperties(currentImageId)
        : undefined) ||
      this.globalDefaultProperties.get(targetDataId) ||
      {};

    this.properties.set(
      targetDataId,
      clonePlanarLegacyProperties(defaultProperties)
    );

    if (defaultProperties.orientation !== undefined) {
      this.host.setCameraOrientation(
        clonePlanarOrientation(defaultProperties.orientation)
      );
    }

    this.host.setDataPresentationState(
      targetDataId,
      toPlanarDataPresentation(defaultProperties)
    );
  }

  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    const targetDataId = this.resolveTargetDataId(volumeId);
    const dataPresentation = targetDataId
      ? this.host.getDisplaySetPresentation(targetDataId)
      : undefined;
    const legacyProperties = targetDataId
      ? this.properties.get(targetDataId)
      : undefined;
    const merged: PlanarLegacyViewportProperties = {
      ...clonePlanarLegacyProperties(legacyProperties || {}),
      ...(dataPresentation
        ? clonePlanarLegacyProperties(
            dataPresentation as PlanarLegacyViewportProperties
          )
        : {}),
      ...(this.host.getCameraOrientation()
        ? {
            orientation: clonePlanarOrientation(
              this.host.getCameraOrientation()
            ),
          }
        : {}),
    };

    if (!merged.voiRange && targetDataId) {
      const defaultVOIRange = this.host.getDefaultVOIRange(targetDataId);
      if (defaultVOIRange) {
        merged.voiRange = { ...defaultVOIRange };
      }
    }

    if (merged.invert === undefined && targetDataId) {
      const defaultInvert = this.host.getDefaultInvert(targetDataId);

      if (defaultInvert !== undefined) {
        merged.invert = defaultInvert;
      }
    }

    return merged;
  }

  /**
   * Replaces the legacy properties kept for a display set, after its
   * presentation was set elsewhere, so that `getProperties` reports it.
   */
  replaceProperties(
    dataId: string,
    properties: PlanarLegacyViewportProperties
  ): void {
    this.properties.set(dataId, clonePlanarLegacyProperties(properties));
  }

  resetProperties(volumeId?: string): void {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    this.properties.set(targetDataId, {});
    this.host.setDataPresentationState(targetDataId, {});
  }

  getBlendMode(filterActorUIDs: string[] = []): BlendModes | undefined {
    const targetDataId = this.getBlendModeTargetDataIds(filterActorUIDs)[0];

    if (!targetDataId) {
      return;
    }

    const storedBlendMode =
      this.host.getDisplaySetPresentation(targetDataId)?.blendMode;

    if (storedBlendMode !== undefined) {
      return storedBlendMode;
    }

    if (this.isSampledVolumeRendering(targetDataId)) {
      return mapSlabTypeToBlendMode();
    }

    const actor = this.host.getBindingActor(targetDataId) as
      | {
          getMapper?: () => {
            getBlendMode?: () => BlendModes;
            getSlabType?: () => number;
          };
        }
      | undefined;

    const mapper = actor?.getMapper?.();
    const blendMode = mapper?.getBlendMode?.();

    if (blendMode !== undefined) {
      return blendMode;
    }

    return mapSlabTypeToBlendMode(mapper?.getSlabType?.());
  }

  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs: string[] = [],
    immediate = false
  ): void {
    const targetDataIds = this.getBlendModeTargetDataIds(filterActorUIDs);

    if (!targetDataIds.length) {
      return;
    }

    targetDataIds.forEach((dataId) => {
      const nextProperties = mergePlanarLegacyProperties(
        this.properties.get(dataId) || {},
        { blendMode }
      );

      this.properties.set(dataId, nextProperties);
      this.host.setDisplaySetPresentation(dataId, { blendMode });
    });

    if (immediate) {
      this.host.render();
    }
  }

  /**
   * The largest slab thickness of the volumes of the viewport, as the legacy
   * volume viewport reports it, and at least the minimum slab thickness.
   */
  getSlabThickness(): number {
    let slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;

    for (const dataId of new Set(this.volumeDataIds.values())) {
      const presentationSlabThickness =
        this.host.getDisplaySetPresentation(dataId)?.slabThickness;

      if (
        typeof presentationSlabThickness === 'number' &&
        presentationSlabThickness > slabThickness
      ) {
        slabThickness = presentationSlabThickness;
      }
    }

    return slabThickness;
  }

  /**
   * Sets the slab thickness of the volumes whose actor UID is in the filter,
   * or of every volume when the filter is empty. As on the legacy volume
   * viewport, a thickness below 0.1 becomes the minimum slab thickness.
   */
  setSlabThickness(
    slabThickness: number,
    filterActorUIDs: string[] = []
  ): void {
    const nextSlabThickness =
      slabThickness < 0.1
        ? RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
        : slabThickness;

    this.setVolumeSlabThickness(
      this.getBlendModeTargetDataIds(filterActorUIDs),
      nextSlabThickness
    );
  }

  /**
   * Removes the slab thickness of every volume, so that each one shows a
   * plain slice again.
   */
  resetSlabThickness(): void {
    this.setVolumeSlabThickness(
      Array.from(new Set(this.volumeDataIds.values())),
      undefined
    );
  }

  getNumberOfSlices(): number {
    return Math.max(
      this.host.getImageCount(),
      this.host.getMaxImageIdIndex() + 1
    );
  }

  removeData(dataId: string): void {
    // A mount that is in progress keeps its registration. The viewport removes
    // every binding that it holds before the viewport mounts the new bindings,
    // and the mount then reads the registration of each data id back. A volume
    // that the caller mounts again therefore keeps the metadata that
    // mountVolumes wrote for it.
    if (this.mountingDataIds.has(dataId)) {
      return;
    }

    if (!this.managedDataIds.delete(dataId)) {
      return;
    }

    this.unregisterDataId(dataId);
  }

  destroy(): void {
    let cleanupError: unknown;

    this.host
      .getElement()
      .removeEventListener(Events.STACK_NEW_IMAGE, this.onStackNewImage);

    for (const dataId of Array.from(this.managedDataIds)) {
      try {
        this.unregisterDataId(dataId);
      } catch (error) {
        cleanupError ??= error;
      }
    }

    this.managedDataIds.clear();
    this.volumeDataIds.clear();
    this.properties.clear();
    this.globalDefaultProperties.clear();
    this.perImageIdDefaultProperties.clear();

    if (cleanupError !== undefined) {
      throw cleanupError;
    }
  }

  private getLegacyStackDataId(): string {
    return `__planar_v2__:${this.host.getViewportId()}:stack`;
  }

  private getLegacyVolumeDataId(volumeId: string): string {
    return `__planar_v2__:${this.host.getViewportId()}:volume:${volumeId}`;
  }

  private registerDataSet(
    dataId: string,
    dataSet: PlanarRegisteredDataSet
  ): void {
    genericViewportDisplaySetMetadataProvider.add(dataId, dataSet);
    this.managedDataIds.add(dataId);
  }

  private async mountVolumes(
    volumeInputArray: IVolumeInput[],
    replaceExisting: boolean,
    suppressEvents: boolean
  ): Promise<void> {
    if (!volumeInputArray.length) {
      return;
    }

    const dataIds: string[] = [];
    const addsToSource =
      !replaceExisting && this.host.getActiveDataId() !== undefined;
    const boundDataIds = new Set<string>();

    try {
      for (const volumeInput of volumeInputArray) {
        const cachedVolume = cache.getVolume(volumeInput.volumeId);

        if (!cachedVolume) {
          throw new Error(
            `imageVolume with id: ${volumeInput.volumeId} does not exist, you need to create/allocate the volume first`
          );
        }

        const dataId = this.getLegacyVolumeDataId(volumeInput.volumeId);

        if (
          addsToSource &&
          this.host.getBindingRenderMode(dataId) !== undefined
        ) {
          boundDataIds.add(dataId);
        }

        this.registerDataSet(dataId, {
          imageIds: cachedVolume.imageIds,
          initialImageIdIndex: this.getInitialVolumeImageIdIndex(
            cachedVolume.imageIds.length
          ),
          reference: {
            kind: 'volume',
            volumeId: volumeInput.volumeId,
          },
          volumeId: volumeInput.volumeId,
        });
        this.volumeDataIds.set(volumeInput.volumeId, dataId);
        dataIds.push(dataId);
      }

      if (replaceExisting) {
        this.host.removeBindingsExcept(new Set(dataIds));
      }

      if (addsToSource) {
        await this.addVolumesToSource(
          dataIds.filter((dataId) => !boundDataIds.has(dataId))
        );
      } else {
        await this.setVolumeDisplaySets(dataIds, replaceExisting);
      }

      volumeInputArray.forEach((volumeInput, index) => {
        const dataId = dataIds[index];

        this.applyVolumeInputProperties(dataId, volumeInput);

        const actor = this.host.getBindingActor(dataId);

        if (actor && volumeInput.callback) {
          const opacityBeforeCallback = readScalarOpacityStamp(actor);

          volumeInput.callback({
            volumeActor: actor as never,
            volumeId: volumeInput.volumeId,
          });

          const volumePresentation = this.buildVolumePresentationFromActor(
            dataId,
            hasScalarOpacityChanged(actor, opacityBeforeCallback),
            this.getLegacySliceOpacityExponent(volumeInput)
          );

          if (volumePresentation) {
            this.applyVolumePresentation(dataId, volumePresentation);
          }
        }
      });

      this.host.triggerCameraReset();

      if (!suppressEvents) {
        triggerEvent(
          this.host.getElement(),
          Events.VOLUME_VIEWPORT_NEW_VOLUME,
          {
            viewportId: this.host.getViewportId(),
            volumeActors: this.buildVolumeActorEntries(
              volumeInputArray,
              dataIds
            ),
          }
        );
      }
    } catch (error) {
      dataIds
        .filter((dataId) => !boundDataIds.has(dataId))
        .forEach((dataId) => {
          this.removeData(dataId);
        });

      throw error;
    }
  }

  /**
   * Mounts the volumes of `setVolumes`, or of `addVolumes` on a viewport that
   * shows nothing yet. The first volume is the source when the call replaces
   * what the viewport shows or when it shows nothing, and every other volume
   * is an overlay.
   */
  private async setVolumeDisplaySets(
    dataIds: string[],
    replaceExisting: boolean
  ): Promise<void> {
    this.host.prepareVolumeCompatibilityCamera();

    const sharedOptions: PlanarSetDataOptions = {
      orientation: this.host.getRequestedOrientation(),
    };
    const existingSourceDataId = this.host.getActiveDataId();

    // setDisplaySets removes every binding that the viewport holds before it
    // mounts the new bindings. A volume that this call mounts again is still
    // bound at that moment, so the teardown must not remove the registration
    // that the loop above wrote for that volume. removeData reads this set.
    dataIds.forEach((dataId) => this.mountingDataIds.add(dataId));

    try {
      await this.host.setDisplaySets(
        ...dataIds.map((dataId, index) => {
          const shouldMountAsSource =
            index === 0 && (replaceExisting || !existingSourceDataId);

          return {
            displaySetId: dataId,
            options: {
              ...sharedOptions,
              role: shouldMountAsSource
                ? ('source' as const)
                : ('overlay' as const),
            },
          };
        })
      );
    } finally {
      // The catch of this method removes the data of a failed mount, so the
      // set must be clear before that cleanup runs.
      dataIds.forEach((dataId) => this.mountingDataIds.delete(dataId));
    }
  }

  /**
   * Mounts the volumes of `addVolumes` as overlays next to what the viewport
   * shows, as the legacy volume viewport adds actors to the ones it has. The
   * source, the other overlays and the view stay as they are, and the new
   * volumes take the orientation of the view.
   */
  private async addVolumesToSource(dataIds: string[]): Promise<void> {
    const options: PlanarSetDataOptions = {
      orientation:
        this.host.getCameraOrientation() ?? this.host.getRequestedOrientation(),
      role: 'overlay',
    };

    for (const dataId of dataIds) {
      await this.host.addDisplaySet(dataId, options);
    }
  }

  /**
   * Keeps the visibility, blend mode and slab thickness of a volume input in
   * the legacy properties of its data id and in its presentation. The
   * presentation that a later property change or a callback builds comes from
   * the legacy properties, so a value kept only in the presentation would be
   * lost there.
   */
  private applyVolumeInputProperties(
    dataId: string,
    volumeInput: IVolumeInput
  ): void {
    const patch: PlanarLegacyViewportProperties = {};

    if (volumeInput.visibility !== undefined) {
      patch.visible = volumeInput.visibility;
    }

    if (volumeInput.blendMode !== undefined) {
      patch.blendMode = volumeInput.blendMode;
    }

    if (volumeInput.slabThickness !== undefined) {
      patch.slabThickness = volumeInput.slabThickness;
    }

    if (!Object.keys(patch).length) {
      return;
    }

    this.properties.set(
      dataId,
      mergePlanarLegacyProperties(this.properties.get(dataId) || {}, patch)
    );
    this.host.setDisplaySetPresentation(dataId, patch);
  }

  private setVolumeSlabThickness(
    dataIds: string[],
    slabThickness: number | undefined
  ): void {
    dataIds.forEach((dataId) => {
      this.properties.set(
        dataId,
        mergePlanarLegacyProperties(this.properties.get(dataId) || {}, {
          slabThickness,
        })
      );
      this.host.setDisplaySetPresentation(dataId, { slabThickness });
    });
  }

  /**
   * The exponent f with which a legacy volume viewport draws an opacity a of
   * a composite volume on a plain slice: it draws 1 - (1 - a)^f.
   *
   * The legacy mapper corrects the opacity table per sample step and the
   * fragment shader raises a ray shorter than one step to the power of its
   * length in steps, so f is the length of the ray between the two slab
   * clipping planes divided by the scalar opacity unit distance (1, the vtk.js
   * default) and does not depend on the sample distance. The planes lie at
   * the slab half thickness on each side of the focal point, at the camera
   * distance (inset multiplier times the bounds radius of the volumes, as in
   * `Viewport.resetCamera`). The shader measures both from the near plane of
   * the camera clipping range (`MAXIMUM_RAY_DISTANCE`) in 32-bit floats, so
   * the length is the difference of the two rounded distances.
   *
   * Undefined when the volume is not composite, has a slab of its own or has
   * no bounds, which keeps the opacity function as the callback wrote it.
   */
  private getLegacySliceOpacityExponent(
    volumeInput: IVolumeInput
  ): number | undefined {
    if (
      volumeInput.blendMode !== undefined &&
      volumeInput.blendMode !== BlendModes.COMPOSITE
    ) {
      return;
    }

    const halfThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;

    if (
      volumeInput.slabThickness !== undefined &&
      volumeInput.slabThickness > halfThickness
    ) {
      return;
    }

    const bounds = this.getVolumeBounds();

    if (!bounds) {
      return;
    }

    const insetImageMultiplier = getConfiguration().rendering
      ?.useLegacyCameraFOV
      ? 1.1
      : 1;
    const nearDistance =
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE +
      insetImageMultiplier * boundsRadius(bounds);

    return (
      Math.fround(nearDistance + halfThickness) -
      Math.fround(nearDistance - halfThickness)
    );
  }

  /**
   * The bounds that enclose every volume of the viewport, or undefined when
   * no volume has bounds.
   */
  getVolumeBounds(): number[] | undefined {
    return getPlanarVolumesBounds(this.volumeDataIds.keys());
  }

  private getInitialVolumeImageIdIndex(imageCount: number): number {
    const rendering = this.host.getCurrentPlanarRendering();

    if (rendering && isVolumeRenderMode(rendering.renderMode)) {
      return Math.min(
        Math.max(0, rendering.currentImageIdIndex),
        Math.max(imageCount - 1, 0)
      );
    }

    // Match legacy VolumeViewport startup behavior: resetCamera positions
    // the focal point at the center of the volume snapped to the nearest
    // integer voxel center along the slice axis. For even slice counts this
    // leans up (Math.floor(d / 2)), matching getVolumeCenterIJK.
    return Math.floor(imageCount / 2);
  }

  private getBlendModeTargetDataIds(filterActorUIDs: string[]): string[] {
    const volumeDataIds = Array.from(new Set(this.volumeDataIds.values()));

    if (!filterActorUIDs.length) {
      return volumeDataIds;
    }

    return volumeDataIds.filter((dataId) => {
      const actor = this.host.getBindingActor(dataId) as
        | {
            get?: (propertyName?: string) => unknown;
            getUID?: () => string;
            uid?: string;
          }
        | undefined;
      const actorUid =
        actor?.getUID?.() ||
        actor?.uid ||
        ((actor?.get?.('uid') as { uid?: string } | undefined)?.uid ??
          undefined);

      return actorUid ? filterActorUIDs.includes(actorUid) : false;
    });
  }

  /**
   * The display set that a legacy call means: the one of the volume id when
   * it is mounted, else the active display set, else the first one bound.
   */
  resolveTargetDataId(volumeId?: string): string | undefined {
    if (volumeId) {
      const dataId =
        this.volumeDataIds.get(volumeId) ||
        this.host.findDataIdByVolumeId(volumeId);

      if (dataId) {
        return dataId;
      }
    }

    return this.host.getActiveDataId() || this.host.getFirstBoundDataId();
  }

  /**
   * Fires VOI_MODIFIED when `setProperties` changes the VOI range, or the
   * invert flag of a volume, as the legacy viewports do. The legacy stack
   * viewport fires nothing for the invert flag alone.
   */
  private emitVOIModified(
    dataId: string,
    properties: PlanarLegacyViewportProperties
  ): void {
    const { voiRange, invert } = toPlanarDataPresentation(properties);
    const presentation: Partial<PlanarDataPresentation> = {};

    if (voiRange) {
      presentation.voiRange = voiRange;
    }

    if (
      invert !== undefined &&
      isVolumeRenderMode(this.host.getBindingRenderMode(dataId))
    ) {
      presentation.invert = invert;
    }

    if (Object.keys(presentation).length) {
      this.host.notifyDataPresentationModified(dataId, presentation);
    }
  }

  private emitColormapModified(
    dataId: string,
    requestedVolumeId?: string
  ): void {
    const volumeId = requestedVolumeId || this.resolveVolumeIdForDataId(dataId);
    const colormap =
      (volumeId ? this.buildVolumeColormap(dataId) : undefined) ||
      this.properties.get(dataId)?.colormap;

    if (!colormap) {
      return;
    }

    triggerEvent(this.host.getElement(), Events.COLORMAP_MODIFIED, {
      viewportId: this.host.getViewportId(),
      volumeId,
      colormap,
    });
  }

  private applyVolumePresentation(
    dataId: string,
    volumePresentation: PlanarLegacyViewportProperties
  ): void {
    const nextProperties = mergePlanarLegacyProperties(
      this.properties.get(dataId) || {},
      volumePresentation
    );

    this.properties.set(dataId, nextProperties);

    const currentDefaults = this.globalDefaultProperties.get(dataId) || {};
    this.globalDefaultProperties.set(
      dataId,
      mergePlanarLegacyProperties(nextProperties, currentDefaults)
    );

    this.host.setDataPresentationState(
      dataId,
      toPlanarDataPresentation(nextProperties)
    );
  }

  private buildVolumeActorEntries(
    volumeInputArray: IVolumeInput[],
    dataIds: string[]
  ): ActorEntry[] {
    return volumeInputArray.flatMap((volumeInput, index) => {
      const actor = this.host.getBindingActor(dataIds[index]) as
        | ActorEntry['actor']
        | undefined;

      if (!actor) {
        return [];
      }

      const { actorUID, slabThickness, volumeId, ...rest } = volumeInput;

      return [
        {
          uid: actorUID || volumeId,
          actor,
          slabThickness,
          referencedId: volumeId,
          ...rest,
        },
      ];
    });
  }

  private buildVolumeColormap(dataId: string): ColormapPublic | undefined {
    const actor = this.host.getBindingActor(dataId) as
      | {
          getProperty?: () => {
            getRGBTransferFunction?: (index: number) => {
              getNodeValue?: (index: number, values: number[]) => void;
              getSize?: () => number;
            };
          };
        }
      | undefined;

    const transferFunction = actor?.getProperty?.().getRGBTransferFunction?.(0);

    if (!actor || !transferFunction) {
      return;
    }

    const rgbPoints = getTransferFunctionNodes(transferFunction).reduce(
      (points, node) => {
        points.push(node[0], node[1], node[2], node[3]);
        return points;
      },
      [] as number[]
    );
    const matchedColormap =
      findMatchingColormap(rgbPoints, actor as never) || {};
    const threshold = getThresholdValue(actor as never);

    if (matchedColormap.opacity === undefined) {
      matchedColormap.opacity = getMaxOpacity(actor as never);
    }

    if (threshold !== null) {
      matchedColormap.threshold = threshold;
    }

    return Object.keys(matchedColormap).length ? matchedColormap : undefined;
  }

  /**
   * Reads back what a legacy volume callback wrote on the actor of a data id.
   * The range of the colour function becomes the VOI range. When the callback
   * wrote an opacity function, its points are absolute scalar values, so they
   * are kept as the `opacityMapping` of the colormap, which the presentation
   * draws at those values whatever the VOI range is, and the threshold and the
   * opacity array that the read gives are left out. With a legacy slice
   * opacity exponent, the points are first turned into the opacity that a
   * legacy volume viewport draws on its slice (see
   * `toLegacySliceOpacityMapping`), so that the image slice gives the same
   * picture.
   */
  private buildVolumePresentationFromActor(
    dataId: string,
    callbackWroteOpacity = false,
    legacySliceOpacityExponent?: number
  ): PlanarLegacyViewportProperties | undefined {
    const actor = this.host.getBindingActor(dataId) as
      | {
          getMapper?: () => {
            getBlendMode?: () => BlendModes;
            getSlabType?: () => number;
          };
          getProperty?: () => {
            getRGBTransferFunction?: (index: number) => {
              getRange?: () => [number, number];
            };
          };
        }
      | undefined;

    const transferFunction = actor?.getProperty?.().getRGBTransferFunction?.(0);
    const actorOpacityMapping = callbackWroteOpacity
      ? readScalarOpacityMapping(actor)
      : undefined;
    const opacityMapping =
      actorOpacityMapping && legacySliceOpacityExponent !== undefined
        ? toLegacySliceOpacityMapping(
            actorOpacityMapping,
            legacySliceOpacityExponent
          )
        : actorOpacityMapping;
    const volumeColormap = opacityMapping
      ? toOpacityMappingColormap(
          this.buildVolumeColormap(dataId),
          opacityMapping
        )
      : this.buildVolumeColormap(dataId);
    const mapper = actor?.getMapper?.();
    const blendMode = this.isSampledVolumeRendering(dataId)
      ? undefined
      : (mapper?.getBlendMode?.() ??
        mapSlabTypeToBlendMode(mapper?.getSlabType?.()));
    const range = transferFunction?.getRange?.();
    const volumePresentation: PlanarLegacyViewportProperties = {};

    if (volumeColormap) {
      volumePresentation.colormap = volumeColormap;
    }

    if (range && range[1] > range[0]) {
      volumePresentation.voiRange = {
        lower: range[0],
        upper: range[1],
      };
    }

    if (blendMode !== undefined) {
      volumePresentation.blendMode = blendMode;
    }

    return Object.keys(volumePresentation).length
      ? volumePresentation
      : undefined;
  }

  /**
   * Whether the data id is drawn by the sampled volume render mode of its
   * backend (slice first). That path keeps the slab and the blend mode in the
   * presentation of the display set and draws a slice that was already cut,
   * so its mapper holds no slab type or blend mode to read back.
   */
  private isSampledVolumeRendering(dataId: string): boolean {
    const renderMode = this.host.getBindingRenderMode(dataId);
    const backend = getRenderBackendForRenderMode(renderMode);

    return (
      backend !== undefined &&
      getSampledVolumeRenderModeForBackend(backend) === renderMode
    );
  }

  private resolveVolumeIdForDataId(dataId: string): string | undefined {
    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        return volumeId;
      }
    }
  }

  private getPerImageDefaultProperties(
    imageId: string
  ): PlanarLegacyViewportProperties | undefined {
    const properties = this.perImageIdDefaultProperties.get(imageId);

    if (properties) {
      this.perImageIdDefaultProperties.delete(imageId);
      this.perImageIdDefaultProperties.set(imageId, properties);
    }

    return properties;
  }

  private setPerImageDefaultProperties(
    imageId: string,
    properties: PlanarLegacyViewportProperties
  ): void {
    if (this.perImageIdDefaultProperties.has(imageId)) {
      this.perImageIdDefaultProperties.delete(imageId);
    }

    this.perImageIdDefaultProperties.set(imageId, properties);
    this.evictPerImageDefaultProperties();
  }

  private prunePerImageDefaultProperties(validImageIds: Set<string>): void {
    for (const imageId of this.perImageIdDefaultProperties.keys()) {
      if (!validImageIds.has(imageId)) {
        this.perImageIdDefaultProperties.delete(imageId);
      }
    }

    this.evictPerImageDefaultProperties();
  }

  private evictPerImageDefaultProperties(): void {
    while (
      this.perImageIdDefaultProperties.size >
      PLANAR_LEGACY_PER_IMAGE_DEFAULT_PROPERTIES_LIMIT
    ) {
      const oldestImageId = this.perImageIdDefaultProperties
        .keys()
        .next().value;

      if (oldestImageId === undefined) {
        return;
      }

      this.perImageIdDefaultProperties.delete(oldestImageId);
    }
  }

  private unregisterDataId(dataId: string): void {
    try {
      genericViewportDisplaySetMetadataProvider.remove(dataId);
    } finally {
      this.properties.delete(dataId);
      this.globalDefaultProperties.delete(dataId);
      this.removeVolumeDataId(dataId);
    }
  }

  private removeVolumeDataId(dataId: string): void {
    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        this.volumeDataIds.delete(volumeId);
      }
    }
  }
}

type ScalarOpacityFunction = {
  getDataPointer?: () => ArrayLike<number> | null | undefined;
  getMTime?: () => number;
  getSize?: () => number;
  getNodeValue?: (index: number, values: number[]) => number;
  getValue?: (value: number) => number;
  getClamping?: () => boolean;
};

type ScalarOpacityActor = {
  getProperty?: () => {
    getScalarOpacity?: (index: number) => ScalarOpacityFunction | undefined;
  };
};

type ScalarOpacityStamp = {
  opacityFunction?: ScalarOpacityFunction;
  mtime?: number;
};

function getScalarOpacityFunction(
  actor: unknown
): ScalarOpacityFunction | undefined {
  return (actor as ScalarOpacityActor | undefined)
    ?.getProperty?.()
    ?.getScalarOpacity?.(0);
}

/**
 * The opacity function of an actor and its modified time, read before a
 * legacy callback runs.
 */
function readScalarOpacityStamp(actor: unknown): ScalarOpacityStamp {
  const opacityFunction = getScalarOpacityFunction(actor);

  return { opacityFunction, mtime: opacityFunction?.getMTime?.() };
}

/**
 * Whether the opacity function of the actor is another one, or was modified,
 * since the stamp was read.
 */
function hasScalarOpacityChanged(
  actor: unknown,
  stamp: ScalarOpacityStamp
): boolean {
  const opacityFunction = getScalarOpacityFunction(actor);

  if (!opacityFunction) {
    return false;
  }

  return (
    opacityFunction !== stamp.opacityFunction ||
    opacityFunction.getMTime?.() !== stamp.mtime
  );
}

/**
 * The largest error, in opacity, of the piecewise linear functions that
 * `toLegacySliceOpacityMapping` and `readScalarOpacityMapping` make: a
 * quarter of one level of 255.
 */
const LEGACY_SLICE_OPACITY_TOLERANCE = 0.25 / 255;

/**
 * The deepest split of one interval between two points of an opacity
 * function. An interval is halved until straight lines follow the function,
 * and a step in the function is then located to 1 part in 2^20 of it.
 */
const OPACITY_FUNCTION_MAX_SPLIT_DEPTH = 20;

/** The midpoint and the sharpness of a point that vtk.js joins to the next with a straight line. */
const LINEAR_NODE_MIDPOINT = 0.5;
const LINEAR_NODE_SHARPNESS = 0;

/**
 * Whether every point of an opacity function is joined to the next with a
 * straight line. A point added with a midpoint or a sharpness of its own
 * (`addPointLong`) bends or steps the curve between two points.
 */
function hasOnlyLinearNodes(opacityFunction: ScalarOpacityFunction): boolean {
  const size = opacityFunction.getSize?.() ?? 0;
  const node = [0, 0, LINEAR_NODE_MIDPOINT, LINEAR_NODE_SHARPNESS];

  if (!opacityFunction.getNodeValue) {
    return true;
  }

  for (let index = 0; index < size; index++) {
    opacityFunction.getNodeValue(index, node);

    if (node[2] !== LINEAR_NODE_MIDPOINT || node[3] !== LINEAR_NODE_SHARPNESS) {
      return false;
    }
  }

  return true;
}

/**
 * Adds the points between two points of an opacity function that straight
 * lines need to follow it: the interval is halved until the function at the
 * quarter points lies within `LEGACY_SLICE_OPACITY_TOLERANCE` of the line.
 */
function addCurvePoints(
  mapping: OpacityMapping[],
  opacityAt: (value: number) => number,
  start: OpacityMapping,
  end: OpacityMapping,
  depth: number
): void {
  const middle = {
    value: (start.value + end.value) / 2,
    opacity: opacityAt((start.value + end.value) / 2),
  };
  const isOnLine = (fraction: number, opacity: number) =>
    Math.abs(
      opacity - (start.opacity + (end.opacity - start.opacity) * fraction)
    ) <= LEGACY_SLICE_OPACITY_TOLERANCE;

  if (
    depth >= OPACITY_FUNCTION_MAX_SPLIT_DEPTH ||
    !(middle.value > start.value) ||
    !(middle.value < end.value) ||
    (isOnLine(0.5, middle.opacity) &&
      isOnLine(0.25, opacityAt(start.value + (end.value - start.value) / 4)) &&
      isOnLine(
        0.75,
        opacityAt(start.value + ((end.value - start.value) * 3) / 4)
      ))
  ) {
    return;
  }

  addCurvePoints(mapping, opacityAt, start, middle, depth + 1);
  mapping.push(middle);
  addCurvePoints(mapping, opacityAt, middle, end, depth + 1);
}

/**
 * The opacity function of an actor as points with absolute scalar values
 * that are joined with straight lines, or undefined when it has none.
 *
 * A function whose points are all joined with straight lines gives its own
 * points. A function with a midpoint or a sharpness on a point is read
 * through its values, with as many points between two of its own as the
 * curve needs. A function that does not clamp is 0 outside its points, so it
 * gets a point of opacity 0 right before its first and right after its last
 * point.
 */
function readScalarOpacityMapping(
  actor: unknown
): OpacityMapping[] | undefined {
  const opacityFunction = getScalarOpacityFunction(actor);
  const dataPointer = opacityFunction?.getDataPointer?.();

  if (!dataPointer?.length) {
    return;
  }

  const nodes: OpacityMapping[] = [];

  for (let i = 0; i + 1 < dataPointer.length; i += 2) {
    nodes.push({ value: dataPointer[i], opacity: dataPointer[i + 1] });
  }

  const opacityAt = opacityFunction.getValue;
  let mapping = nodes;

  if (opacityAt && !hasOnlyLinearNodes(opacityFunction)) {
    mapping = [nodes[0]];

    for (let index = 1; index < nodes.length; index++) {
      addCurvePoints(mapping, opacityAt, nodes[index - 1], nodes[index], 0);
      mapping.push(nodes[index]);
    }
  }

  if (opacityFunction.getClamping?.() !== false) {
    return mapping;
  }

  const first = mapping[0].value;
  const last = mapping[mapping.length - 1].value;
  const margin =
    Math.max(Math.abs(first), Math.abs(last), last - first, 1) *
    LEGACY_SLICE_OPACITY_MIN_INTERVAL;

  return [
    { value: first - margin, opacity: 0 },
    ...mapping,
    { value: last + margin, opacity: 0 },
  ];
}

/**
 * The narrowest interval, as a fraction of the value range of the mapping,
 * that `toLegacySliceOpacityMapping` splits. The opacity table of the image
 * mapper has at most 16384 entries over that range, so a finer point cannot
 * be drawn.
 */
const LEGACY_SLICE_OPACITY_MIN_INTERVAL = 1 / 65536;

/**
 * Turns opacity points into the points of the opacity that a legacy volume
 * viewport draws on a slice, 1 - (1 - a)^exponent between the points as well
 * as at them. That curve is not linear in a, so each interval is split in
 * halves until the straight line is within `LEGACY_SLICE_OPACITY_TOLERANCE`
 * of the curve at its middle, or the interval is narrower than the table of
 * the image mapper can show (near an opacity of 1 the curve is vertical).
 */
function toLegacySliceOpacityMapping(
  mapping: OpacityMapping[],
  exponent: number
): OpacityMapping[] {
  const sorted = [...mapping].sort((a, b) => a.value - b.value);
  const drawnOpacity = (opacity: number) =>
    1 - (1 - Math.max(0, Math.min(1, opacity))) ** exponent;
  const minInterval =
    (sorted[sorted.length - 1].value - sorted[0].value) *
    LEGACY_SLICE_OPACITY_MIN_INTERVAL;
  const result: OpacityMapping[] = [
    { value: sorted[0].value, opacity: drawnOpacity(sorted[0].opacity) },
  ];
  const split = (start: OpacityMapping, end: OpacityMapping, depth: number) => {
    const middle = {
      value: (start.value + end.value) / 2,
      opacity: (start.opacity + end.opacity) / 2,
    };
    const middleOpacity = drawnOpacity(middle.opacity);
    const lineOpacity =
      (drawnOpacity(start.opacity) + drawnOpacity(end.opacity)) / 2;

    if (
      depth >= 32 ||
      end.value - start.value <= minInterval ||
      Math.abs(middleOpacity - lineOpacity) <= LEGACY_SLICE_OPACITY_TOLERANCE
    ) {
      return;
    }

    split(start, middle, depth + 1);
    result.push({ value: middle.value, opacity: middleOpacity });
    split(middle, end, depth + 1);
  };

  for (let i = 1; i < sorted.length; i++) {
    split(sorted[i - 1], sorted[i], 0);
    result.push({
      value: sorted[i].value,
      opacity: drawnOpacity(sorted[i].opacity),
    });
  }

  return result;
}

/**
 * The colormap that keeps an opacity function read from an actor: the name
 * of the matched colormap, an overall opacity of 1 and the points as its
 * `opacityMapping`.
 */
function toOpacityMappingColormap(
  colormap: ColormapPublic | undefined,
  opacityMapping: OpacityMapping[]
): ColormapPublic {
  const opacityMappingColormap: ColormapPublic = {
    opacity: 1,
    opacityMapping,
  };

  if (colormap?.name !== undefined) {
    opacityMappingColormap.name = colormap.name;
  }

  return opacityMappingColormap;
}

export default PlanarLegacyCompatibilityController;
