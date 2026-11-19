import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import { vec3 } from 'gl-matrix';
import { Events, OrientationAxis, ViewportType } from '../../../enums';
import type {
  ActorEntry,
  ICamera,
  IImageData,
  Point3,
  ResetCameraOptions,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import type { VoiModifiedEventDetail } from '../../../types/EventTypes';
import { isImageActor } from '../../../utilities/actorCheck';
import isEqual from '../../../utilities/isEqual';
import { coreLog } from '../../../utilities/logger';
import triggerEvent from '../../../utilities/triggerEvent';
import renderingEngineCache from '../../renderingEngineCache';
import { createSharpeningSmoothingRenderPasses } from '../../renderPasses';
import type {
  DataAddOptions,
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import GenericViewport from '../GenericViewport';
import { disableViewportWidgets } from '../viewportWidgets';
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
import { getVolume3DColormap } from './applyVolume3DPresentation';
import type { Volume3DProjectionFit } from './Volume3DProjectionTypes';
import { setVolume3DZeroRotationViewUp } from './volume3DProjectionSnapshot';
import {
  VOLUME_3D_FIT_VIEW_ANGLE,
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
  ViewportWidget,
  VolumeViewport3DInput,
} from './viewport3DTypes';

const log = coreLog.getLogger('RenderingEngine', 'VolumeViewport3D');

class VolumeViewport3D extends GenericViewport<
  Volume3DCamera,
  Volume3DDataPresentation,
  Volume3DViewportRenderContext
> {
  readonly type = ViewportType.VOLUME_3D;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  suppressEvents = false;

  protected renderContext: Volume3DViewportRenderContext;

  private primaryDataId?: string;
  /** True while `setDisplaySets` mounts, which fires one event for all. */
  private mountsDisplaySets = false;
  /**
   * The presentation of each display set after its mount, which
   * `resetDisplaySetPresentation` goes back to.
   */
  private readonly mountedPresentations = new Map<
    string,
    Volume3DDataPresentation
  >();
  /** The widgets that tools keep on the viewport, by id. */
  protected readonly widgets = new Map<string, ViewportWidget>();

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
    this.turnToOrientationOption();

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
   * The data of every entry is loaded before the shown display sets go, so
   * an entry without data rejects and leaves the shown scene as it was, as
   * the legacy `setVolumes` did for a volume that was not in the cache.
   *
   * @param entries - Display sets to mount, each with its own render-mode options.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: Volume3DSetDataOptions;
    }>
  ): Promise<void> {
    for (const { displaySetId, options = {} } of entries) {
      await this.dataProvider.load(displaySetId, {
        renderMode: this.resolveRenderMode(displaySetId, options.renderMode),
      });
    }

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
   * The first display set of a viewport that shows nothing fits the camera
   * in the orientation of the options. A camera that was written while the
   * viewport showed nothing, as a reset on a resize does, is not applied over
   * that fit; its projection stays. The legacy 3D viewport reset its camera
   * at `setVolumes` in the same way.
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

    const showedNothing = !this.bindings.size;

    if (showedNothing) {
      this.viewState = {
        parallelProjection: this.viewState.parallelProjection,
      } as Volume3DCamera;
    }

    await super.addDisplaySet(displaySetId, {
      renderMode,
      role: volumeOptions.role,
    });

    if (renderMode === 'vtkVolume3d' && volumeOptions.role === 'source') {
      this.primaryDataId = displaySetId;
    }

    this.mountedPresentations.set(
      displaySetId,
      this.setDefaultDataPresentation(displaySetId, {
        visible: true,
        opacity: 1,
      })
    );
    this.viewState = this.getViewState();

    if (showedNothing && this.viewState.viewUp) {
      setVolume3DZeroRotationViewUp(this, this.viewState.viewUp);
    }

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
   * Keeps a widget of a tool under an id: the OrientationMarkerTool keeps its
   * vtk.js orientation marker widget here. The rendering engine draws the
   * renderer of each widget with the viewport.
   *
   * @param widgetId - The id of the widget, the tool name for a tool.
   * @param widget - The widget.
   */
  addWidget(widgetId: string, widget: ViewportWidget): void {
    this.widgets.set(widgetId, widget);
  }

  /** Every widget that the viewport keeps. The rendering engine reads it. */
  getWidgets(): ViewportWidget[] {
    return Array.from(this.widgets.values());
  }

  /**
   * Disables every widget and takes the actor of a widget out of its
   * renderer. The rendering engine calls it when it disables the viewport.
   */
  override removeWidgets(): void {
    disableViewportWidgets(this.widgets.values());
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

  /**
   * Writes a patch of the camera, renders, and fires CAMERA_MODIFIED.
   *
   * Every write fits the clipping range to the bounds of every visible prop
   * of the renderer, as the legacy 3D viewport did at each `setCamera`: what
   * the viewport shows, and a prop that a tool or the application added, stay
   * in view when the camera moves or changes its projection. A
   * `clippingRange` of the patch, as the camera read before a zoom or a pan
   * gives it, is not applied.
   *
   * @param viewStatePatch - The camera fields to change.
   */
  setViewState(viewStatePatch: Partial<Volume3DCamera>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getCameraForEvent();

    applyVolume3DCamera(this.renderContext, viewStatePatch);
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
      getFit: () => this.getProjectionFit(),
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
   * The actors of the display sets, in mount order. The `referencedId` of an
   * entry is the volume id of a volume and the geometry id of a geometry. A
   * prop that a tool or the application gave to the renderer is not listed.
   *
   * @returns Actor entries of the display sets.
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

    return actors;
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
   * CAMERA_MODIFIED and CAMERA_RESET. The content is the volume of the
   * default actor (its image cube, with the focal point on its centre voxel),
   * else every visible prop (the extent of their bounds). The extent along
   * the view up and the view right fills the canvas, the camera keeps its
   * direction and stands ten bounding radii away. `resetZoom: false` keeps
   * the parallel scale. `resetPan: false` keeps the focal point;
   * `resetToCenter: false` with `resetPan` moves the centre of the content
   * along the view plane normal onto the plane of the focal point.
   *
   * @param options - Reset options matching the legacy `resetCamera` contract.
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetViewState(options: ResetCameraOptions = {}): boolean {
    const previousCamera = this.getCameraForEvent();
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

    applyVolume3DCamera(this.renderContext, {
      parallelScale: resetZoom ? fit.parallelScale : camera.parallelScale,
      focalPoint,
      position,
      viewAngle: VOLUME_3D_FIT_VIEW_ANGLE,
      viewUp: fit.viewUpToUse,
    });
    setVolume3DPhysicalCamera(this.renderContext, fit.radius, focalPoint);
    this.viewState = this.getViewState();
    this.render();
    this.triggerCameraModifiedEvent(previousCamera);
    this.triggerCameraResetEvent();

    return true;
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
   * Turns the camera to the orientation of the options and fits what the
   * renderer shows, as the legacy 3D viewport did when it was made. A
   * viewport that shows a surface or a prop of a tool before any volume then
   * looks from that side. With nothing visible the fit is the one of an
   * empty scene: ten bounding radii of the box from -1 to 1 away. No
   * orientation, or the acquisition plane, which needs a volume, keeps the
   * camera of vtk.js, as on the legacy viewport.
   */
  private turnToOrientationOption(): void {
    const { orientation } = this.defaultOptions;

    if (!orientation || orientation === OrientationAxis.ACQUISITION) {
      return;
    }

    const vtkCamera = this.getVtkActiveCamera();
    const { viewPlaneNormal, viewUp } = getOrientationVectors({
      fallbackViewPlaneNormal: vtkCamera.getViewPlaneNormal() as Point3,
      fallbackViewUp: vtkCamera.getViewUp() as Point3,
      orientation,
    });
    const fit = getVolume3DFitCamera(
      this.renderContext,
      { bounds: this.getRenderer().computeVisiblePropBounds() },
      viewPlaneNormal,
      viewUp
    );

    applyVolume3DCamera(this.renderContext, {
      viewPlaneNormal,
      viewUp: fit.viewUpToUse,
      focalPoint: fit.focalPoint,
      position: fit.position,
      parallelScale: fit.parallelScale,
      viewAngle: VOLUME_3D_FIT_VIEW_ANGLE,
    });
    setVolume3DPhysicalCamera(this.renderContext, fit.radius, fit.focalPoint);
  }

  /**
   * The fit that `resetViewState` would give now, for the zoom and the pan
   * of the projection service: its focal point, its parallel scale, and the
   * distance and the view angle of its camera. Undefined when the viewport
   * shows nothing to fit.
   */
  private getProjectionFit(): Volume3DProjectionFit | undefined {
    const content = this.getFitContent();
    const { bounds } = content;

    if (
      bounds[0] > bounds[1] ||
      bounds[2] > bounds[3] ||
      bounds[4] > bounds[5]
    ) {
      return;
    }

    const camera = this.getViewState();
    const fit = getVolume3DFitCamera(
      this.renderContext,
      content,
      camera.viewPlaneNormal,
      camera.viewUp
    );

    return {
      focalPoint: fit.focalPoint,
      parallelScale: fit.parallelScale,
      distance: vec3.distance(fit.position, fit.focalPoint),
      viewAngle: VOLUME_3D_FIT_VIEW_ANGLE,
    };
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
    this.mountedPresentations.clear();
  }

  /**
   * Fires the events of a presentation change with the detail of the legacy
   * viewport: COLORMAP_MODIFIED for a colormap, with VOI_MODIFIED too for a
   * colormap name; VOI_MODIFIED for invert, a VOI range or a VOI LUT
   * function. The detail carries the invert of the display set in `invert`,
   * and no `invertStateChanged`, as on the next planar viewport. Nothing
   * fires with `suppressEvents` set, or for a display set that is not a
   * volume. A preset fires no event.
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
      triggerEvent(
        this.element,
        Events.VOI_MODIFIED,
        this.getVOIModifiedEventDetail(displaySetId, rendering)
      );
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
  }

  /**
   * Fires VOLUME_VIEWPORT_NEW_VOLUME with the actor entries of the volumes of
   * these display sets, as the legacy `setVolumes`, unless none is a volume
   * or `suppressEvents` is set.
   */
  private triggerNewVolume(displaySetIds: string[]): void {
    const volumeActors = displaySetIds.flatMap((displaySetId) => {
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
   * when that actor is a volume, else the bounds of every visible prop. A
   * visible geometry display set that reaches outside the image cube is
   * content too: the fit is then the bounds of the cube and of the geometry.
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
        const imageBounds = imageData.getBounds();
        const bounds = this.getBoundsWithGeometry(imageBounds);

        return isEqual(bounds, imageBounds)
          ? { imageData, bounds }
          : { bounds };
      }
    }

    return { bounds: this.getRenderer().computeVisiblePropBounds() };
  }

  /**
   * The bounds grown to hold every visible actor of the geometry display
   * sets. A prop that a tool gave to the renderer is not counted.
   */
  private getBoundsWithGeometry(bounds: number[]): number[] {
    const grown = [...bounds];

    for (const binding of this.bindings.values()) {
      const rendering = binding.rendering as Volume3DRendering;

      if (rendering.renderMode !== 'vtkGeometry3d') {
        continue;
      }

      for (const { actor } of rendering.actors) {
        const actorBounds = (actor as vtkActor).getBounds();

        if (
          !(actor as vtkActor).getVisibility() ||
          actorBounds[0] > actorBounds[1]
        ) {
          continue;
        }

        for (let axis = 0; axis < 3; axis++) {
          grown[2 * axis] = Math.min(grown[2 * axis], actorBounds[2 * axis]);
          grown[2 * axis + 1] = Math.max(
            grown[2 * axis + 1],
            actorBounds[2 * axis + 1]
          );
        }
      }
    }

    return grown;
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
