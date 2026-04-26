import cache from '../../../cache/cache';
import RENDERING_DEFAULTS from '../../../constants/rendering';
import { ActorRenderMode } from '../../../types';
import type { ICamera, IVolumeInput, Point2, Point3 } from '../../../types';
import type BlendModes from '../../../enums/BlendModes';
import clonePoint3 from '../../../utilities/clonePoint3';
import hasOwn from '../../../utilities/hasOwn';
import type { PlanarLegacyViewportProperties } from './planarLegacyCompatibility';
import PlanarLegacyCompatibilityController from './PlanarLegacyCompatibilityController';
import PlanarViewport from './PlanarViewport';
import type { PlanarScaleInput } from './planarCameraScale';
import type {
  PlanarResolvedICamera,
  PlanarViewState,
} from './PlanarViewportTypes';

class PlanarViewportLegacyAdapter extends PlanarViewport {
  private readonly legacyCompatibility =
    new PlanarLegacyCompatibilityController(
      this.createLegacyCompatibilityHost()
    );

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

  getAllVolumeIds(): string[] {
    return Array.from(this.volumeIds);
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

    return (
      rendering?.renderMode === ActorRenderMode.CPU_VOLUME ||
      rendering?.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
    );
  }

  private warnUnsupportedPositionOnlyCameraPatch(): void {
    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'production'
    ) {
      return;
    }

    console.warn(
      '[PlanarViewportLegacyAdapter] Position-only planar camera patches are unsupported. Use focalPoint, parallelScale, or view state APIs.'
    );
  }

  removeData(dataId: string): void {
    super.removeData(dataId);
    this.legacyCompatibility.removeData(dataId);
  }

  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    return this.legacyCompatibility.setStack(imageIds, currentImageIdIndex);
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
  }

  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    return this.legacyCompatibility.getProperties(volumeId);
  }

  resetProperties(volumeId?: string): void {
    this.legacyCompatibility.resetProperties(volumeId);
  }

  setDefaultProperties(
    properties: PlanarLegacyViewportProperties = {},
    imageId?: string
  ): void {
    this.legacyCompatibility.setDefaultProperties(properties, imageId);
  }

  clearDefaultProperties(imageId?: string): void {
    this.legacyCompatibility.clearDefaultProperties(imageId);
  }

  resetToDefaultProperties(): void {
    this.legacyCompatibility.resetToDefaultProperties();
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
    let slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;

    for (const actor of this.getActors()) {
      if (actor.slabThickness > slabThickness) {
        slabThickness = actor.slabThickness;
      }
    }

    return slabThickness;
  }

  getNumberOfSlices(): number {
    return this.legacyCompatibility.getNumberOfSlices();
  }

  protected override onDestroy(): void {
    this.legacyCompatibility.destroy();
    super.onDestroy();
  }
}

export default PlanarViewportLegacyAdapter;
