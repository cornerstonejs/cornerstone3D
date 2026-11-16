import cache from '../../../cache/cache';
import {
  getRenderSurfaceForRenderMode,
  isVolumeRenderMode,
} from '../../helpers/renderBackendRegistry';
import type {
  ActorEntry,
  ICamera,
  IImage,
  IVolumeInput,
  Point2,
  Point3,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type BlendModes from '../../../enums/BlendModes';
import InterpolationType from '../../../enums/InterpolationType';
import MetadataModules from '../../../enums/MetadataModules';
import { getShouldUseCPURendering } from '../../../init';
import * as metaData from '../../../metaData';
import { getValidVOILUTFunction } from '../../../utilities/buildMetadata';
import clonePoint3 from '../../../utilities/clonePoint3';
import hasOwn from '../../../utilities/hasOwn';
import imageIdToURI from '../../../utilities/imageIdToURI';
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import { viewportProjection } from '../viewportProjection';
import {
  type PlanarLegacyViewportProperties,
  toPlanarDataPresentation,
  toPlanarLegacyProperties,
} from './planarLegacyCompatibility';
import PlanarLegacyCompatibilityController from './PlanarLegacyCompatibilityController';
import PlanarViewport, { type PlanarScrollOptions } from './PlanarViewport';
import type { PlanarScaleInput } from './planarCameraScale';
import { cloneDisplayArea } from './planarViewState';
import { coreLog } from '../../../utilities/logger';
import type {
  PlanarResolvedICamera,
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  PlanarViewState,
} from './PlanarViewportTypes';

const log = coreLog.getLogger('RenderingEngine', 'PlanarViewportLegacyAdapter');

class PlanarViewportLegacyAdapter extends PlanarViewport {
  private readonly legacyCompatibility =
    new PlanarLegacyCompatibilityController(
      this.createLegacyCompatibilityHost()
    );

  /** The animation frame of the CPU draw that `render` asked for. */
  private cpuRenderFrame: number | undefined;

  /** The legacy viewports keep their 4.x display, so no acquired frames. */
  protected override prefersAcquiredFrames(): boolean {
    return false;
  }

  /**
   * With the legacy CPU switch on (`rendering.useCPURendering`) the adapter
   * draws a LINEAR image once for each change, as the legacy CPU stack
   * viewport does. Without the switch the CPU draws because the GPU cannot,
   * so the image is drawn once more at rest and shows what the GPU draws.
   */
  protected override prefersFinerImageAtRest(): boolean {
    return !getShouldUseCPURendering();
  }

  private cloneTuple<T extends ArrayLike<number> | undefined>(
    tuple: T
  ): T extends undefined ? undefined : [number, number, number] {
    if (!tuple) {
      return undefined as T extends undefined
        ? undefined
        : [number, number, number];
    }

    return Array.from(tuple) as T extends undefined
      ? undefined
      : [number, number, number];
  }

  getCamera(): PlanarViewState & ICamera<PlanarScaleInput> {
    const viewState = this.getViewState();
    const camera = {
      ...viewState,
      ...this.getCameraForEvent(),
    } as PlanarViewState & ICamera<PlanarScaleInput>;
    const orientation =
      viewState.orientation && typeof viewState.orientation === 'object'
        ? {
            ...viewState.orientation,
            viewUp: this.cloneTuple(viewState.orientation.viewUp),
            viewPlaneNormal: this.cloneTuple(
              viewState.orientation.viewPlaneNormal
            ),
          }
        : viewState.orientation;

    return {
      ...camera,
      focalPoint: this.cloneTuple(camera.focalPoint),
      position: this.cloneTuple(camera.position),
      viewUp: this.cloneTuple(camera.viewUp),
      viewPlaneNormal: this.cloneTuple(camera.viewPlaneNormal),
      orientation,
    };
  }

  setCamera(
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    const viewStatePatch: Partial<PlanarViewState> = {};

    this.applyLegacyPlanarPresentationPatch(viewStatePatch, cameraPatch);
    this.applyLegacyParallelScalePatch(viewStatePatch, cameraPatch);
    this.applyLegacyOrientationPatch(viewStatePatch, cameraPatch);
    this.applyLegacyFocalPointPatch(viewStatePatch, cameraPatch);

    if (
      cameraPatch.position &&
      !cameraPatch.focalPoint &&
      !Object.keys(viewStatePatch).length
    ) {
      this.warnUnsupportedPositionOnlyCameraPatch();
      return;
    }

    if (!Object.keys(viewStatePatch).length) {
      return;
    }

    this.setViewState(viewStatePatch);
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should read
   * presentation through `viewportProjection.getPresentation`.
   */
  getViewPresentation(
    selector?: PlanarViewPresentationSelector
  ): PlanarViewPresentation | undefined {
    return viewportProjection.getPresentation<PlanarViewPresentation>(this, {
      selector,
    });
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should use
   * viewport projection to derive view state, then call `setViewState`.
   */
  setViewPresentation(viewPres?: PlanarViewPresentation): void {
    if (!viewPres) {
      return;
    }

    if (hasOwn(viewPres, 'displayArea')) {
      this.options = {
        ...this.options,
        displayArea: cloneDisplayArea(viewPres.displayArea),
      };
    }

    const nextViewState = viewportProjection.withPresentation<
      PlanarViewState,
      PlanarViewPresentation
    >(this, viewPres);

    if (nextViewState) {
      this.setViewState(nextViewState);
    }
  }

  /**
   * Compatibility wrapper for legacy callers. Direct Next viewports should use
   * `resetViewState`.
   */
  resetCamera(
    options?: Parameters<PlanarViewport['resetViewState']>[0]
  ): boolean {
    return this.resetViewState(options);
  }

  /**
   * Compatibility wrapper for rendering engines and legacy callers that still
   * use the resize-specific camera reset hook.
   */
  resetCameraForResize(): boolean {
    return this.resetViewStateForResize();
  }

  get volumeIds(): Set<string> {
    const ids = new Set<string>();

    for (const actorEntry of this.getActors()) {
      const candidates = [actorEntry.referencedId, actorEntry.uid];

      for (const candidate of candidates) {
        if (typeof candidate === 'string' && cache.getVolume(candidate)) {
          ids.add(candidate);
        }
      }
    }

    return ids;
  }

  get csImage(): IImage | undefined {
    return this.getCornerstoneImage();
  }

  /**
   * The modality of the image that the viewport shows, from the general
   * series module of that image, as the legacy stack viewport keeps it. In
   * volume mode off the acquisition plane it is the modality of the first
   * image of the volume. Null when the viewport shows no image.
   */
  get modality(): string {
    const imageId = this.getLegacyImageId();

    return (
      (imageId
        ? metaData.get(MetadataModules.GENERAL_SERIES, imageId)?.modality
        : undefined) ?? null
    );
  }

  /**
   * Whether the viewport draws its current data on the CPU canvas. The legacy
   * viewports fix this when they are made; the next viewport chooses the
   * render path per display set, so the adapter reads the path that draws.
   */
  get useCPURendering(): boolean {
    return (
      getRenderSurfaceForRenderMode(
        this.getCurrentPlanarRendering()?.renderMode
      ) === 'cpu'
    );
  }

  /**
   * The image id that the viewport shows, or the one of a view reference
   * specifier. A number is a slice index, as the legacy viewports take it: in
   * stack mode it gives the image id at that index, as the legacy stack
   * viewport does, and in volume mode it is ignored, as the legacy volume
   * viewport ignores it.
   */
  getCurrentImageId(
    viewRefSpecifierOrIndex: ViewReferenceSpecifier | number = {}
  ): string | undefined {
    if (typeof viewRefSpecifierOrIndex !== 'number') {
      return super.getCurrentImageId(viewRefSpecifierOrIndex);
    }

    if (this.getCurrentMode() === 'stack') {
      return this.getImageIds()[viewRefSpecifierOrIndex];
    }

    return super.getCurrentImageId();
  }

  /**
   * The index in the image ids of an image id, an image URI or the referenced
   * image of a view reference, as the legacy stack viewport finds it.
   * Undefined when the viewport does not have that image.
   */
  getSliceIndexForImage(reference: string | ViewReference): number {
    const imageKey =
      typeof reference === 'string' ? reference : reference?.referencedImageId;

    if (!imageKey) {
      return;
    }

    const imageIds = this.getImageIds();

    for (let index = imageIds.length - 1; index >= 0; index--) {
      if (
        imageIds[index] === imageKey ||
        imageIdToURI(imageIds[index]) === imageKey
      ) {
        return index;
      }
    }
  }

  /**
   * False. The orientation marker tool, the one caller, puts its own vtk.js
   * actors into the renderer and turns the vtk.js camera, which the adapter
   * does not give (`getRenderer`). A volume-mode adapter changes orientation
   * through `setOrientation` and `setViewState`.
   */
  isOrientationChangeable(): boolean {
    return false;
  }

  /**
   * Scrolls by a number of slices.
   *
   * In stack mode it scrolls as the legacy stack viewport: from the target
   * index, clamped to the stack or wrapped when `loop` is set, and the
   * planar viewport fires STACK_VIEWPORT_SCROLL when the index changes. The
   * next viewport has no debounce, so the second argument has no effect.
   *
   * In volume mode the planar viewport scrolls with the options, as the
   * legacy volume viewport. Without options, as a direct call of the legacy
   * `scroll` method, it steps by the slab thickness when a slab is set.
   */
  scroll(
    delta: number,
    _debounce = true,
    loop = false,
    options?: PlanarScrollOptions
  ): Promise<string> {
    const mode = this.getCurrentMode();

    if (mode === 'volume') {
      return super.scroll(delta, _debounce, loop, {
        scrollSlabs: true,
        ...options,
      });
    }

    const imageIds = this.getImageIds();

    if (mode !== 'stack' || !imageIds.length) {
      return super.scroll(delta);
    }

    const currentIndex = this.getTargetImageIdIndex();
    const nextIndex = loop
      ? (currentIndex + delta + imageIds.length) % imageIds.length
      : currentIndex + delta;

    return this.scrollToImageIdIndex(nextIndex, delta);
  }

  /**
   * The current image index, or in volume mode the step index of a scroll,
   * which counts steps of the slab thickness by default when a slab is set,
   * as the legacy volume viewport counts them.
   */
  override getCurrentImageIdIndex(
    volumeId?: string,
    useSlabThickness = true
  ): number {
    return super.getCurrentImageIdIndex(volumeId, useSlabThickness);
  }

  private getLegacyImageId(): string | undefined {
    return this.getCurrentImageId() ?? this.getImageIds()[0];
  }

  private applyLegacyPlanarPresentationPatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (hasOwn(cameraPatch, 'orientation')) {
      viewStatePatch.orientation = cameraPatch.orientation;
    }
    if (hasOwn(cameraPatch, 'anchorWorld')) {
      viewStatePatch.anchorWorld = clonePoint3(cameraPatch.anchorWorld);
    }
    if (hasOwn(cameraPatch, 'anchorCanvas')) {
      viewStatePatch.anchorCanvas = cameraPatch.anchorCanvas
        ? ([...cameraPatch.anchorCanvas] as Point2)
        : undefined;
    }
    if (hasOwn(cameraPatch, 'scale')) {
      viewStatePatch.scale = cameraPatch.scale;
    }
    if (hasOwn(cameraPatch, 'scaleMode')) {
      viewStatePatch.scaleMode = cameraPatch.scaleMode;
    }
    if (hasOwn(cameraPatch, 'rotation')) {
      viewStatePatch.rotation = cameraPatch.rotation;
    }
    if (hasOwn(cameraPatch, 'flipHorizontal')) {
      viewStatePatch.flipHorizontal = cameraPatch.flipHorizontal;
    }
    if (hasOwn(cameraPatch, 'flipVertical')) {
      viewStatePatch.flipVertical = cameraPatch.flipVertical;
    }
    if (hasOwn(cameraPatch, 'displayArea')) {
      viewStatePatch.displayArea = cameraPatch.displayArea;
    }
    if (hasOwn(cameraPatch, 'slice')) {
      viewStatePatch.slice = cameraPatch.slice;
    }
  }

  private applyLegacyParallelScalePatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (typeof cameraPatch.parallelScale !== 'number') {
      return;
    }

    const resolvedICamera = this.getResolvedView()?.toICamera() as
      | PlanarResolvedICamera
      | undefined;

    if (!resolvedICamera || typeof resolvedICamera.parallelScale !== 'number') {
      return;
    }

    const currentScale = this.getScale();
    const currentScaleY = Math.max(
      resolvedICamera.presentationScale?.[1] ?? currentScale[1] ?? 1,
      1e-6
    );
    const currentScaleX = Math.max(
      resolvedICamera.presentationScale?.[0] ??
        currentScale[0] ??
        currentScaleY,
      1e-6
    );
    const fitParallelScale = resolvedICamera.parallelScale * currentScaleY;
    const nextScaleY =
      fitParallelScale / Math.max(cameraPatch.parallelScale, 1e-6);
    const aspectScale = currentScaleX / currentScaleY;

    viewStatePatch.displayArea = undefined;
    viewStatePatch.scale = [nextScaleY * aspectScale, nextScaleY];
    viewStatePatch.scaleMode = 'fit';
  }

  private applyLegacyOrientationPatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (!cameraPatch.viewPlaneNormal) {
      return;
    }

    const currentICamera = this.getResolvedView()?.toICamera();

    viewStatePatch.orientation = {
      viewPlaneNormal: [...cameraPatch.viewPlaneNormal] as Point3,
      viewUp: cameraPatch.viewUp
        ? ([...cameraPatch.viewUp] as Point3)
        : currentICamera?.viewUp
          ? ([...currentICamera.viewUp] as Point3)
          : undefined,
    };
  }

  private applyLegacyFocalPointPatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (!cameraPatch.focalPoint) {
      return;
    }

    const focalPoint = [...cameraPatch.focalPoint] as Point3;

    viewStatePatch.anchorCanvas = [0.5, 0.5];
    viewStatePatch.anchorWorld = focalPoint;
    viewStatePatch.displayArea = undefined;

    if (this.isVolumeSliceRenderingActive()) {
      viewStatePatch.slice = {
        kind: 'volumePoint',
        sliceWorldPoint: focalPoint,
      };
    }
  }

  private isVolumeSliceRenderingActive(): boolean {
    const rendering = this.getCurrentPlanarRendering();

    return isVolumeRenderMode(rendering?.renderMode);
  }

  private warnUnsupportedPositionOnlyCameraPatch(): void {
    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'production'
    ) {
      return;
    }

    log.warn(
      '[PlanarViewportLegacyAdapter] Position-only planar camera patches are unsupported. Use focalPoint, parallelScale, or view state APIs.'
    );
  }

  removeData(dataId: string): void {
    super.removeData(dataId);
    this.legacyCompatibility.removeData(dataId);
  }

  /**
   * Legacy actor lookup by internal actor UID.
   */
  getActor(actorEntryUID: string): ActorEntry | undefined {
    return this.getActors().find(
      (actorEntry) => actorEntry.uid === actorEntryUID
    );
  }

  /**
   * Legacy actor removal by internal actor UID.
   */
  removeActors(actorEntryUIDs: string[]): void {
    let didRemoveActor = false;

    actorEntryUIDs
      .filter(
        (actorEntryUID): actorEntryUID is string =>
          typeof actorEntryUID === 'string'
      )
      .forEach((actorEntryUID) => {
        const bindingDataId =
          this.findBindingDataIdByActorEntryUID(actorEntryUID);

        if (bindingDataId) {
          if (this.getDisplaySetRole(bindingDataId) === 'overlay') {
            genericViewportDisplaySetMetadataProvider.remove(bindingDataId);
          }
          this.removeData(bindingDataId);
          didRemoveActor = true;
        }
      });

    if (didRemoveActor) {
      this.render();
    }
  }

  /**
   * Removes volumes, as the legacy volume viewport does. An entry is the
   * actor UID of a volume or its volume id, which is the actor UID of a legacy
   * volume unless the caller gave another. Renders when `immediate` is set.
   */
  removeVolumeActors(actorUIDs: string[], immediate = false): void {
    actorUIDs.forEach((actorUID) => {
      const dataId =
        this.findBindingDataIdByActorEntryUID(actorUID) ??
        this.findDataIdByVolumeId(actorUID);

      if (!dataId) {
        return;
      }

      if (this.getDisplaySetRole(dataId) === 'overlay') {
        genericViewportDisplaySetMetadataProvider.remove(dataId);
      }

      this.removeData(dataId);
    });

    if (immediate) {
      this.render();
    }
  }

  /**
   * Shows a stack of images. As the legacy stack viewport, it fires
   * PRE_STACK_NEW_IMAGE before the first image loads, through the mount of
   * the planar viewport, and VIEWPORT_NEW_IMAGE_SET once the first image is
   * shown.
   */
  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    const imageId = await this.legacyCompatibility.setStack(
      imageIds,
      currentImageIdIndex
    );

    this.triggerNewImageSetEvent(imageIds, currentImageIdIndex);

    return imageId;
  }

  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibility.setVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibility.addVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  setProperties(
    properties: PlanarLegacyViewportProperties = {},
    volumeIdOrSuppressEvents?: string | boolean,
    suppressEvents = false
  ): void {
    this.legacyCompatibility.setProperties(
      properties,
      volumeIdOrSuppressEvents,
      suppressEvents
    );
    this.keepFirstPropertiesAsDefault(
      properties,
      typeof volumeIdOrSuppressEvents === 'string'
        ? volumeIdOrSuppressEvents
        : undefined
    );
  }

  /**
   * Keeps the properties as the default presentation of the display set
   * where it has none for a key, as the legacy viewports keep the first
   * properties that `setProperties` gets as their default properties.
   */
  private keepFirstPropertiesAsDefault(
    properties: PlanarLegacyViewportProperties,
    volumeId?: string
  ): void {
    const dataId = this.legacyCompatibility.resolveTargetDataId(volumeId);

    if (!dataId) {
      return;
    }

    this.setDefaultDisplaySetPresentation(dataId, {
      ...toPlanarDataPresentation(properties),
      ...this.getDefaultDisplaySetPresentation(dataId),
    });
  }

  /**
   * The properties of the data that the viewport shows. In stack mode the
   * interpolation type, the invert flag and the VOI LUT function are always
   * given, as the legacy stack viewport gives them also after
   * `resetProperties`: LINEAR, the default invert flag of the image (true for
   * a MONOCHROME1 image) and the VOI LUT function of the image when nothing
   * set them. Those are the values that the image paths draw with.
   */
  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    const properties = this.legacyCompatibility.getProperties(volumeId);

    if (this.getCurrentMode() !== 'stack') {
      return properties;
    }

    return {
      ...properties,
      interpolationType:
        properties.interpolationType ?? InterpolationType.LINEAR,
      invert: properties.invert ?? false,
      VOILUTFunction:
        properties.VOILUTFunction ??
        getValidVOILUTFunction(this.getCornerstoneImage()?.voiLUTFunction),
    };
  }

  resetProperties(volumeId?: string): void {
    this.legacyCompatibility.resetProperties(volumeId);
  }

  /**
   * Sets the default properties of the data that the viewport shows, or of
   * one image of it, through `setDefaultDisplaySetPresentation`.
   */
  setDefaultProperties(
    properties: PlanarLegacyViewportProperties = {},
    imageId?: string
  ): void {
    const dataId = this.legacyCompatibility.resolveTargetDataId();

    if (!dataId) {
      return;
    }

    this.setDefaultDisplaySetPresentation(
      dataId,
      toPlanarDataPresentation(properties),
      { imageId }
    );
  }

  /**
   * The default properties of one image when it has its own, else of the
   * data that the viewport shows, through `getDefaultDisplaySetPresentation`.
   */
  getDefaultProperties(imageId?: string): PlanarLegacyViewportProperties {
    const dataId = this.legacyCompatibility.resolveTargetDataId();

    if (!dataId) {
      return {};
    }

    return toPlanarLegacyProperties(
      (imageId !== undefined
        ? this.getDefaultDisplaySetPresentation(dataId, { imageId })
        : undefined) ?? this.getDefaultDisplaySetPresentation(dataId)
    );
  }

  /**
   * Removes the default properties through
   * `clearDefaultDisplaySetPresentation`, then resets the properties as the
   * legacy viewports do: to the data without an image id, else to the
   * defaults that are left.
   */
  clearDefaultProperties(imageId?: string): void {
    const dataId = this.legacyCompatibility.resolveTargetDataId();

    if (!dataId) {
      return;
    }

    this.clearDefaultDisplaySetPresentation(dataId, { imageId });

    if (imageId == null) {
      this.resetProperties();
    } else {
      this.resetToDefaultProperties();
    }
  }

  /** Goes back to the default properties through `resetDisplaySetPresentation`. */
  resetToDefaultProperties(): void {
    const dataId = this.legacyCompatibility.resolveTargetDataId();

    if (!dataId) {
      return;
    }

    this.resetDisplaySetPresentation(dataId);
    this.legacyCompatibility.replaceProperties(
      dataId,
      toPlanarLegacyProperties(this.getDisplaySetPresentation(dataId))
    );
  }

  getBlendMode(filterActorUIDs?: string[]): BlendModes | undefined {
    return this.legacyCompatibility.getBlendMode(filterActorUIDs);
  }

  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate = false
  ): void {
    this.legacyCompatibility.setBlendMode(
      blendMode,
      filterActorUIDs,
      immediate
    );
  }

  getSlabThickness(): number {
    return this.legacyCompatibility.getSlabThickness();
  }

  /**
   * Compatibility wrapper for the slab thickness setter of the legacy volume
   * viewport. The thickness is kept in the presentation of each volume.
   *
   * @experimental
   */
  setSlabThickness(slabThickness: number, filterActorUIDs?: string[]): void {
    this.legacyCompatibility.setSlabThickness(slabThickness, filterActorUIDs);
  }

  /**
   * Compatibility wrapper for the slab thickness reset of the legacy volume
   * viewport.
   *
   * @experimental
   */
  resetSlabThickness(): void {
    this.legacyCompatibility.resetSlabThickness();
  }

  /**
   * Renders as the legacy viewports do. A path that draws on the CPU canvas
   * draws once in the next animation frame, however often a render is asked
   * for before it, as the legacy CPU stack viewport draws in the frame of the
   * rendering engine. So one change gives one IMAGE_RENDERED, also when the
   * mount of a stack renders several times. A GPU path renders as on the
   * next viewport, through the rendering engine.
   */
  render(): void {
    if (!this.useCPURendering) {
      super.render();

      return;
    }

    if (this.cpuRenderFrame !== undefined) {
      return;
    }

    this.cpuRenderFrame = requestAnimationFrame(() => {
      this.cpuRenderFrame = undefined;
      super.render();
    });
  }

  protected override onDestroy(): void {
    if (this.cpuRenderFrame !== undefined) {
      cancelAnimationFrame(this.cpuRenderFrame);
      this.cpuRenderFrame = undefined;
    }

    this.legacyCompatibility.destroy();
    super.onDestroy();
  }
}

export default PlanarViewportLegacyAdapter;
