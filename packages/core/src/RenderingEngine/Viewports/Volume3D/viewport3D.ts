import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import { vec3 } from 'gl-matrix';
import { Events, OrientationAxis, ViewportType } from '../../../enums';
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
import BaseViewport from '../BaseViewport';
import { isSegmentationOverlayData } from '../renderingFidelity';
import { getVolumeScalarRange } from '../scalarRange';
import { viewportProjection } from '../viewportProjection';
import { disableViewportWidgets } from '../viewportWidgets';
import {
  getDimensionGroupReferenceContext,
  type ViewReferenceContext,
} from '../viewReferenceCompatibility';
import {
  getVolumeOrImageDisplaySet,
  isImageDisplaySet,
} from '../displaySetAccess';
import { DefaultVolume3DDataProvider } from './DefaultVolume3DDataProvider';
import { createVolume3DRenderPathResolver } from './Volume3DRenderPathResolver';
import Volume3DResolvedView from './Volume3DResolvedView';
import applyVolume3DCamera from './applyVolume3DCamera';
import {
  VOLUME3D_PROJECTION_ID,
  type Volume3DProjectionFit,
  type Volume3DProjectionFraming,
} from './Volume3DProjectionTypes';
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
  Volume3DDisplaySetAppearance,
  Volume3DDisplaySetDescriptor,
  Volume3DRendering,
  Volume3DMountOptions,
  Volume3DViewportRenderContext,
  Volume3DVolumePayload,
  Volume3DVolumeRendering,
  ViewportWidget,
  VolumeViewport3DInput,
} from './viewport3DTypes';

const log = coreLog.getLogger('RenderingEngine', 'VolumeViewport3D');

/**
 * What `setDisplaySets` loaded for one display set before it removed the
 * shown scene: the data and the render mode it was loaded for. The mount
 * takes it, so the data loads once.
 */
interface Volume3DStagedLoad {
  data: LoadedData;
  renderMode: 'vtkVolume3d' | 'vtkGeometry3d';
}

/**
 * Whether a staged load is a volume that the cache removed after the load.
 * The cache deletes the image data of a volume that it removes, so nothing
 * can draw that volume any more.
 */
function isRemovedVolume({ data }: Volume3DStagedLoad): boolean {
  const { imageVolume } = data as unknown as Partial<Volume3DVolumePayload>;

  return (
    Boolean(imageVolume) &&
    (!imageVolume.imageData || imageVolume.imageData.isDeleted())
  );
}

class VolumeViewport3D extends BaseViewport<
  Volume3DCamera,
  Volume3DDisplaySetAppearance,
  Volume3DViewportRenderContext,
  Volume3DProjectionFraming
> {
  readonly type = ViewportType.VOLUME_3D;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  /** The x offset of the viewport in the offscreen canvas of a tiled engine. */
  sx: number;
  /** The y offset of the viewport in the offscreen canvas of a tiled engine. */
  sy: number;
  sWidth: number;
  sHeight: number;
  suppressEvents = false;

  protected renderContext: Volume3DViewportRenderContext;

  private primaryDisplaySetId?: string;
  /**
   * The number of the newest `setDisplaySets` call. An older call that is
   * still loading stops after its load and leaves the viewport to the newer
   * one.
   */
  private setDataRequestId = 0;
  /**
   * The commit of a `setDisplaySets` call while it runs: the removal of the
   * shown display sets and the mount of the new ones. A newer call does not
   * stop it; it waits for its end before it removes anything.
   */
  private mountCommit?: Promise<void>;
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
    this.sx = args.sx;
    this.sy = args.sy;
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
        renderedSize:
          this.sWidth > 0 && this.sHeight > 0
            ? { width: this.sWidth, height: this.sHeight }
            : undefined,
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
   * Content mode of the 3D family (GENVIEW-FAMILY-5): `volume3d` for a
   * mounted volume, `geometry3d` when the source is a surface, `empty` with
   * no source.
   */
  getCurrentMode(): ViewportContentMode {
    const binding = this.getSourceBinding();

    if (!binding) {
      return 'empty';
    }

    return binding.rendering.renderMode === 'vtkGeometry3d'
      ? 'geometry3d'
      : 'volume3d';
  }

  /**
   * Replaces all mounted 3D display sets with the provided ones. The first
   * entry is mounted as the source binding; subsequent entries default to the
   * overlay role unless they specify one explicitly.
   *
   * The data of every entry is loaded, and its render path found, before the
   * shown display sets go, so an entry without data, or with data that no
   * render path draws (a contour), rejects and leaves the shown scene as it
   * was, as the legacy `setVolumes` did for a volume that was not in the
   * cache. A volume that the cache removed after its load rejects in the
   * same way. The mount then takes that data and the render mode it was
   * loaded for, so each display set loads once, and the actor of a volume
   * draws the volume that was loaded.
   *
   * A newer call stops an older one while the older one loads, and the
   * older one fires nothing. Once a call has loaded, its commit (the removal
   * of the shown display sets and the mounts) runs to its end and the call
   * fires DISPLAY_SETS_CHANGED, and a newer call waits for it before it
   * removes anything, as on the planar viewport. So a listener of an event
   * of the commit, as DISPLAY_SET_APPEARANCE_CHANGED, that starts a call
   * that rejects leaves the complete new scene.
   *
   * @param entries - Display sets to mount, each with its own mount options.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: Volume3DMountOptions;
    }>
  ): Promise<void> {
    const requestId = ++this.setDataRequestId;
    const isStale = () => requestId !== this.setDataRequestId;
    const staged: Volume3DStagedLoad[] = [];

    for (const { displaySetId, options = {} } of entries) {
      const renderMode = this.resolveRenderMode(displaySetId);
      const data = await this.dataProvider.load(displaySetId, {
        renderMode,
        volumeId: options.volumeId,
      });

      if (isStale()) {
        return;
      }

      this.renderPathResolver.resolve(this.type, data, { renderMode });
      staged.push({ data, renderMode });
    }

    if (this.mountCommit) {
      await this.mountCommit.catch(() => undefined);

      if (isStale()) {
        return;
      }
    }

    const removedIndex = staged.findIndex(isRemovedVolume);

    if (removedIndex !== -1) {
      throw new Error(
        `[VolumeViewport3D] The volume of ${entries[removedIndex].displaySetId} left the cache while setDisplaySets loaded`
      );
    }

    const commit = this.commitDisplaySets(entries, staged);

    this.mountCommit = commit;

    try {
      await commit;
    } finally {
      if (this.mountCommit === commit) {
        this.mountCommit = undefined;
      }
    }

    this.triggerDisplaySetsChanged(
      entries.map(({ displaySetId }) => displaySetId)
    );
  }

  /**
   * The commit of `setDisplaySets`: removes the shown display sets and
   * mounts the new ones with the data and the render modes that the call
   * loaded. A newer call does not stop it.
   */
  private async commitDisplaySets(
    entries: Array<{
      displaySetId: string;
      options?: Volume3DMountOptions;
    }>,
    staged: Volume3DStagedLoad[]
  ): Promise<void> {
    this.removeAllData();

    for (const [index, { displaySetId, options = {} }] of entries.entries()) {
      await this.mountDisplaySet(
        displaySetId,
        {
          ...options,
          role: options.role ?? (index === 0 ? 'source' : 'overlay'),
        },
        staged[index]
      );
    }
  }

  /**
   * Adds a single 3D display set and selects the effective 3D render mode,
   * then fires DISPLAY_SETS_CHANGED, for an overlay as well as for the
   * source.
   *
   * The first display set of a viewport that shows nothing fits the camera
   * in the orientation of the options, and without a `role` it is the
   * source (the base rule, `resolveAddRole`). A camera that was written while
   * the viewport showed nothing, as a reset on a resize does, is not applied
   * over that fit; its projection stays. The legacy 3D viewport reset its
   * camera at `setVolumes` in the same way.
   *
   * @param displaySetId - Logical display set id to add.
   * @param options - The mount options of the display set.
   */
  async addDisplaySet(
    displaySetId: string,
    options: Volume3DMountOptions = {}
  ): Promise<void> {
    const mounted = await this.mountDisplaySet(displaySetId, {
      ...options,
      role: this.resolveAddRole(displaySetId, options.role),
    });

    if (mounted) {
      this.triggerDisplaySetsChanged([displaySetId]);
    }
  }

  /**
   * The display sets that the viewport shows, in mount order, each with the
   * options of its mount, resolved: the role that it has now and, for a
   * volume, the id of the volume that it shows (the volume of the mount
   * option, else of the registration, else the default id of its images).
   * `appearance` is not among them: it was applied once, at the mount, and
   * `getDisplaySetAppearance(displaySetId)` gives the look.
   * `other.setDisplaySets(...viewport.getDisplaySets())` on another 3D
   * viewport therefore shows the same layers of the same data, and loads no
   * volume a second time.
   */
  override getDisplaySets(): Array<{
    displaySetId: string;
    options: Volume3DMountOptions;
  }> {
    return Array.from(this.bindings.entries()).map(
      ([displaySetId, binding]) => {
        const volumeId =
          this.getVolumeRenderingOf(displaySetId)?.imageVolume.volumeId;

        return {
          displaySetId,
          options: volumeId
            ? { role: binding.role, volumeId }
            : { role: binding.role },
        };
      }
    );
  }

  /**
   * Mounts one 3D display set, as `addDisplaySet` describes, without an
   * event. It takes the data and the render mode that `setDisplaySets`
   * loaded (`staged`), and loads them without it. Gives whether the display
   * set was bound.
   */
  private async mountDisplaySet(
    displaySetId: string,
    volumeOptions: Volume3DMountOptions,
    staged?: Volume3DStagedLoad
  ): Promise<boolean> {
    if (this.isDestroyed) {
      throw new Error('Viewport has been destroyed');
    }

    const renderMode =
      staged?.renderMode ?? this.resolveRenderMode(displaySetId);

    const showedNothing = !this.bindings.size;

    if (showedNothing) {
      this.viewState = {
        parallelProjection: this.viewState.parallelProjection,
      } as Volume3DCamera;
    }

    const dataOptions: DataAddOptions = {
      renderMode,
      role: volumeOptions.role,
    };
    const data = staged?.data
      ? staged.data
      : await this.dataProvider.load(displaySetId, {
          ...dataOptions,
          volumeId: volumeOptions.volumeId,
        });
    const restoreAppearance = this.stageMountedAppearance(
      displaySetId,
      { visible: true, opacity: 1 },
      volumeOptions.appearance
    );
    let added = false;

    try {
      added = await this.addLoadedData(displaySetId, data, dataOptions);
    } finally {
      if (!added) {
        restoreAppearance();
      }
    }

    if (!added) {
      return false;
    }

    if (renderMode === 'vtkVolume3d' && volumeOptions.role === 'source') {
      this.primaryDisplaySetId = displaySetId;
    }

    this.viewState = this.getViewState();

    if (showedNothing && this.viewState.viewUp) {
      setVolume3DZeroRotationViewUp(
        this,
        this.viewState.viewUp,
        this.viewState.viewPlaneNormal
      );
    }

    this.applyMountedAppearance(displaySetId);

    return true;
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

  /**
   * The zoom of the view, the `zoom` that `viewportProjection.getFraming`
   * gives: 1 for the fit that `resetViewState` gives for the direction of the
   * camera now, 2 when the picture is twice as large. The fit is computed at
   * each read, so the zoom changes when the camera turns to a side where the
   * content has another extent. With a perspective camera it is the size of
   * what lies at the focal point. 1 when the viewport shows nothing to fit.
   *
   * @returns The zoom against the fit.
   */
  getZoom(): number {
    return this.getProjectionFraming()?.zoom ?? 1;
  }

  /**
   * Sets the zoom, as one write of the view state of
   * `viewportProjection.withFraming(viewport, { zoom })`: it renders and
   * fires CAMERA_MODIFIED. A parallel camera gets the parallel scale of the
   * zoom. A perspective camera moves along its view plane normal and keeps
   * its view angle.
   *
   * Without a canvas point the focal point stays, so the picture grows about
   * the centre of the canvas. With one, the world point that shows under it
   * in the plane of the focal point stays under it, as `anchorCanvas` of the
   * projection service does, and the pan changes with it. A viewport that
   * shows nothing to fit keeps its camera.
   *
   * @param zoom - The zoom against the fit, 1 for the fit.
   * @param canvasPoint - The canvas point that the picture stays under.
   */
  setZoom(zoom: number, canvasPoint?: Point2): void {
    this.applyProjectionFraming({ zoom }, canvasPoint);
  }

  /**
   * The pan of the view in canvas pixels on the screen, as on the planar
   * viewport: `[0, 0]` for the fit of the direction of the camera now, and
   * how far the centre of that fit shows from the centre of the canvas after
   * that, at any zoom. It is `pan * zoom` of the framing of
   * `viewportProjection`. `[0, 0]` when the viewport shows nothing to fit.
   *
   * @returns The pan in canvas pixels.
   */
  getPan(): Point2 {
    const { zoom, pan } = this.getProjectionFraming() ?? {};

    return zoom && pan ? [pan[0] * zoom, pan[1] * zoom] : [0, 0];
  }

  /**
   * Moves the picture so that `getPan` gives this pan, as one write of the
   * view state of `viewportProjection.withFraming(viewport, { pan })`
   * with the pan divided by the zoom: it renders and fires CAMERA_MODIFIED.
   * A canvas delta added to `getPan` moves the picture by that delta on the
   * screen. The focal point and the position move in the plane of the view,
   * and the zoom stays. A viewport that shows nothing to fit keeps its
   * camera.
   *
   * @param pan - The pan in canvas pixels on the screen.
   */
  setPan(pan: Point2): void {
    const zoom = this.getZoom();

    this.applyProjectionFraming({
      pan: [pan[0] / zoom, pan[1] / zoom],
    });
  }

  /** The framing that the projection service gives for this viewport. */
  private getProjectionFraming(): Volume3DProjectionFraming | undefined {
    return viewportProjection.getFraming(this, {
      kind: VOLUME3D_PROJECTION_ID,
    });
  }

  /**
   * Writes the view state that the projection service gives for a zoom or a
   * pan against the fit.
   *
   * @param framing - The zoom, or the pan in canvas pixels at zoom 1.
   * @param anchorCanvas - The canvas point that a zoom keeps.
   */
  private applyProjectionFraming(
    framing: Pick<Volume3DProjectionFraming, 'zoom' | 'pan'>,
    anchorCanvas?: Point2
  ): void {
    const viewState = viewportProjection.withFraming(
      this,
      framing,
      { kind: VOLUME3D_PROJECTION_ID },
      { anchorCanvas }
    );

    if (viewState) {
      this.setViewState(viewState);
    }
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
      getCanvasSize: () => this.getFramingCanvasSize(),
      getFit: (direction) => this.getProjectionFit(direction),
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
      displaySetId: binding?.data.id,
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
   * The ids of the volumes that the viewport shows, each once: the volume of
   * the source first, then those of the overlays in mount order. A surface
   * shows no volume. The labelmap of a segmentation, an overlay whose
   * descriptor has a `reference` of kind `'segmentation'`, is left out
   * unless `includeSegmentations` is true.
   *
   * @param options - `includeSegmentations`: list the labelmap volumes too.
   * @returns The volume ids, the source first.
   */
  getVolumeIds(options: { includeSegmentations?: boolean } = {}): string[] {
    const volumeIds = new Set<string>();

    for (const { binding, volumeId } of this.getVolumeBindingsSourceFirst()) {
      if (
        options.includeSegmentations ||
        !isSegmentationOverlayData(
          binding.data as { reference?: { kind?: string } },
          { renderMode: binding.rendering.renderMode, role: binding.role }
        )
      ) {
        volumeIds.add(volumeId);
      }
    }

    return Array.from(volumeIds);
  }

  /**
   * The id of the mounted display set that shows the volume of this id.
   * When two display sets show the volume, the source when it is one of
   * them, else the first in mount order. Undefined for a volume that the
   * viewport does not show.
   *
   * @param volumeId - The volume id.
   * @returns The display set id, or undefined.
   */
  getDisplaySetIdForVolumeId(volumeId: string): string | undefined {
    return this.getVolumeBindingsSourceFirst().find(
      (entry) => entry.volumeId === volumeId
    )?.displaySetId;
  }

  /**
   * The range of the values of the volume of a display set, `[min, max]`:
   * of the source when no display set is given. It is the range of the whole
   * volume as its voxel manager knows it (`voxelManager.getRange()`), the
   * same answer as a planar viewport that shows the volume gives. While the
   * volume loads it is the range of the images that have arrived; read it
   * again at `IMAGE_VOLUME_MODIFIED`. Undefined for a surface, for a display
   * set that is not mounted and before the first image of the volume has
   * arrived.
   *
   * @param displaySetId - The display set; the source when not given.
   * @returns The range, or undefined.
   */
  getScalarRange(displaySetId?: string): [number, number] | undefined {
    const binding = displaySetId
      ? this.getBinding(displaySetId)
      : this.getSourceBinding();
    const rendering = binding?.rendering as Volume3DRendering | undefined;

    return rendering?.renderMode === 'vtkVolume3d'
      ? getVolumeScalarRange(rendering.imageVolume)
      : undefined;
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
   *
   * @param direction - The view plane normal and the view up of the fit; the
   *   ones of the camera now when not given.
   */
  private getProjectionFit(
    direction: Pick<
      Volume3DCamera,
      'viewPlaneNormal' | 'viewUp'
    > = this.getViewState()
  ): Volume3DProjectionFit | undefined {
    const content = this.getFitContent();
    const { bounds } = content;

    if (
      bounds[0] > bounds[1] ||
      bounds[2] > bounds[3] ||
      bounds[4] > bounds[5]
    ) {
      return;
    }

    const fit = getVolume3DFitCamera(
      this.renderContext,
      content,
      direction.viewPlaneNormal,
      direction.viewUp
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
        (binding && this.getDisplaySetAppearance(binding.data.id)) || {}
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
   * Notifies the active render bindings of a new size. The rendering engine
   * sets `sWidth` and `sHeight`, the size that it draws the viewport at, and
   * the fit of the view follows that size from now on, as the fit of the
   * legacy viewports did, also before the canvas takes it. A resize while
   * the element has no size keeps the size of the fit and of the framing. A
   * framing written while the element had no size is set again at the new
   * size, see `setViewFraming`.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    const pending = this.takePendingViewFraming();

    if (this.sWidth > 0 && this.sHeight > 0) {
      this.renderContext.viewport.renderedSize = {
        width: this.sWidth,
        height: this.sHeight,
      };
    }

    this.resizeBindings();
    this.applyPendingViewFraming(pending);
  }

  /** The CSS size of the canvas that the viewport draws on. */
  protected override measureCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
    };
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
    this.primaryDisplaySetId = undefined;
  }

  /**
   * Stores the overrides of a display set as the base class does. When an
   * override goes, by a reset or a key given as `undefined`, the transfer
   * functions of the volume are built anew from the defaults: a later
   * appearance otherwise changes only what differs from the one before, and
   * would keep the window or the colormap that the override set.
   */
  protected override setAppearanceState(
    displaySetId: string,
    props: Volume3DDisplaySetAppearance
  ): void {
    const previous = this.getAppearanceState(displaySetId) ?? {};
    const rendering = this.getVolumeRenderingOf(displaySetId);

    if (rendering && Object.keys(previous).some((key) => !(key in props))) {
      rendering.appliedAppearance = undefined;
    }

    super.setAppearanceState(displaySetId, props);
  }

  /**
   * Whether a change of the appearance of a display set fires
   * `DISPLAY_SET_APPEARANCE_CHANGED`: not for a segmentation, whose look
   * the segmentation style owns.
   */
  protected override firesAppearanceEvents(displaySetId: string): boolean {
    const binding = this.getBinding(displaySetId);

    return (
      !this.suppressEvents &&
      !!binding &&
      !isSegmentationOverlayData(
        binding.data as { reference?: { kind?: string } },
        { renderMode: binding.rendering.renderMode, role: binding.role }
      )
    );
  }

  /**
   * The defaults that the effective appearance shows under the overrides:
   * those of the mount, and the default window of a volume.
   */
  protected override getDefaultDisplaySetAppearance(
    displaySetId: string
  ): Partial<Volume3DDisplaySetAppearance> {
    const defaultVOIRange =
      this.getVolumeRenderingOf(displaySetId)?.defaultVOIRange;

    return {
      ...super.getDefaultDisplaySetAppearance(displaySetId),
      voiRange: defaultVOIRange ? { ...defaultVOIRange } : undefined,
    };
  }

  /**
   * The binding of the volume with this id, or the current binding when no
   * id is given. Undefined when the viewport shows no such volume.
   */
  private getVolumeBinding(
    volumeId?: string
  ): ViewportDataBinding<Volume3DDisplaySetAppearance> | undefined {
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

  /**
   * The display sets that show a volume, with their volume ids: the source
   * first, then the others in mount order.
   */
  private getVolumeBindingsSourceFirst(): Array<{
    displaySetId: string;
    binding: ViewportDataBinding<Volume3DDisplaySetAppearance>;
    volumeId: string;
  }> {
    const entries = Array.from(this.bindings.entries()).flatMap(
      ([displaySetId, binding]) => {
        const volumeId =
          this.getVolumeRenderingOf(displaySetId)?.imageVolume.volumeId;

        return volumeId ? [{ displaySetId, binding, volumeId }] : [];
      }
    );

    return [
      ...entries.filter(({ binding }) => binding.role === 'source'),
      ...entries.filter(({ binding }) => binding.role !== 'source'),
    ];
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
   * The volume that was mounted as the source while it is still the source,
   * else the first display set: after a removal of the source, the display
   * set that became the source.
   */
  protected getCurrentBinding() {
    const primary = this.primaryDisplaySetId
      ? this.getBinding(this.primaryDisplaySetId)
      : undefined;

    return primary?.role === 'source' ? primary : this.getFirstBinding();
  }

  protected getReferenceViewContexts(): ViewReferenceContext[] {
    const contexts: ViewReferenceContext[] = [];
    const camera = this.getViewState();

    for (const [displaySetId, binding] of this.bindings.entries()) {
      const data = this.getVolume3DPayload(binding);
      const volumeId =
        data?.renderMode === 'vtkVolume3d' ? data.volumeId : undefined;

      contexts.push({
        displaySetId,
        displaySetIds: [binding.data.id],
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
    displaySetId: string
  ): 'vtkVolume3d' | 'vtkGeometry3d' {
    const dataSet = this.getDataSet(displaySetId);

    if (dataSet?.imageIds?.length) {
      return 'vtkVolume3d';
    }

    return 'vtkGeometry3d';
  }

  private getDataSet(
    displaySetId: string
  ): Volume3DDisplaySetDescriptor | undefined {
    const dataSet = getVolumeOrImageDisplaySet(displaySetId);

    if (!isVolume3DDisplaySetDescriptor(dataSet)) {
      return;
    }

    return dataSet;
  }

  private getVolume3DPayload(
    binding: ViewportDataBinding<Volume3DDisplaySetAppearance>
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
    binding: ViewportDataBinding<Volume3DDisplaySetAppearance>
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

function isVolume3DDisplaySetDescriptor(
  value: unknown
): value is Volume3DDisplaySetDescriptor {
  if (!isImageDisplaySet(value)) {
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
