import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import { vec3 } from 'gl-matrix';
import cache from '../../../cache/cache';
import { MPR_CAMERA_VALUES, RENDERING_DEFAULTS } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import type BlendModes from '../../../enums/BlendModes';
import type {
  ActorEntry,
  ICamera,
  IImageVolume,
  IVolumeInput,
  OrientationVectors,
  Point3,
  ResetCameraOptions,
  ViewReference,
  VolumeViewportProperties,
} from '../../../types';
import type { PlaneRestriction } from '../../../types/IViewport';
import getAcquisitionPlaneOrientation from '../../../utilities/getAcquisitionPlaneOrientation';
import getVolumeViewportScrollInfo from '../../../utilities/getVolumeViewportScrollInfo';
import isEqual, { isEqualNegative } from '../../../utilities/isEqual';
import snapFocalPointToSlice from '../../../utilities/snapFocalPointToSlice';
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import { viewportProjection } from '../viewportProjection';
import VolumeViewport3D from './viewport3D';
import applyVolume3DCamera from './applyVolume3DCamera';
import { getOrientationVectors } from './vtkVolume3DInitialCamera';
import type {
  Volume3DCamera,
  Volume3DDataPresentation,
  Volume3DRegisteredDataSet,
  Volume3DVolumeRendering,
  VolumeViewport3DInput,
} from './viewport3DTypes';

/**
 * Options of a camera reset on the adapter: the legacy reset options, and
 * `suppressEvents`, which the orientation change of `setOrientation` passes.
 */
type Volume3DLegacyResetOptions = ResetCameraOptions & {
  suppressEvents?: boolean;
};

class VolumeViewport3DLegacyAdapter extends VolumeViewport3D {
  private readonly managedDataIds = new Set<string>();
  /**
   * The data sets that a mount is about to add again.
   *
   * `setDisplaySets` removes every bound data set before it adds the new ones,
   * and this adapter forgets the registration of a data set that it removes. A
   * mount of the same volume therefore wiped the registration that it had just
   * written, and the data provider then found nothing. These ids keep their
   * registration for the length of the mount.
   */
  private readonly remountingDataIds = new Set<string>();
  private readonly volumeDataIds = new Map<string, string>();
  /** The volume input of each display set while `setVolumes` mounts it. */
  private readonly mountingVolumeInputs = new Map<string, IVolumeInput>();
  private readonly legacyProperties = new Map<
    string,
    VolumeViewportProperties
  >();
  private readonly defaultLegacyProperties = new Map<
    string,
    VolumeViewportProperties
  >();
  /** The properties of `setDefaultProperties` without a volume id. */
  private globalDefaultProperties: VolumeViewportProperties = {};
  /** The properties of `setDefaultProperties` for one volume. */
  private readonly perVolumeIdDefaultProperties = new Map<
    string,
    VolumeViewportProperties
  >();

  /**
   * False until the rendering engine disables the viewport, as on the legacy
   * viewports. The engine sets it to true.
   */
  isDisabled = false;

  /**
   * Makes the viewport and turns the camera to the orientation of the
   * options, as the legacy 3D viewport does when it is made. A viewport that
   * shows actors before any volume then looks along that orientation.
   */
  constructor(args: VolumeViewport3DInput) {
    super(args);

    const { orientation } = this.defaultOptions;

    if (orientation && orientation !== OrientationAxis.ACQUISITION) {
      const camera = this.getViewState();

      applyVolume3DCamera(
        this.renderContext,
        getOrientationVectors({
          fallbackViewPlaneNormal: camera.viewPlaneNormal,
          fallbackViewUp: camera.viewUp,
          orientation,
        })
      );
    }
  }

  getCamera(): Volume3DCamera & ICamera {
    return this.getViewState();
  }

  setCamera(cameraPatch: Partial<Volume3DCamera>): void {
    this.setViewState(cameraPatch);
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should read
   * presentation through `viewportProjection.getPresentation`.
   */
  getViewPresentation(): { camera: Volume3DCamera & ICamera } | undefined {
    return viewportProjection.getPresentation<{
      camera: Volume3DCamera & ICamera;
    }>(this);
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should use
   * viewport projection to derive view state, then call `setViewState`.
   */
  setViewPresentation(
    viewPresentation?:
      | { camera?: Partial<Volume3DCamera> }
      | Partial<Volume3DCamera>
  ): void {
    if (!viewPresentation) {
      return;
    }

    const presentation: { camera?: Partial<Volume3DCamera> } =
      isVolume3DViewPresentation(viewPresentation)
        ? viewPresentation
        : { camera: viewPresentation as Partial<Volume3DCamera> };
    const nextCamera = viewportProjection.withPresentation<
      Volume3DCamera,
      { camera?: Partial<Volume3DCamera> }
    >(this, presentation);

    if (nextCamera) {
      this.setViewState(nextCamera);
    }
  }

  /**
   * Fits the camera to what the viewport shows, as the legacy 3D viewport
   * does. The options are those of the legacy `resetCamera`.
   */
  resetCamera(options?: ResetCameraOptions): boolean {
    return this.resetViewState(options);
  }

  /**
   * Compatibility wrapper for rendering engines and legacy callers that still
   * use the resize-specific camera reset hook.
   */
  resetCameraForResize(): boolean {
    return this.resetViewStateForResize();
  }

  /**
   * Fits the camera as the next 3D viewport does in `resetViewState`, which
   * is the fit of the legacy 3D viewport. With `suppressEvents`, which the
   * orientation change of `setOrientation` passes, no event fires.
   */
  resetViewState(options: Volume3DLegacyResetOptions = {}): boolean {
    let reset = true;

    this.withEventsSuppressed(Boolean(options.suppressEvents), () => {
      reset = super.resetViewState(options);
    });

    return reset;
  }

  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, true, suppressEvents);

    if (immediate) {
      this.render();
    }
  }

  /**
   * Adds volumes to the ones that the viewport shows, as the legacy viewport
   * adds their actors to its actors. The volumes that it shows and the view
   * stay. A volume that the viewport already shows is not added again. On a
   * viewport that shows nothing the camera then fits the volumes, as after
   * `setVolumes`.
   */
  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    await this.mountVolumes(volumeInputArray, false, suppressEvents);

    if (immediate) {
      this.render();
    }
  }

  setProperties(
    properties: VolumeViewportProperties = {},
    volumeId?: string,
    suppressEvents = false
  ): void {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const nextProperties: VolumeViewportProperties = {
      ...(this.legacyProperties.get(targetDataId) || {}),
      ...properties,
    };

    if (!this.defaultLegacyProperties.has(targetDataId)) {
      this.defaultLegacyProperties.set(targetDataId, { ...properties });
    }

    this.legacyProperties.set(targetDataId, nextProperties);

    const presentationPatch = getPresentationPatch(properties);

    if (Object.keys(presentationPatch).length) {
      this.withEventsSuppressed(suppressEvents, () =>
        this.setDisplaySetPresentation(targetDataId, presentationPatch)
      );
    }

    this.render();
  }

  getProperties(volumeId?: string): VolumeViewportProperties {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return {};
    }

    return { ...(this.legacyProperties.get(targetDataId) || {}) };
  }

  /**
   * Sets the properties back as the legacy 3D viewport does: the default VOI
   * range of the volume, then the first properties that were set when they
   * hold a preset or a colormap, and fires VOI_MODIFIED. The camera stays.
   */
  resetProperties(volumeId?: string): void {
    const targetDataId = this.resolveTargetDataId(volumeId);

    if (!targetDataId) {
      return;
    }

    const defaults = this.defaultLegacyProperties.get(targetDataId) || {};

    this.legacyProperties.set(targetDataId, { ...defaults });
    this.withEventsSuppressed(true, () => {
      this.resetDisplaySetPresentation(targetDataId);

      if (defaults.preset !== undefined || defaults.colormap) {
        this.setDisplaySetPresentation(
          targetDataId,
          getPresentationPatch(defaults)
        );
      }
    });
    this.triggerVOIModified(targetDataId);
    this.render();
  }

  setSampleDistanceMultiplier(multiplier: number): void {
    this.setProperties({ sampleDistanceMultiplier: multiplier });
  }

  /**
   * Keeps default properties, for the viewport or for one volume, as the
   * legacy viewport does. `resetToDefaultProperties` applies the ones of the
   * viewport.
   */
  setDefaultProperties(
    properties: VolumeViewportProperties,
    volumeId?: string
  ): void {
    if (volumeId == null) {
      this.globalDefaultProperties = properties;
    } else {
      this.perVolumeIdDefaultProperties.set(volumeId, properties);
    }
  }

  /**
   * The default properties of a volume when it has its own, else a copy of
   * the default properties of the viewport, as on the legacy viewport.
   */
  getDefaultProperties(volumeId?: string): VolumeViewportProperties {
    const volumeProperties =
      volumeId !== undefined
        ? this.perVolumeIdDefaultProperties.get(volumeId)
        : undefined;

    return volumeProperties ?? { ...this.globalDefaultProperties };
  }

  /**
   * Removes default properties. Without a volume id it removes those of the
   * viewport and resets the properties, with one it removes those of the
   * volume and applies the defaults of the viewport, as on the legacy
   * viewport.
   */
  clearDefaultProperties(volumeId?: string): void {
    if (volumeId == null) {
      this.globalDefaultProperties = {};
      this.resetProperties();
    } else {
      this.perVolumeIdDefaultProperties.delete(volumeId);
      this.resetToDefaultProperties(volumeId);
    }
  }

  /**
   * Applies the default properties of the viewport to a volume through
   * `setProperties`. The legacy viewport applies the colormap, the VOI LUT
   * function and the slab thickness too; `setProperties` of this adapter
   * applies the VOI range, invert, the sample distance and the preset.
   */
  resetToDefaultProperties(volumeId: string): void {
    this.setProperties(this.globalDefaultProperties, volumeId);
  }

  removeData(dataId: string): void {
    super.removeData(dataId);
    this.forgetData(dataId);
  }

  /**
   * Removes volumes, as the legacy viewport does. An entry is the actor UID
   * of a volume or its volume id. Renders when `immediate` is set.
   */
  removeVolumeActors(actorUIDs: string[], immediate = false): void {
    this.removeActors(
      actorUIDs.map(
        (actorUID) => this.findActorUIDByVolumeId(actorUID) ?? actorUID
      )
    );

    if (immediate) {
      this.render();
    }
  }

  /** The ids of the volumes that the viewport shows. */
  getAllVolumeIds(): string[] {
    return this.getVolumeRenderings().map(
      (rendering) => rendering.imageVolume.volumeId
    );
  }

  /**
   * The bounds of what the viewport shows in world coordinates, as the legacy
   * viewport gives them: the bounds of every visible prop of the renderer.
   */
  getBounds(): number[] {
    return this.getRenderer().computeVisiblePropBounds();
  }

  /**
   * Turns the camera to an orientation and fits it: a named axis, the
   * acquisition plane of the volume or orientation vectors. A legacy volume
   * viewport does this. The legacy 3D viewport only logs a warning.
   */
  setOrientation(
    orientation: OrientationAxis | OrientationVectors,
    immediate = true,
    suppressEvents = false
  ): void {
    const camera = this.getCamera();
    const vectors = getOrientationVectors({
      fallbackViewPlaneNormal: camera.viewPlaneNormal,
      fallbackViewUp: camera.viewUp,
      imageVolume: this.getShownVolume(),
      orientation,
    });

    applyVolume3DCamera(this.renderContext, vectors);
    this.resetViewState({ suppressEvents });

    if (immediate) {
      this.render();
    }
  }

  /**
   * Moves the view to a view reference, as the legacy volume viewport does.
   * A slice index of the volume moves the focal point to that slice, another
   * view plane normal turns the camera with `setOrientation`, and a focal
   * point moves the camera along the view plane normal. A plane restriction
   * without a normal goes to `setViewPlane`. A reference without a frame of
   * reference is taken as one in the frame of reference of the viewport.
   * Throws for another frame of reference.
   */
  setViewReference(viewRef: ViewReference): void {
    if (!viewRef) {
      return;
    }

    const {
      FrameOfReferenceUID = this.getFrameOfReferenceUID(),
      cameraFocalPoint,
      planeRestriction,
      viewPlaneNormal: refViewPlaneNormal,
      viewUp,
    } = viewRef;
    let { sliceIndex } = viewRef;

    if (planeRestriction && !refViewPlaneNormal) {
      this.setViewPlane(planeRestriction);

      return;
    }

    const volumeId = this.getVolumeId();
    const { focalPoint, viewPlaneNormal, position } = this.getCamera();
    const isNegativeNormal = isEqualNegative(
      viewPlaneNormal,
      refViewPlaneNormal
    );
    const isSameNormal = isEqual(viewPlaneNormal, refViewPlaneNormal);

    if (
      typeof sliceIndex === 'number' &&
      volumeId !== undefined &&
      viewRef.volumeId === volumeId &&
      (isNegativeNormal || isSameNormal)
    ) {
      const { currentStepIndex, sliceRangeInfo, numScrollSteps } =
        getVolumeViewportScrollInfo(this as never, volumeId, true);

      if (!sliceRangeInfo) {
        return;
      }

      if (isNegativeNormal) {
        sliceIndex = numScrollSteps - sliceIndex - 1;
      }

      const { newFocalPoint, newPosition } = snapFocalPointToSlice(
        focalPoint,
        position,
        sliceRangeInfo.sliceRange,
        viewPlaneNormal,
        sliceRangeInfo.spacingInNormalDirection,
        sliceIndex - currentStepIndex
      );

      this.setCamera({ focalPoint: newFocalPoint, position: newPosition });

      return;
    }

    if (FrameOfReferenceUID !== this.getFrameOfReferenceUID()) {
      throw new Error(
        `Incompatible view refs: ${FrameOfReferenceUID}!==${this.getFrameOfReferenceUID()}`
      );
    }

    if (refViewPlaneNormal && !isNegativeNormal && !isSameNormal) {
      this.setOrientation(
        { viewPlaneNormal: refViewPlaneNormal, viewUp },
        true,
        true
      );

      if (isEqual(this.getCamera().viewPlaneNormal, refViewPlaneNormal)) {
        this.setViewReference(viewRef);
      }

      return;
    }

    if (cameraFocalPoint) {
      const focalDelta = vec3.subtract(
        vec3.create(),
        cameraFocalPoint,
        focalPoint
      );
      const useNormal = refViewPlaneNormal ?? viewPlaneNormal;
      const normalDot = vec3.dot(focalDelta, useNormal);

      if (!isEqual(normalDot, 0)) {
        vec3.scale(focalDelta, useNormal, normalDot);
      }

      this.setCamera({
        focalPoint: vec3.add(vec3.create(), focalPoint, focalDelta) as Point3,
        position: vec3.add(vec3.create(), position, focalDelta) as Point3,
      });
    }
  }

  /**
   * Moves the view to the plane of a plane restriction, as the legacy volume
   * viewport does: the camera turns to an orientation that holds the in-plane
   * vectors, and the focal point moves along the normal to the point.
   */
  setViewPlane(planeRestriction: PlaneRestriction): void {
    const { point, inPlaneVector1, inPlaneVector2, FrameOfReferenceUID } =
      planeRestriction;

    this.setBestOrentation(inPlaneVector1, inPlaneVector2);

    const { focalPoint, viewPlaneNormal } = this.getCamera();
    const alongNormal = vec3.dot(
      vec3.subtract(vec3.create(), point, focalPoint),
      viewPlaneNormal
    );

    this.setViewReference({
      FrameOfReferenceUID,
      cameraFocalPoint: vec3.scaleAndAdd(
        vec3.create(),
        focalPoint,
        viewPlaneNormal,
        alongNormal
      ) as Point3,
      viewPlaneNormal,
    });
  }

  /**
   * Turns the camera to an orientation that holds both in-plane vectors, as
   * the legacy volume viewport does: the view stays when it holds them, else
   * the acquisition plane, a named axis or the plane of the two vectors.
   */
  setBestOrentation(inPlaneVector1: Point3, inPlaneVector2: Point3): void {
    if (!inPlaneVector1 && !inPlaneVector2) {
      return;
    }

    const holdsVectors = (normal: Point3) =>
      isCompatible(normal, inPlaneVector1) &&
      isCompatible(normal, inPlaneVector2);

    if (holdsVectors(this.getCamera().viewPlaneNormal)) {
      return;
    }

    const volume = this.getShownVolume();
    const acquisition = volume
      ? getAcquisitionPlaneOrientation(volume)
      : undefined;

    if (acquisition && holdsVectors(acquisition.viewPlaneNormal)) {
      this.setOrientation(acquisition);

      return;
    }

    const orientation = (
      Object.values(MPR_CAMERA_VALUES) as OrientationVectors[]
    ).find(({ viewPlaneNormal }) => holdsVectors(viewPlaneNormal));

    if (orientation) {
      this.setOrientation(orientation);

      return;
    }

    const planeNormal = vec3.cross(
      vec3.create(),
      inPlaneVector2 || acquisition?.viewPlaneNormal,
      inPlaneVector1
    );

    vec3.normalize(planeNormal, planeNormal);
    this.setOrientation({ viewPlaneNormal: planeNormal as Point3 });
  }

  /** Always false: a 3D viewport draws with vtk.js on the GPU. */
  get useCPURendering(): boolean {
    return false;
  }

  /** Always 0, as on the legacy 3D viewport. */
  getRotation(): number {
    return 0;
  }

  /** Always 1, as on the legacy 3D viewport. */
  getNumberOfSlices(): number {
    return 1;
  }

  /** Always 0, as on the legacy 3D viewport. */
  getCurrentImageIdIndex(): number {
    return 0;
  }

  /** Always null, as on the legacy 3D viewport, which shows no one image. */
  getCurrentImageId(): string | undefined {
    return null;
  }

  /** Always null, as on the legacy 3D viewport. */
  getSliceIndex(): number {
    return null;
  }

  /** Always false, as on the legacy 3D viewport. */
  isInAcquisitionPlane(): boolean {
    return false;
  }

  /**
   * Moves the focal point by slices of the volume along the view plane
   * normal and renders, as the legacy volume viewports scroll. A 3D view
   * looks the same after it.
   */
  scroll(delta = 1): void {
    const { sliceRangeInfo } = getVolumeViewportScrollInfo(
      this as never,
      this.getVolumeId(),
      true
    );

    if (!sliceRangeInfo) {
      return;
    }

    const { sliceRange, spacingInNormalDirection, camera } = sliceRangeInfo;
    const { newFocalPoint, newPosition } = snapFocalPointToSlice(
      camera.focalPoint,
      camera.position,
      sliceRange,
      camera.viewPlaneNormal,
      spacingInNormalDirection,
      delta
    );

    this.setCamera({ focalPoint: newFocalPoint, position: newPosition });
    this.render();
  }

  /**
   * The largest slab thickness of the actors, at least the minimum slab
   * thickness, as on the legacy viewport.
   */
  getSlabThickness(): number {
    return this.getActors().reduce(
      (slabThickness, actorEntry) =>
        actorEntry.slabThickness > slabThickness
          ? actorEntry.slabThickness
          : slabThickness,
      RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
    );
  }

  /** Does nothing, as on the legacy 3D viewport. */
  setSlabThickness(_slabThickness: number, _filterActorUIDs?: string[]): void {
    return;
  }

  /** Does nothing, as on the legacy 3D viewport. */
  resetSlabThickness(): void {
    return;
  }

  /** Does nothing, as on the legacy 3D viewport. */
  setBlendMode(
    _blendMode: BlendModes,
    _filterActorUIDs?: string[],
    _immediate?: boolean
  ): void {
    return;
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
    const showsVolumes = this.bindings.size > 0;
    const addsToShown = !replaceExisting && showsVolumes;
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

        if (addsToShown && this.bindings.has(dataId)) {
          boundDataIds.add(dataId);
        }

        const dataSet: Volume3DRegisteredDataSet = {
          imageIds: cachedVolume.imageIds,
          volumeId: volumeInput.volumeId,
        };

        genericViewportDisplaySetMetadataProvider.add(dataId, dataSet);
        this.managedDataIds.add(dataId);
        this.remountingDataIds.add(dataId);
        this.volumeDataIds.set(volumeInput.volumeId, dataId);
        this.mountingVolumeInputs.set(dataId, volumeInput);
        dataIds.push(dataId);
      }

      if (replaceExisting) {
        this.removeBindingsExcept(new Set(dataIds));
      }

      await this.withEventsSuppressedAsync(suppressEvents, async () => {
        if (addsToShown) {
          for (const dataId of dataIds) {
            if (!boundDataIds.has(dataId)) {
              await this.addDisplaySet(dataId, {
                renderMode: 'vtkVolume3d',
                role: 'overlay',
              });
            }
          }
        } else {
          await this.setDisplaySets(
            ...dataIds.map((dataId) => ({
              displaySetId: dataId,
              options: { renderMode: 'vtkVolume3d' as const },
            }))
          );
        }
      });

      // The mount is done. A callback or a listener of the event below that
      // removes one of these data sets must really remove it.
      dataIds.forEach((dataId) => this.remountingDataIds.delete(dataId));

      volumeInputArray.forEach((volumeInput, index) => {
        const dataId = dataIds[index];
        const rendering = this.getBinding(dataId)?.rendering as
          | Volume3DVolumeRendering
          | undefined;

        if (volumeInput.actorUID && rendering?.renderMode === 'vtkVolume3d') {
          rendering.actorEntryUID = volumeInput.actorUID;
        }

        if (volumeInput.visibility !== undefined) {
          this.setDisplaySetPresentation(dataId, {
            visible: volumeInput.visibility,
          });
        }

        if (volumeInput.callback) {
          const actor = this.getBindingActor(dataId) as vtkVolume | undefined;

          if (actor) {
            volumeInput.callback({
              volumeActor: actor as never,
              volumeId: volumeInput.volumeId,
            });
          }
        }
      });

      if (!addsToShown) {
        // As a legacy volume viewport does when it sets its actors. The reset
        // runs after the mount, because before it there is no actor to fit.
        this.resetCamera();
      }
    } catch (error) {
      // The mount failed, so these data sets really do go away.
      dataIds
        .filter((dataId) => !boundDataIds.has(dataId))
        .forEach((dataId) => {
          this.remountingDataIds.delete(dataId);
          this.forgetData(dataId);
        });

      throw error;
    } finally {
      dataIds.forEach((dataId) => {
        this.remountingDataIds.delete(dataId);
        this.mountingVolumeInputs.delete(dataId);
      });
    }
  }

  /**
   * The actor entries of mounted volumes for the VOLUME_VIEWPORT_NEW_VOLUME
   * event of the class, with the fields of their volume inputs and the UID
   * that `getActors` gives them, as the legacy viewport: the `actorUID` of
   * the volume input, else the UID of the rendering.
   */
  protected override getNewVolumeActorEntries(
    displaySetIds: string[]
  ): ActorEntry[] {
    return super
      .getNewVolumeActorEntries(displaySetIds)
      .map((actorEntry, index) => {
        const volumeInput = this.mountingVolumeInputs.get(displaySetIds[index]);

        if (!volumeInput) {
          return actorEntry;
        }

        const {
          actorUID,
          slabThickness,
          volumeId: _volumeId,
          ...rest
        } = volumeInput;

        return {
          ...actorEntry,
          uid: actorUID ?? actorEntry.uid,
          slabThickness,
          ...rest,
        };
      });
  }

  /** As `withEventsSuppressed`, for a change that waits. */
  private async withEventsSuppressedAsync(
    suppress: boolean,
    change: () => Promise<void>
  ): Promise<void> {
    const suppressEvents = this.suppressEvents;

    this.suppressEvents = suppressEvents || suppress;

    try {
      await change();
    } finally {
      this.suppressEvents = suppressEvents;
    }
  }

  /**
   * Runs a change with the events of the viewport suppressed when `suppress`
   * is set, as the `suppressEvents` argument of the legacy calls asks.
   */
  private withEventsSuppressed(suppress: boolean, change: () => void): void {
    const suppressEvents = this.suppressEvents;

    this.suppressEvents = suppressEvents || suppress;

    try {
      change();
    } finally {
      this.suppressEvents = suppressEvents;
    }
  }

  private getBindingActor(dataId: string): unknown {
    const binding = this.getBinding(dataId);

    if (!binding) {
      return;
    }

    const rendering = binding.rendering as Partial<Volume3DVolumeRendering>;

    return rendering?.actor;
  }

  /** The volume of the first volume actor, when the viewport shows one. */
  private getShownVolume(): IImageVolume | undefined {
    const volumeId = this.getVolumeId();

    return volumeId ? cache.getVolume(volumeId) : undefined;
  }

  /** The renderings of the volumes that the viewport shows. */
  private getVolumeRenderings(): Volume3DVolumeRendering[] {
    return Array.from(this.bindings.values())
      .map((binding) => binding.rendering as Volume3DVolumeRendering)
      .filter((rendering) => rendering?.renderMode === 'vtkVolume3d');
  }

  /** The actor UID of the volume with this id, when the viewport shows it. */
  private findActorUIDByVolumeId(volumeId: string): string | undefined {
    return this.getVolumeRenderings().find(
      (rendering) => rendering.imageVolume?.volumeId === volumeId
    )?.actorEntryUID;
  }

  private resolveTargetDataId(volumeId?: string): string | undefined {
    if (volumeId) {
      const mapped = this.volumeDataIds.get(volumeId);

      if (mapped) {
        return mapped;
      }

      for (const [dataId, binding] of this.bindings.entries()) {
        const rendering = binding.rendering as Partial<Volume3DVolumeRendering>;

        if (rendering?.imageVolume?.volumeId === volumeId) {
          return dataId;
        }
      }
    }

    return this.bindings.keys().next().value;
  }

  private removeBindingsExcept(keepDataIds: Set<string>): void {
    for (const dataId of Array.from(this.bindings.keys())) {
      if (!keepDataIds.has(dataId)) {
        this.removeData(dataId);
      }
    }
  }

  private getLegacyVolumeDataId(volumeId: string): string {
    return `__volume3d__:${this.id}:volume:${volumeId}`;
  }

  private forgetData(dataId: string): void {
    if (this.remountingDataIds.has(dataId)) {
      // A mount is adding this data set again, so its registration stays.
      return;
    }

    if (!this.managedDataIds.delete(dataId)) {
      return;
    }

    genericViewportDisplaySetMetadataProvider.remove(dataId);
    this.legacyProperties.delete(dataId);
    this.defaultLegacyProperties.delete(dataId);

    for (const [volumeId, mappedDataId] of this.volumeDataIds.entries()) {
      if (mappedDataId === dataId) {
        this.volumeDataIds.delete(volumeId);
      }
    }
  }

  protected override onDestroy(): void {
    for (const dataId of Array.from(this.managedDataIds)) {
      genericViewportDisplaySetMetadataProvider.remove(dataId);
    }

    this.managedDataIds.clear();
    this.volumeDataIds.clear();
    this.legacyProperties.clear();
    this.defaultLegacyProperties.clear();

    super.onDestroy();
  }
}

export default VolumeViewport3DLegacyAdapter;

/**
 * The keys of legacy properties that the presentation of the next 3D
 * viewport has, with the same names and meanings.
 */
function getPresentationPatch(
  properties: VolumeViewportProperties
): Partial<Volume3DDataPresentation> {
  const keys = [
    'voiRange',
    'invert',
    'interpolationType',
    'sampleDistanceMultiplier',
    'preset',
    'colormap',
    'VOILUTFunction',
    'sharpening',
    'smoothing',
  ] as const;
  const patch: Partial<Volume3DDataPresentation> = {};

  keys.forEach((key) => {
    if (properties[key] !== undefined) {
      Object.assign(patch, { [key]: properties[key] });
    }
  });

  return patch;
}

function isVolume3DViewPresentation(
  viewPresentation: unknown
): viewPresentation is { camera?: Partial<Volume3DCamera> } {
  return (
    Boolean(viewPresentation) &&
    typeof viewPresentation === 'object' &&
    'camera' in viewPresentation
  );
}

/** Whether a vector lies in the plane of this normal, or there is none. */
function isCompatible(viewPlaneNormal: Point3, vector: Point3): boolean {
  return !vector || isEqual(vec3.dot(viewPlaneNormal, vector), 0);
}
