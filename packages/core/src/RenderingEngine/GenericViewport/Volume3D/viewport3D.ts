import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import { vec2, vec3 } from 'gl-matrix';
import { Events, ViewportType } from '../../../enums';
import type {
  ActorEntry,
  ICamera,
  IImageData,
  Point2,
  Point3,
  ResetCameraOptions,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import type { VoiModifiedEventDetail } from '../../../types/EventTypes';
import { actorIsA, isImageActor } from '../../../utilities/actorCheck';
import isEqual from '../../../utilities/isEqual';
import { coreLog } from '../../../utilities/logger';
import transformWorldToIndex from '../../../utilities/transformWorldToIndex';
import triggerEvent from '../../../utilities/triggerEvent';
import renderingEngineCache from '../../renderingEngineCache';
import { createSharpeningSmoothingRenderPasses } from '../../renderPasses';
import type {
  DataAddOptions,
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import GenericViewport, {
  type GenericViewportOptions,
} from '../GenericViewport';
import {
  getDimensionGroupReferenceContext,
  type GenericViewportReferenceContext,
} from '../genericViewportReferenceCompatibility';
import {
  getGenericViewportImageDisplaySet,
  isGenericViewportImageDisplaySet,
} from '../genericViewportDisplaySetAccess';
import { DefaultVolume3DDataProvider } from './DefaultVolume3DDataProvider';
import { createVolume3DRenderPathResolver } from './Volume3DRenderPathResolver';
import Volume3DResolvedView from './Volume3DResolvedView';
import applyVolume3DCamera from './applyVolume3DCamera';
import {
  getVolume3DColormap,
  resolveVolume3DPreset,
} from './applyVolume3DPresentation';
import {
  getVolume3DProjectionSnapshot,
  type Volume3DProjectionSnapshot,
} from './volume3DProjectionAdapter';
import {
  getOrientationVectors,
  getResetFocalPoint,
  getVolume3DFitCamera,
  setVolume3DPhysicalCamera,
} from './vtkVolume3DInitialCamera';
import type {
  Volume3DCamera,
  Volume3DPayload,
  Volume3DDataPresentation,
  Volume3DRegisteredDataSet,
  Volume3DRendering,
  Volume3DSetDataOptions,
  Volume3DViewportRenderContext,
  Volume3DVolumeRendering,
  VolumeViewport3DInput,
} from './viewport3DTypes';

const log = coreLog.getLogger('RenderingEngine', 'VolumeViewport3D');

class VolumeViewport3D extends GenericViewport<
  Volume3DCamera,
  Volume3DDataPresentation,
  Volume3DViewportRenderContext
> {
  readonly type = ViewportType.VOLUME_3D_NEXT;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  suppressEvents = false;

  protected renderContext: Volume3DViewportRenderContext;

  private primaryDataId?: string;
  /**
   * The camera of the fit of the first mount and of the last reset that
   * stored it. `getZoom` and `getPan` compare the camera with it, as on the
   * legacy viewport.
   */
  private initialCamera?: ICamera;
  /** True while `setDisplaySets` mounts, which fires one event for all. */
  private mountsDisplaySets = false;
  /** The vtk.js actors that the application added with `addActor`, by UID. */
  private readonly addedActors = new Map<string, ActorEntry>();
  /**
   * The presentation of each display set after its mount, which
   * `resetDisplaySetPresentation` goes back to.
   */
  private readonly mountedPresentations = new Map<
    string,
    Volume3DDataPresentation
  >();

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  setRendered(): void {
    super.setRendered();
  }

  constructor(args: VolumeViewport3DInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas;
    // The 3D viewport renders VTK directly to this on-screen canvas (it has no CPU
    // canvas like PlanarViewport). When the same element previously hosted a CPU
    // PlanarViewport, that viewport hid this shared canvas (display:none) in favor of
    // its cpuCanvas; ensure it is visible again so the volume rendering is shown.
    this.canvas.style.display = '';
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.suppressEvents = Boolean(this.defaultOptions.suppressEvents);
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultVolume3DDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createVolume3DRenderPathResolver();

    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);
    const renderer = renderingEngine?.getRenderer(this.id);

    if (!renderer) {
      throw new Error(
        '[VolumeViewport3D] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
      );
    }

    renderer
      .getActiveCamera()
      .setParallelProjection(this.defaultOptions.parallelProjection ?? true);

    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: '3d',
      viewport: {
        element: this.element,
        options: {
          orientation: this.defaultOptions.orientation,
          parallelProjection: this.defaultOptions.parallelProjection,
        },
      },
      display: {
        requestRender: () => {
          this.requestRenderingEngineRender();
        },
      },
      vtk: {
        canvas: this.canvas,
        renderer,
      },
    };
    this.viewState = {
      parallelProjection: this.defaultOptions.parallelProjection ?? true,
    } as Volume3DCamera;

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  /** The 3D family can show reduced volume data (GENVIEW-FIDELITY-8). */
  override canReportFidelity(): boolean {
    return true;
  }

  /** Always true: a 3D viewport turns to any orientation. */
  override isOrientationChangeable(): boolean {
    return true;
  }

  /**
   * Applies the options that the viewport reads when it is made and that
   * changed: `suppressEvents`, the `background` of the renderer, the
   * `parallelProjection` of the camera and the `orientation`. The orientation
   * is the one of the next mount, and with a volume shown the camera turns to
   * it and fits, as at a mount.
   */
  protected override applyOptions(
    options: GenericViewportOptions,
    previous: GenericViewportOptions
  ): void {
    super.applyOptions(options, previous);
    this.suppressEvents = Boolean(options.suppressEvents);

    if (
      JSON.stringify(options.background) !== JSON.stringify(previous.background)
    ) {
      this.getRenderer().setBackground(options.background ?? [0, 0, 0]);
    }

    const viewportOptions = this.renderContext.viewport.options;

    if (options.parallelProjection !== previous.parallelProjection) {
      viewportOptions.parallelProjection = options.parallelProjection;
      this.setViewState({
        parallelProjection: options.parallelProjection ?? true,
      });
    }

    if (
      JSON.stringify(options.orientation) ===
      JSON.stringify(previous.orientation)
    ) {
      return;
    }

    viewportOptions.orientation = options.orientation;

    const imageVolume = Array.from(this.bindings.values())
      .map((binding) => binding.rendering as Volume3DVolumeRendering)
      .find(
        (rendering) => rendering?.renderMode === 'vtkVolume3d'
      )?.imageVolume;

    if (!imageVolume) {
      return;
    }

    const camera = this.getViewState();

    applyVolume3DCamera(
      this.renderContext,
      getOrientationVectors({
        fallbackViewPlaneNormal: camera.viewPlaneNormal,
        fallbackViewUp: camera.viewUp,
        imageVolume,
        orientation: options.orientation,
      })
    );
    this.resetViewState();
  }

  /** A 3D view: a rotation can bring any axis into the view plane. */
  protected override isFidelityView3D(): boolean {
    return true;
  }

  /**
   * Content mode of the 3D family (GENVIEW-FAMILY-5): `volume3d` for a mounted
   * volume, `unknown` for a geometry-only source, `empty` with no source.
   */
  getCurrentMode(): ViewportContentMode {
    const binding = this.getSourceBinding();

    if (!binding) {
      return 'empty';
    }

    return binding.rendering.renderMode === 'vtkGeometry3d'
      ? 'unknown'
      : 'volume3d';
  }

  /**
   * Replaces all mounted 3D display sets with the provided ones. The first
   * entry is mounted as the source binding; subsequent entries default to the
   * overlay role unless they specify one explicitly.
   *
   * @param entries - Display sets to mount, each with its own render-mode options.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: Volume3DSetDataOptions;
    }>
  ): Promise<void> {
    this.removeAllData();
    this.mountsDisplaySets = true;

    try {
      for (const [index, { displaySetId, options = {} }] of entries.entries()) {
        await this.addDisplaySet(displaySetId, {
          ...options,
          role: options.role ?? (index === 0 ? 'source' : 'overlay'),
        });
      }
    } finally {
      this.mountsDisplaySets = false;
    }

    this.triggerNewVolume(entries.map(({ displaySetId }) => displaySetId));
  }

  /**
   * Adds a single 3D display set and selects the effective 3D render mode.
   * A volume added as the source fires VOLUME_VIEWPORT_NEW_VOLUME; an
   * overlay does not, as the legacy `addVolumes`.
   *
   * @param displaySetId - Logical display set id to add.
   * @param options - Requested 3D render-mode options.
   */
  async addDisplaySet(
    displaySetId: string,
    options: Volume3DSetDataOptions | DataAddOptions = {}
  ): Promise<void> {
    const volumeOptions = options as Volume3DSetDataOptions;
    const renderMode = this.resolveRenderMode(
      displaySetId,
      volumeOptions.renderMode
    );
    await super.addDisplaySet(displaySetId, {
      renderMode,
      role: volumeOptions.role,
    });

    if (renderMode === 'vtkVolume3d' && volumeOptions.role === 'source') {
      this.primaryDataId = displaySetId;
    }

    if (this.bindings.size === 1) {
      this.initialCamera = this.getViewState();
    }

    this.mountedPresentations.set(
      displaySetId,
      this.setDefaultDataPresentation(displaySetId, {
        visible: true,
        opacity: 1,
      })
    );
    this.viewState = this.getViewState();
    this.triggerMountedVOIModified(displaySetId);

    if (!this.mountsDisplaySets && volumeOptions.role === 'source') {
      this.triggerNewVolume([displaySetId]);
    }
  }

  /**
   * Sets the presentation of a display set back to the one after its mount:
   * the default VOI range, and the preset, the colormap and the opacity that
   * it was mounted with. The transfer functions are built anew. The camera
   * stays: `resetViewState` resets it. Fires VOI_MODIFIED, as the legacy
   * `resetProperties`.
   *
   * @param displaySetId - The display set; the current one when not given.
   */
  resetDisplaySetPresentation(displaySetId?: string): void {
    if (this.isDestroyed) {
      return;
    }

    const targetId = displaySetId ?? this.getCurrentBinding()?.data.id;
    const rendering = targetId
      ? this.getVolumeRenderingOf(targetId)
      : undefined;

    if (!targetId || !this.getBinding(targetId)) {
      return;
    }

    if (rendering) {
      rendering.appliedPresentation = undefined;
    }

    this.setDataPresentationState(targetId, {
      ...(this.mountedPresentations.get(targetId) ?? {
        visible: true,
        opacity: 1,
      }),
    });

    this.triggerVOIModified(targetId);
  }

  removeData(displaySetId: string): void {
    super.removeData(displaySetId);
    this.mountedPresentations.delete(displaySetId);
  }

  /**
   * Returns the rendering engine that owns this viewport.
   *
   * @returns The parent rendering engine, if it is still registered.
   */
  getRenderingEngine() {
    return renderingEngineCache.get(this.renderingEngineId);
  }

  /**
   * The image ids of a volume that the viewport shows: of the volume asked
   * for, else of the current volume. Empty when it shows no such volume.
   *
   * @param volumeId - The volume; the current volume when not given.
   * @returns The image ids of the volume.
   */
  getImageIds(volumeId?: string): string[] {
    const binding = this.getVolumeBinding(volumeId);
    const data = binding ? this.getVolume3DPayload(binding) : undefined;

    if (data?.renderMode !== 'vtkVolume3d') {
      return [];
    }

    return data.imageIds;
  }

  /**
   * Returns the underlying VTK renderer for direct integration points.
   *
   * @returns The VTK renderer used by this viewport.
   */
  getRenderer() {
    return this.renderContext.vtk.renderer;
  }

  /**
   * Returns the viewport canvas element.
   *
   * @returns The canvas owned by this viewport.
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Returns the active VTK camera instance.
   *
   * @returns The active VTK camera object.
   */
  getVtkActiveCamera() {
    return this.getRenderer().getActiveCamera();
  }

  /**
   * Returns the current 3D camera state in the compatibility camera shape.
   *
   * @returns The current 3D camera state.
   */
  getViewState(): Volume3DCamera & ICamera {
    return this.getRuntimeCamera();
  }

  setViewState(viewStatePatch: Partial<Volume3DCamera>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getCameraForEvent();

    applyVolume3DCamera(this.renderContext, viewStatePatch, {
      resetClippingRange: true,
    });
    this.viewState = this.getRuntimeCamera();
    this.modified(previousCamera);
  }

  protected getRuntimeCamera(): Volume3DCamera & ICamera {
    const camera = this.getRenderer().getActiveCamera();

    return {
      clippingRange: camera.getClippingRange(),
      focalPoint: camera.getFocalPoint(),
      parallelProjection: camera.getParallelProjection(),
      parallelScale: camera.getParallelScale(),
      position: camera.getPosition(),
      rotation: 0,
      viewAngle: camera.getViewAngle(),
      viewPlaneNormal: camera.getViewPlaneNormal(),
      viewUp: camera.getViewUp(),
    } as Volume3DCamera & ICamera;
  }

  getResolvedView(): Volume3DResolvedView {
    return new Volume3DResolvedView({
      camera: this.getViewState(),
      canvas: this.canvas,
      frameOfReferenceUID: this.resolveFrameOfReferenceUID(),
      renderer: this.getRenderer(),
    });
  }

  getViewReference(
    _viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const binding = this.getCurrentBinding();
    const data = binding ? this.getVolume3DPayload(binding) : undefined;
    const camera = this.getViewState();
    const FrameOfReferenceUID = this.getFrameOfReferenceUID();
    const cameraFocalPoint = camera.focalPoint as Point3 | undefined;
    const viewPlaneNormal = camera.viewPlaneNormal as Point3 | undefined;
    const viewUp = camera.viewUp as Point3 | undefined;
    const viewReference: ViewReference = {
      FrameOfReferenceUID,
      dataId: binding?.data.id,
      cameraFocalPoint,
      viewPlaneNormal,
      viewUp,
    };

    if (data?.renderMode === 'vtkVolume3d') {
      viewReference.volumeId = data.volumeId;
      Object.assign(
        viewReference,
        getDimensionGroupReferenceContext(data.imageVolume)
      );
    }

    if (cameraFocalPoint && viewPlaneNormal && viewUp) {
      viewReference.planeRestriction = {
        FrameOfReferenceUID,
        point: cameraFocalPoint,
        inPlaneVector1: viewUp,
        inPlaneVector2: vec3.cross(
          vec3.create(),
          viewUp as unknown as vec3,
          viewPlaneNormal as unknown as vec3
        ) as Point3,
      };
    }

    return viewReference;
  }

  /**
   * The id of a volume that the viewport shows, as the legacy viewport: the
   * `volumeId` of the specifier when the viewport shows it, else undefined;
   * without one, the current volume.
   *
   * @param specifier - A view reference specifier with a `volumeId`.
   * @returns The volume id, if the viewport shows it.
   */
  getVolumeId(specifier?: ViewReferenceSpecifier): string | undefined {
    const binding = this.getVolumeBinding(specifier?.volumeId);
    const data = binding ? this.getVolume3DPayload(binding) : undefined;

    if (data?.renderMode !== 'vtkVolume3d') {
      return;
    }

    return data.volumeId;
  }

  /**
   * Returns whether the viewport currently contains the given volume id.
   *
   * @param volumeId - Volume id to look up in the current actors.
   * @returns `true` when a matching volume actor is present.
   */
  hasVolumeId(volumeId: string): boolean {
    return this.getActors().some(
      (actorEntry) => actorEntry.referencedId === volumeId
    );
  }

  /**
   * Returns whether any actor reference id contains the given volume URI.
   *
   * @param volumeURI - Volume URI substring to test against actor references.
   * @returns `true` when a matching actor reference is present.
   */
  hasVolumeURI(volumeURI: string): boolean {
    return this.getActors().some((actorEntry) =>
      String(actorEntry.referencedId || '').includes(volumeURI)
    );
  }

  /**
   * The image data of a volume that the viewport shows: of the volume asked
   * for, else of the current display set.
   *
   * @param volumeId - The volume; the current display set when not given.
   * @returns The image data, if the render path exposes it.
   */
  getImageData(volumeId?: string): IImageData | undefined {
    const binding = volumeId
      ? this.getVolumeBinding(volumeId)
      : this.getCurrentBinding();

    return binding?.getImageData?.() as IImageData | undefined;
  }

  /**
   * The value of the current volume at a world point: the voxel nearest the
   * point, as on the legacy viewport. Undefined when the default actor is
   * not a volume.
   *
   * @param point - The world point.
   * @returns The voxel value.
   */
  getIntensityFromWorld(point: Point3): number {
    const actorEntry = this.getDefaultActor();
    const volume = this.getVolumeRenderingOf(
      this.getVolumeBinding()?.data.id
    )?.imageVolume;

    if (!actorEntry || !actorIsA(actorEntry, 'vtkVolume') || !volume) {
      return;
    }

    const index = transformWorldToIndex(volume.imageData, point);

    return volume.voxelManager.getAtIJKPoint(index) as number;
  }

  /**
   * Whether a volume that the viewport shows holds this image, as on the
   * legacy viewport.
   *
   * @param imageURI - The URI of an image.
   * @returns True when a shown volume holds the image.
   */
  hasImageURI(imageURI: string): boolean {
    return Array.from(this.bindings.keys()).some((displaySetId) => {
      const volume = this.getVolumeRenderingOf(displaySetId)?.imageVolume;

      return (
        volume?.getImageIdIndex?.(imageURI) !== undefined ||
        volume?.getImageURIIndex?.(imageURI) !== undefined
      );
    });
  }

  /**
   * The actors of the display sets, then the vtk.js actors that the
   * application added with `addActor`, as the legacy viewport lists its
   * actors.
   *
   * @returns Actor entries of the display sets and of the application.
   */
  getActors(): ActorEntry[] {
    const actors: ActorEntry[] = [];

    for (const binding of this.bindings.values()) {
      const data = this.getVolume3DPayload(binding);

      if (!data) {
        continue;
      }

      actors.push(
        ...this.getActorEntriesForRendering(
          this.getVolume3DRendering(binding),
          data
        )
      );
    }

    return [...actors, ...this.addedActors.values()];
  }

  /** The actor entry with this UID, as on the legacy viewport. */
  getActor(actorUID: string): ActorEntry | undefined {
    return this.getActors().find((actorEntry) => actorEntry.uid === actorUID);
  }

  /**
   * Puts a vtk.js actor of the application into the renderer, as the legacy
   * viewport does: a surface, a sphere of the cropping tool or a line. It
   * draws with the display sets, `getActors` lists it, and a reset fits it
   * when no volume is shown. An actor with the UID of an actor that the
   * viewport has is not added. Fires ACTORS_CHANGED.
   *
   * @param actorEntry - The actor with its UID.
   */
  addActor(actorEntry: ActorEntry): void {
    const { uid, actor } = actorEntry;

    if (!uid || !actor) {
      throw new Error('Actors should have uid and vtk Actor properties');
    }

    if (this.getActor(uid)) {
      log.warn(`Actor ${uid} already exists for this viewport`);

      return;
    }

    this.getRenderer().addActor(actor as vtkActor);
    this.addedActors.set(uid, { ...actorEntry });
    this.getRenderer().resetCameraClippingRange();
    this.triggerActorsChanged([], [actorEntry]);
  }

  /**
   * Adds actors with `addActor` and fires one more ACTORS_CHANGED for all of
   * them, as the legacy viewport. With `resetCamera` the camera then fits
   * what the viewport shows; without it the view stays.
   *
   * @param actors - The actors with their UIDs.
   * @param options - `resetCamera` fits the camera after the add.
   */
  addActors(
    actors: ActorEntry[],
    options: { resetCamera?: boolean } = {}
  ): void {
    actors.forEach((actorEntry) => this.addActor(actorEntry));

    if (options.resetCamera) {
      this.resetViewState();
    }

    this.triggerActorsChanged([], actors);
  }

  /**
   * Replaces what the viewport shows, display sets too, with these actors,
   * and fits the camera to them, as `setActors` of the legacy viewport.
   *
   * @param actors - The actors with their UIDs.
   */
  setActors(actors: ActorEntry[]): void {
    const removedActors = this.getActors();

    this.removeAllData();
    this.removeAddedActors(Array.from(this.addedActors.keys()));
    this.addActors(actors, { resetCamera: true });
    this.triggerActorsChanged(removedActors, actors);
  }

  /**
   * Removes actors by UID: an actor that the application added, or an actor
   * of a display set, whose display set then leaves the viewport. Fires
   * ACTORS_CHANGED.
   *
   * @param actorUIDs - The UIDs of the actors.
   */
  removeActors(actorUIDs: string[]): void {
    const removedActors = this.getActors().filter((actorEntry) =>
      actorUIDs.includes(actorEntry.uid)
    );

    removedActors.forEach(({ uid }) => {
      if (this.addedActors.has(uid)) {
        this.removeAddedActors([uid]);

        return;
      }

      const dataId = this.findDataIdByActorUID(uid);

      if (dataId) {
        this.removeData(dataId);
      }
    });

    this.triggerActorsChanged(removedActors, []);
  }

  /**
   * Returns the default actor for tool integration and legacy compatibility.
   *
   * @returns The primary actor entry, if one is available.
   */
  getDefaultActor(): ActorEntry | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return this.getActors()[0];
    }

    const data = this.getVolume3DPayload(binding);

    if (!data) {
      return undefined;
    }

    return this.getActorEntriesForRendering(
      this.getVolume3DRendering(binding),
      data
    )[0];
  }

  /**
   * Fits the camera to what the viewport shows, as at the first mount and as
   * the legacy 3D viewport fits it in `resetCamera`, renders, and fires
   * CAMERA_MODIFIED and CAMERA_RESET. See `fitViewState` for the fit and the
   * options.
   *
   * @param options - Reset options matching the legacy `resetCamera` contract.
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetViewState(options: ResetCameraOptions = {}): boolean {
    const previousCamera = this.getCameraForEvent();

    this.fitViewState(options);

    if (options.storeAsInitialCamera !== false) {
      this.initialCamera = this.getViewState();
    }

    this.render();
    this.triggerCameraModifiedEvent(previousCamera);
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * The zoom against the initial camera, as on the legacy viewport: 1 after
   * the fit of a mount or a reset, 2 at half its parallel scale. 1 without
   * an initial camera.
   *
   * @param compareCamera - The camera to compare with.
   */
  getZoom(compareCamera: ICamera = this.initialCamera): number {
    if (!compareCamera) {
      return 1;
    }

    return compareCamera.parallelScale / this.getViewState().parallelScale;
  }

  /**
   * Sets the zoom against the initial camera, as on the legacy viewport.
   * With `storeAsInitialCamera` the camera then becomes the initial camera.
   * Does nothing without an initial camera.
   *
   * @param value - The zoom; 2 shows half the extent of the fit.
   * @param storeAsInitialCamera - Makes the zoomed camera the initial one.
   * @param compareCamera - The camera that has zoom 1.
   */
  setZoom(
    value: number,
    storeAsInitialCamera = false,
    compareCamera: ICamera = this.initialCamera
  ): void {
    const initialParallelScale = compareCamera?.parallelScale;

    if (!initialParallelScale) {
      return;
    }

    const parallelScale = initialParallelScale / value;

    if (
      this.getViewState().parallelScale !== parallelScale ||
      storeAsInitialCamera
    ) {
      this.setViewState({ parallelScale });
    }

    if (storeAsInitialCamera) {
      this.initialCamera = this.getViewState();
    }
  }

  /**
   * The pan in canvas pixels against the initial camera, computed as the
   * legacy viewport computes it. [0, 0] without an initial camera.
   *
   * @param initialCamera - The camera that has pan [0, 0].
   */
  getPan(initialCamera: ICamera = this.initialCamera): Point2 {
    if (!initialCamera) {
      return [0, 0];
    }

    const zero3 = this.canvasToWorld([0, 0]);
    const initialCanvasFocal = this.worldToCanvas(
      vec3.subtract(vec3.create(), initialCamera.focalPoint, zero3) as Point3
    );
    const currentCanvasFocal = this.worldToCanvas(
      vec3.subtract(
        vec3.create(),
        this.getViewState().focalPoint,
        zero3
      ) as Point3
    );

    return vec2.subtract(
      vec2.create(),
      initialCanvasFocal,
      currentCanvasFocal
    ) as Point2;
  }

  /**
   * Pans to a canvas offset from the initial camera, as on the legacy
   * viewport. A change under a pixel is ignored unless
   * `storeAsInitialCamera` is set, which then makes the camera the initial
   * camera.
   *
   * @param pan - The offset in canvas pixels.
   * @param storeAsInitialCamera - Makes the panned camera the initial one.
   */
  setPan(pan: Point2, storeAsInitialCamera = false): void {
    const { focalPoint, position } = this.getViewState();
    const zero3 = this.canvasToWorld([0, 0]);
    const delta2 = vec2.subtract(vec2.create(), pan, this.getPan());

    if (
      Math.abs(delta2[0]) < 1 &&
      Math.abs(delta2[1]) < 1 &&
      !storeAsInitialCamera
    ) {
      return;
    }

    const delta = vec3.subtract(
      vec3.create(),
      this.canvasToWorld([delta2[0], delta2[1]]),
      zero3
    );

    this.setViewState({
      focalPoint: vec3.subtract(vec3.create(), focalPoint, delta) as Point3,
      position: vec3.subtract(vec3.create(), position, delta) as Point3,
    });

    if (storeAsInitialCamera) {
      this.initialCamera = this.getViewState();
    }
  }

  /**
   * Moves the view to a view reference, as `getViewReference` describes the
   * view. The camera turns about its focal point to the view plane normal
   * and the view up of the reference, and the focal point then moves along
   * the normal onto the plane of `cameraFocalPoint`. The zoom and the pan in
   * that plane stay, as on the next planar viewport, whose view reference
   * names a plane and not a pan. A plane restriction without a normal gives
   * the normal of its in-plane vectors, its first vector as the view up and
   * its point. A reference of another frame of reference is ignored.
   *
   * @param viewRef - The view reference to show.
   */
  setViewReference(viewRef: ViewReference): void {
    if (
      !viewRef ||
      (viewRef.FrameOfReferenceUID &&
        viewRef.FrameOfReferenceUID !== this.getFrameOfReferenceUID())
    ) {
      return;
    }

    const viewStatePatch = getViewReferenceCamera(this.getViewState(), viewRef);

    if (viewStatePatch) {
      this.setViewState(viewStatePatch);
    }
  }

  /**
   * Fits the camera as `resetViewState` does, without rendering and without
   * events. The content is the volume of the default actor (its image cube,
   * with the focal point on its centre voxel), else every visible prop (the
   * extent of their bounds). The extent along the view up and the view right
   * fills the canvas, the camera keeps its direction and stands ten bounding
   * radii away. `resetZoom: false` keeps the parallel scale. `resetPan: false`
   * keeps the focal point; `resetToCenter: false` with `resetPan` moves the
   * centre of the content along the view plane normal onto the plane of the
   * focal point.
   */
  protected fitViewState(options: ResetCameraOptions = {}): void {
    const { resetPan = true, resetZoom = true, resetToCenter = true } = options;
    const camera = this.getViewState();
    const fit = getVolume3DFitCamera(
      this.renderContext,
      this.getFitContent(),
      camera.viewPlaneNormal,
      camera.viewUp
    );
    const focalPoint = getResetFocalPoint(fit.focalPoint, camera, {
      resetPan,
      resetToCenter,
    });
    const position = vec3.add(
      vec3.create(),
      focalPoint,
      vec3.subtract(vec3.create(), fit.position, fit.focalPoint)
    ) as Point3;

    applyVolume3DCamera(
      this.renderContext,
      {
        parallelScale: resetZoom ? fit.parallelScale : camera.parallelScale,
        focalPoint,
        position,
        viewAngle: 90,
        viewUp: fit.viewUpToUse,
      },
      { resetClippingRange: true }
    );
    setVolume3DPhysicalCamera(this.renderContext, fit.radius, focalPoint);
    this.viewState = this.getViewState();
  }

  /**
   * The render passes of the sharpening and the smoothing of the current
   * display set, as the legacy viewport gives them: smoothing first, then
   * sharpening, each when above 0. Null when there is neither, or when a
   * pass cannot be made. The rendering engines ask for them on every render.
   *
   * @returns The render passes, or null.
   */
  getRenderPasses(): ReturnType<typeof createSharpeningSmoothingRenderPasses> {
    const binding = this.getCurrentBinding();

    try {
      return createSharpeningSmoothingRenderPasses(
        (binding && this.getDisplaySetPresentation(binding.data.id)) || {}
      );
    } catch (error) {
      log.warn('Failed to create custom render passes:', error);

      return null;
    }
  }

  /**
   * Resets the 3D view state after resize using the same behavior as
   * `resetViewState`.
   *
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetViewStateForResize(): boolean {
    return this.resetViewState();
  }

  /**
   * Updates cached size state and notifies active render bindings.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    this.sWidth = this.canvas.width;
    this.sHeight = this.canvas.height;

    this.resizeBindings();
  }

  /**
   * Renders active 3D bindings or queues an engine-driven render.
   */
  render(): void {
    if (this.isDestroyed) {
      return;
    }

    if (!this.renderBindings()) {
      this.requestRenderingEngineRender();
    }
  }

  protected override onDestroy(): void {
    this.primaryDataId = undefined;
    this.initialCamera = undefined;
    this.mountedPresentations.clear();
    this.removeAddedActors(Array.from(this.addedActors.keys()));
  }

  /**
   * The display set whose rendering has the actor with this UID: a volume,
   * or a geometry with several actors.
   */
  private findDataIdByActorUID(actorUID: string): string | undefined {
    for (const [dataId, binding] of this.bindings.entries()) {
      const rendering = binding.rendering as Volume3DRendering;

      if (
        (rendering?.renderMode === 'vtkVolume3d' &&
          rendering.actorEntryUID === actorUID) ||
        (rendering?.renderMode === 'vtkGeometry3d' &&
          rendering.actors.some((actorEntry) => actorEntry.uid === actorUID))
      ) {
        return dataId;
      }
    }
  }

  private removeAddedActors(actorUIDs: string[]): void {
    actorUIDs.forEach((actorUID) => {
      const actorEntry = this.addedActors.get(actorUID);

      if (actorEntry) {
        this.getRenderer().removeActor(actorEntry.actor as vtkActor);
        this.addedActors.delete(actorUID);
      }
    });
  }

  private triggerActorsChanged(
    removedActors: ActorEntry[],
    addedActors: ActorEntry[]
  ): void {
    triggerEvent(this.element, Events.ACTORS_CHANGED, {
      viewportId: this.id,
      removedActors,
      addedActors,
      currentActors: this.getActors(),
    });
  }

  /**
   * Fires the events of a presentation change with the detail of the legacy
   * viewport: COLORMAP_MODIFIED for a colormap, with VOI_MODIFIED too for a
   * colormap name; VOI_MODIFIED for invert (with `invertStateChanged`), a VOI
   * range or a VOI LUT function; PRESET_MODIFIED for a preset. Nothing fires
   * with `suppressEvents` set, or for a display set that is not a volume.
   */
  protected override notifyDataPresentationModified(
    displaySetId: string,
    props: Partial<Volume3DDataPresentation>
  ): void {
    const rendering = this.getVolumeRenderingOf(displaySetId);

    if (this.suppressEvents || !rendering) {
      return;
    }

    const volumeId = rendering.imageVolume.volumeId;

    if ('invert' in props) {
      triggerEvent(this.element, Events.VOI_MODIFIED, {
        ...this.getVOIModifiedEventDetail(displaySetId, rendering),
        invertStateChanged: true,
      });
    }

    if (props.colormap) {
      const colormapDetail = {
        viewportId: this.id,
        colormap: getVolume3DColormap(rendering.actor),
        volumeId,
      };

      if (props.colormap.name) {
        triggerEvent(this.element, Events.VOI_MODIFIED, colormapDetail);
      }

      triggerEvent(this.element, Events.COLORMAP_MODIFIED, colormapDetail);
    }

    if ('voiRange' in props || 'voiLUTFunction' in props) {
      triggerEvent(
        this.element,
        Events.VOI_MODIFIED,
        this.getVOIModifiedEventDetail(displaySetId, rendering)
      );
    }

    const preset = resolveVolume3DPreset(props.preset);

    if (preset) {
      triggerEvent(this.element, Events.PRESET_MODIFIED, {
        viewportId: this.id,
        volumeId,
        actor: rendering.actor,
        presetName: preset.name,
      });
    }
  }

  /**
   * The actor entries of the volumes of these display sets, for the detail
   * of VOLUME_VIEWPORT_NEW_VOLUME.
   */
  protected getNewVolumeActorEntries(displaySetIds: string[]): ActorEntry[] {
    return displaySetIds.flatMap((displaySetId) => {
      const binding = this.getBinding(displaySetId);
      const data = binding ? this.getVolume3DPayload(binding) : undefined;

      if (!data || data.renderMode !== 'vtkVolume3d') {
        return [];
      }

      return this.getActorEntriesForRendering(
        this.getVolume3DRendering(binding),
        data
      );
    });
  }

  /**
   * Fires VOLUME_VIEWPORT_NEW_VOLUME with the actors of the volumes of these
   * display sets, as the legacy `setVolumes`, unless none is a volume or
   * `suppressEvents` is set.
   */
  private triggerNewVolume(displaySetIds: string[]): void {
    const volumeActors = this.getNewVolumeActorEntries(displaySetIds);

    if (this.suppressEvents || !volumeActors.length) {
      return;
    }

    triggerEvent(this.element, Events.VOLUME_VIEWPORT_NEW_VOLUME, {
      viewportId: this.id,
      volumeActors,
    });
  }

  /**
   * Fires VOI_MODIFIED for a mounted volume display set with the detail of
   * the legacy viewport, unless `suppressEvents` is set.
   */
  protected triggerVOIModified(displaySetId: string): void {
    const rendering = this.getVolumeRenderingOf(displaySetId);

    if (this.suppressEvents || !rendering) {
      return;
    }

    triggerEvent(
      this.element,
      Events.VOI_MODIFIED,
      this.getVOIModifiedEventDetail(displaySetId, rendering)
    );
  }

  /**
   * The detail of VOI_MODIFIED as the legacy viewport sends it: the mapping
   * range of the colour function, the VOI LUT function, the colormap and
   * invert.
   */
  private getVOIModifiedEventDetail(
    displaySetId: string,
    rendering: Volume3DVolumeRendering
  ): VoiModifiedEventDetail {
    const presentation = this.getDisplaySetPresentation(displaySetId);
    const [lower, upper] = rendering.actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getMappingRange();

    return {
      viewportId: this.id,
      range: { lower, upper },
      volumeId: rendering.imageVolume.volumeId,
      VOILUTFunction: presentation?.voiLUTFunction,
      colormap: getVolume3DColormap(rendering.actor),
      invert: presentation?.invert,
    };
  }

  /**
   * Fires VOI_MODIFIED after the mount of a volume, with the range that it
   * shows, as the legacy viewport does when it makes the volume actor. A
   * segmentation overlay fires nothing, as the legacy labelmap mount
   * suppresses it.
   */
  private triggerMountedVOIModified(displaySetId: string): void {
    const rendering = this.getVolumeRenderingOf(displaySetId);

    if (this.suppressEvents || !rendering || rendering.excludeFromFidelity) {
      return;
    }

    const [lower, upper] = rendering.actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    triggerEvent(this.element, Events.VOI_MODIFIED, {
      viewportId: this.id,
      range: { lower, upper },
      volumeId: rendering.imageVolume.volumeId,
    });
  }

  /**
   * The binding of the volume with this id, or the current binding when no
   * id is given. Undefined when the viewport shows no such volume.
   */
  private getVolumeBinding(
    volumeId?: string
  ): ViewportDataBinding<Volume3DDataPresentation> | undefined {
    if (!volumeId) {
      return this.getCurrentBinding();
    }

    for (const [displaySetId, binding] of this.bindings.entries()) {
      if (
        this.getVolumeRenderingOf(displaySetId)?.imageVolume.volumeId ===
        volumeId
      ) {
        return binding;
      }
    }
  }

  /** The volume rendering of a display set, when it is a mounted volume. */
  private getVolumeRenderingOf(
    displaySetId: string
  ): Volume3DVolumeRendering | undefined {
    const rendering = this.getBinding(displaySetId)?.rendering as
      | Volume3DRendering
      | undefined;

    return rendering?.renderMode === 'vtkVolume3d' ? rendering : undefined;
  }

  /**
   * Resolves the current VTK-backed 3D camera through the projection adapter
   * without making the adapter responsible for mutating the viewport.
   */
  private getProjectionSnapshot(): Volume3DProjectionSnapshot {
    const snapshot = getVolume3DProjectionSnapshot({
      viewport: this,
      canvasHeight: this.canvas.clientHeight || this.element.clientHeight,
      canvasWidth: this.canvas.clientWidth || this.element.clientWidth,
      camera: this.getViewState(),
      frameOfReferenceUID: this.resolveFrameOfReferenceUID(),
      resolvedView: this.getResolvedView(),
    });

    if (!snapshot) {
      throw new Error(
        '[VolumeViewport3D] Unable to resolve projection snapshot'
      );
    }

    return snapshot;
  }

  protected getCurrentBinding() {
    if (this.primaryDataId) {
      return this.getBinding(this.primaryDataId) ?? this.getFirstBinding();
    }

    return this.getFirstBinding();
  }

  protected getReferenceViewContexts(): GenericViewportReferenceContext[] {
    const contexts: GenericViewportReferenceContext[] = [];
    const camera = this.getViewState();

    for (const [dataId, binding] of this.bindings.entries()) {
      const data = this.getVolume3DPayload(binding);
      const volumeId =
        data?.renderMode === 'vtkVolume3d' ? data.volumeId : undefined;

      contexts.push({
        dataId,
        dataIds: [binding.data.id],
        frameOfReferenceUID:
          binding.getFrameOfReferenceUID() ?? this.getFrameOfReferenceUID(),
        imageIds:
          data?.renderMode === 'vtkVolume3d' ? data.imageIds : undefined,
        volumeId,
        volumeIds: volumeId ? [volumeId] : undefined,
        cameraFocalPoint: camera.focalPoint as Point3 | undefined,
        viewPlaneNormal: camera.viewPlaneNormal as Point3 | undefined,
        ...(data?.renderMode === 'vtkVolume3d'
          ? getDimensionGroupReferenceContext(data.imageVolume)
          : {}),
      });
    }

    return contexts.length ? contexts : super.getReferenceViewContexts();
  }

  private requestRenderingEngineRender(): void {
    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);

    if (renderingEngine) {
      renderingEngine.renderViewport(this.id);
    }
  }

  private resolveRenderMode(
    dataId: string,
    requestedRenderMode: Volume3DSetDataOptions['renderMode'] = 'auto'
  ): 'vtkVolume3d' | 'vtkGeometry3d' {
    if (requestedRenderMode && requestedRenderMode !== 'auto') {
      return requestedRenderMode;
    }

    const dataSet = this.getDataSet(dataId);

    if (dataSet?.imageIds?.length) {
      return 'vtkVolume3d';
    }

    return 'vtkGeometry3d';
  }

  private getDataSet(dataId: string): Volume3DRegisteredDataSet | undefined {
    const dataSet = getGenericViewportImageDisplaySet(dataId);

    if (!isVolume3DRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
  }

  private getVolume3DPayload(
    binding: ViewportDataBinding<Volume3DDataPresentation>
  ): LoadedData<Volume3DPayload> | undefined {
    if (!isVolume3DData(binding.data)) {
      return;
    }

    return binding.data;
  }

  private resolveFrameOfReferenceUID(): string | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    const data = this.getVolume3DPayload(binding);
    const rendering = this.getVolume3DRendering(binding);

    if (!data) {
      return;
    }

    if (data.renderMode === 'vtkVolume3d') {
      return data.imageVolume.metadata?.FrameOfReferenceUID;
    }

    if (rendering.renderMode === 'vtkGeometry3d') {
      return rendering.frameOfReferenceUID;
    }
  }

  private getVolume3DRendering(
    binding: ViewportDataBinding<Volume3DDataPresentation>
  ): Volume3DRendering {
    if (!isVolume3DRendering(binding.rendering)) {
      throw new Error(
        '[VolumeViewport3D] Binding render mode is not a supported 3D rendering'
      );
    }

    return binding.rendering;
  }

  private getActorEntriesForRendering(
    rendering: Volume3DRendering,
    data: LoadedData<Volume3DPayload>
  ): ActorEntry[] {
    if (
      rendering.renderMode === 'vtkVolume3d' &&
      data.renderMode === 'vtkVolume3d'
    ) {
      const { reference } = data;

      return [
        {
          actor: rendering.actor,
          referencedId: data.volumeId,
          uid: rendering.actorEntryUID,
          ...(reference?.kind === 'segmentation' && reference.representationUID
            ? { representationUID: reference.representationUID }
            : {}),
        },
      ];
    }

    if (rendering.renderMode === 'vtkGeometry3d') {
      return rendering.actors;
    }

    return [];
  }

  /**
   * What a reset fits: the image cube of the volume of the default actor
   * when that actor is a volume, else the bounds of every visible prop.
   */
  private getFitContent(): { imageData?: vtkImageData; bounds: number[] } {
    const actorEntry = this.getDefaultActor();

    if (actorEntry && isImageActor(actorEntry)) {
      const rendering = Array.from(this.bindings.values())
        .map((binding) => binding.rendering as Volume3DVolumeRendering)
        .find(
          (volumeRendering) =>
            volumeRendering?.renderMode === 'vtkVolume3d' &&
            volumeRendering.actor === actorEntry.actor
        );
      const imageData =
        rendering?.imageVolume?.imageData ??
        (actorEntry.actor as vtkVolume).getMapper()?.getInputData();

      if (imageData) {
        return { imageData, bounds: imageData.getBounds() };
      }
    }

    return { bounds: this.getRenderer().computeVisiblePropBounds() };
  }
}

export default VolumeViewport3D;

/**
 * The camera of a view reference on a 3D viewport, from its camera now: the
 * view plane normal of the reference, or the normal of the in-plane vectors
 * of its plane restriction, with the view up of the reference made normal to
 * it, and the focal point and the position moved along that normal onto the
 * plane of the point of the reference. The distance of the camera stays.
 * Undefined when the reference names neither a normal nor a point.
 */
function getViewReferenceCamera(
  camera: ICamera,
  viewRef: ViewReference
): Partial<Volume3DCamera> | undefined {
  const { planeRestriction } = viewRef;
  const planeNormal =
    planeRestriction?.inPlaneVector1 && planeRestriction.inPlaneVector2
      ? vec3.cross(
          vec3.create(),
          planeRestriction.inPlaneVector2,
          planeRestriction.inPlaneVector1
        )
      : undefined;
  const referenceNormal =
    viewRef.viewPlaneNormal ??
    (planeNormal && vec3.length(planeNormal) > 0 ? planeNormal : undefined);
  const point = viewRef.cameraFocalPoint ?? planeRestriction?.point;

  if (!referenceNormal && !point) {
    return;
  }

  const viewPlaneNormal = vec3.normalize(
    vec3.create(),
    referenceNormal ?? camera.viewPlaneNormal
  );
  const viewUp = [
    viewRef.viewUp ?? planeRestriction?.inPlaneVector1,
    camera.viewUp,
    [0, 0, 1],
    [0, 1, 0],
  ]
    .filter(Boolean)
    .map((vector) =>
      vec3.scaleAndAdd(
        vec3.create(),
        vector as Point3,
        viewPlaneNormal,
        -vec3.dot(vector as Point3, viewPlaneNormal)
      )
    )
    .find((vector) => !isEqual(vec3.length(vector), 0));
  const distance = vec3.distance(camera.position, camera.focalPoint);
  const alongNormal = point
    ? vec3.dot(
        vec3.subtract(vec3.create(), point, camera.focalPoint),
        viewPlaneNormal
      )
    : 0;
  const focalPoint = vec3.scaleAndAdd(
    vec3.create(),
    camera.focalPoint,
    viewPlaneNormal,
    alongNormal
  );

  return {
    focalPoint: [...focalPoint] as Point3,
    position: [
      ...vec3.scaleAndAdd(vec3.create(), focalPoint, viewPlaneNormal, distance),
    ] as Point3,
    viewUp: [...vec3.normalize(viewUp, viewUp)] as Point3,
  };
}

function isVolume3DData(data: LoadedData): data is LoadedData<Volume3DPayload> {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const payload = data as Record<string, unknown>;

  return (
    (payload.type === 'image' && payload.renderMode === 'vtkVolume3d') ||
    (payload.type === 'geometry' && payload.renderMode === 'vtkGeometry3d')
  );
}

function isVolume3DRendering(rendering: {
  renderMode: string;
}): rendering is Volume3DRendering {
  return (
    rendering.renderMode === 'vtkVolume3d' ||
    rendering.renderMode === 'vtkGeometry3d'
  );
}

function isVolume3DRegisteredDataSet(
  value: unknown
): value is Volume3DRegisteredDataSet {
  if (!isGenericViewportImageDisplaySet(value)) {
    return false;
  }

  return (
    (value.geometryId === undefined || typeof value.geometryId === 'string') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string') &&
    (value.geometryLoadOptions === undefined ||
      (typeof value.geometryLoadOptions === 'object' &&
        !Array.isArray(value.geometryLoadOptions)))
  );
}
