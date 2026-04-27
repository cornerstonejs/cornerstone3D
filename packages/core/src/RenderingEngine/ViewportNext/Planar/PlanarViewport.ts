import { vec3 } from 'gl-matrix';
import {
  Events,
  OrientationAxis,
  ViewportType,
  VOILUTFunctionType,
} from '../../../enums';
import { ActorRenderMode } from '../../../types';
import type {
  ActorEntry,
  CPUIImageData,
  IBaseVolumeViewport,
  ICamera,
  IImage,
  IStackInput,
  OrientationVectors,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  VOIRange,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import cache from '../../../cache/cache';
import type { PlaneRestriction } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import getClosestImageId from '../../../utilities/getClosestImageId';
import { deepClone } from '../../../utilities/deepClone';
import imageIdToURI from '../../../utilities/imageIdToURI';
import isEqual from '../../../utilities/isEqual';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import viewportNextDataSetMetadataProvider from '../../../utilities/viewportNextDataSetMetadataProvider';
import triggerEvent from '../../../utilities/triggerEvent';
import getMinMax from '../../../utilities/getMinMax';
import hasOwn from '../../../utilities/hasOwn';
import renderingEngineCache from '../../renderingEngineCache';
import { getCameraVectors } from '../../helpers/getCameraVectors';
import type {
  BindingRole,
  LoadedData,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportNext from '../ViewportNext';
import {
  getDimensionGroupReferenceContext,
  type ViewportNextReferenceContext,
} from '../viewportNextReferenceCompatibility';
import {
  getViewportNextImageDataSet,
  isViewportNextImageDataSet,
} from '../viewportNextDataSetAccess';
import { CpuImageSlicePath } from './CpuImageSliceRenderPath';
import { CpuVolumeSlicePath } from './CpuVolumeSliceRenderPath';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { VtkImageMapperPath } from './VtkImageMapperRenderPath';
import { VtkVolumeSlicePath } from './VtkVolumeSliceRenderPath';
import {
  normalizePlanarOrientation,
  selectPlanarRenderPath,
} from './planarRenderPathSelector';
import type { SelectedPlanarRenderPath } from './planarRenderPathSelector';
import { clonePlanarOrientation } from './planarLegacyCompatibility';
import { normalizePlanarRotation } from './planarViewPresentation';
import {
  cloneDisplayArea,
  createDefaultPlanarViewState,
  normalizePlanarViewState,
} from './planarViewState';
import {
  clonePlanarScale,
  getPlanarScaleZoom,
  normalizePlanarScale,
  type PlanarScaleInput,
} from './planarCameraScale';
import {
  canvasToWorldPlanarCpuImage,
  worldToCanvasPlanarCpuImage,
} from './planarCpuImageTransforms';
import type { DerivedPlanarPresentation } from './planarRenderCamera';
import {
  getPlanarViewStateCanvasDimensions,
  resolvePlanarViewportView,
} from './PlanarResolvedView';
import {
  createPlanarCpuVolumeSliceBasis,
  createPlanarVolumeSliceBasis,
} from './planarSliceBasis';
import {
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  isPlanarPlaneViewable,
} from './planarViewReference';
import type { PlanarRendering } from './planarRuntimeTypes';
import type {
  PlanarViewState,
  PlanarDataPresentation,
  PlanarDataProvider,
  PlanarDisplayArea,
  PlanarEffectiveRenderMode,
  PlanarPayload,
  PlanarRegisteredDataSet,
  PlanarResolvedICamera,
  PlanarSetDataOptions,
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  PlanarViewportRenderContext,
  PlanarViewportInput,
  PlanarViewportInputOptions,
} from './PlanarViewportTypes';

defaultRenderPathResolver.register(new CpuImageSlicePath());
defaultRenderPathResolver.register(new CpuVolumeSlicePath());
defaultRenderPathResolver.register(new VtkImageMapperPath());
defaultRenderPathResolver.register(new VtkVolumeSlicePath());

type PlanarSetOrientationInput =
  | OrientationAxis.ACQUISITION
  | OrientationAxis.AXIAL
  | OrientationAxis.CORONAL
  | OrientationAxis.SAGITTAL
  | OrientationAxis.REFORMAT
  | OrientationAxis.AXIAL_REFORMAT
  | OrientationAxis.CORONAL_REFORMAT
  | OrientationAxis.SAGITTAL_REFORMAT
  | OrientationVectors;

export type PlanarReferenceContext = {
  dataId: string;
  data: LoadedData<PlanarPayload>;
  frameOfReferenceUID: string;
  rendering: PlanarRendering;
};

class PlanarViewport extends ViewportNext<
  PlanarViewState,
  PlanarDataPresentation,
  PlanarViewportRenderContext,
  PlanarViewPresentation
> {
  readonly type = ViewportType.PLANAR_NEXT;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: PlanarViewportInputOptions;
  options: PlanarViewportInputOptions;
  suppressEvents = false;

  protected renderContext: PlanarViewportRenderContext;

  private sourceDataId?: string;
  private cpuCanvas?: HTMLCanvasElement;

  // ── Static ───────────────────────────────────────────────────────────

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(args: PlanarViewportInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas;
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.defaultOptions = cloneViewportOptions(args.defaultOptions || {});
    this.options = cloneViewportOptions(this.defaultOptions);
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.canvasToWorld = this.canvasToWorld.bind(this);
    this.worldToCanvas = this.worldToCanvas.bind(this);
    this.dataProvider = args.dataProvider || new DefaultPlanarDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);
    const renderer = renderingEngine?.getRenderer(this.id);

    if (!renderer) {
      throw new Error(
        '[PlanarViewport] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
      );
    }

    const vtkCanvas = args.canvas;
    const viewportElement = this.element.querySelector(
      '.viewport-element'
    ) as HTMLDivElement | null;

    const cpuCanvas = document.createElement('canvas');
    cpuCanvas.style.display = 'none';
    cpuCanvas.style.height = '100%';
    cpuCanvas.style.inset = '0';
    cpuCanvas.style.pointerEvents = 'none';
    cpuCanvas.style.position = 'absolute';
    cpuCanvas.style.width = '100%';
    cpuCanvas.style.zIndex = '0';
    this.element.appendChild(cpuCanvas);
    this.cpuCanvas = cpuCanvas;

    if (viewportElement) {
      viewportElement.style.position =
        viewportElement.style.position || 'relative';
      viewportElement.style.zIndex = '1';
    }

    const cpuCanvasContext = cpuCanvas.getContext('2d');

    if (!cpuCanvasContext) {
      throw new Error('[PlanarViewport] Failed to initialize CPU canvas');
    }

    renderer.getActiveCamera().setParallelProjection(true);

    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'planar',
      viewport: {
        element: this.element,
        getActiveDataId: () => this.sourceDataId,
        getViewState: () => this.getViewState(),
        isCurrentDataId: (dataId) =>
          this.getCurrentBinding()?.data.id === dataId,
        getOverlayActors: () => this.getProjectedBindingActorEntries('overlay'),
      },
      renderPath: {
        renderMode: ActorRenderMode.VTK_IMAGE,
      },
      view: {},
      display: {
        requestRender: () => {
          this.requestRenderingEngineRender();
        },
        renderNow: () => {
          this.render();
        },
        activateRenderMode: (renderMode: PlanarEffectiveRenderMode) => {
          this.renderContext.renderPath.renderMode = renderMode;
          this.setRenderModeVisibility(renderMode, cpuCanvas, vtkCanvas);
        },
      },
      cpu: {
        canvas: cpuCanvas,
        composition: {
          clearedRenderPassId: -1,
          renderPassId: 0,
        },
        context: cpuCanvasContext,
      },
      vtk: {
        renderer,
        canvas: vtkCanvas,
      },
    };
    this.viewState = normalizePlanarViewState({
      ...createDefaultPlanarViewState(),
      orientation: this.resolveRequestedOrientation(),
    });
    this.setRenderModeVisibility(
      ActorRenderMode.VTK_IMAGE,
      cpuCanvas,
      vtkCanvas
    );

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    this.resize();
  }

  // ====================================================================
  // Public API -- data
  // ====================================================================

  /**
   * Adds one or more logical planar datasets to the viewport.
   *
   * @param entries - List of datasets to add, each with its own options for
   * orientation and binding role resolution.
   */
  async setDataList(
    entries: Array<{ dataId: string; options?: PlanarSetDataOptions }>
  ): Promise<void> {
    for (const [index, { dataId, options = {} }] of entries.entries()) {
      const role = options.role ?? (index === 0 ? 'source' : 'overlay');
      await this.addData(dataId, {
        ...options,
        role,
      });
    }
  }

  /**
   * Adds a single logical planar dataset.
   *
   * @param dataId - Logical dataset id to add.
   * @param options - Semantic orientation and binding options. The render path
   * is inferred from the registered dataset and viewport configuration.
   */
  async addData(
    dataId: string,
    options: PlanarSetDataOptions = {}
  ): Promise<void> {
    const role = this.resolveBindingRole(options);
    const resolvedOptions: PlanarSetDataOptions = {
      ...options,
      role,
    };
    const { data, resolvedOrientation, selectedPath } =
      await this.loadPlanarData(dataId, resolvedOptions);

    if (role === 'source') {
      this.promoteSourceDataId(dataId);
      this.applyLoadedPlanarViewState(resolvedOrientation, data, selectedPath);
    }

    await this.addLoadedData(dataId, data, {
      renderMode: selectedPath.renderMode,
      role,
    });

    this.setDefaultDataPresentation(dataId, {
      visible: true,
    });
  }

  /**
   * Replaces all mounted planar datasets with a single logical planar dataset.
   */
  async setData(
    dataId: string,
    options: PlanarSetDataOptions = {}
  ): Promise<void> {
    this.removeAllData();
    await this.addData(dataId, {
      ...options,
      role: 'source',
    });
  }

  /**
   * Removes a dataset binding and clears the active data id when the
   * removed dataset was active.
   */
  removeData(dataId: string): void {
    super.removeData(dataId);

    if (this.sourceDataId === dataId) {
      this.sourceDataId = undefined;
      this.promoteFirstAvailableBindingToSource();
    }

    if (!this.isDestroyed && this.getCurrentBinding()) {
      this.updateBindingsCameraState();
    }
  }

  // ====================================================================
  // Public API -- actors (legacy interop)
  // ====================================================================

  /**
   * Returns all actor entries, with the source actor first and overlays after.
   */
  getActors(): ActorEntry[] {
    return [
      ...this.getProjectedBindingActorEntries('source'),
      ...this.getProjectedBindingActorEntries('overlay'),
    ];
  }

  /**
   * Returns the primary actor entry for the viewport.
   */
  getDefaultActor(): ActorEntry | undefined {
    return (
      this.getProjectedBindingActorEntries('source')[0] ??
      this.getProjectedBindingActorEntries()[0]
    );
  }

  /**
   * Renders a single image object by setting it as a one-image stack.
   */
  renderImageObject(image: IImage): Promise<void> {
    viewportNextDataSetMetadataProvider.add(image.imageId, {
      image,
      imageIds: [image.imageId],
      initialImageIdIndex: 0,
      kind: 'planar',
    });

    return this.setData(image.imageId, {
      orientation: this.resolveRequestedOrientation(),
    });
  }

  /**
   * Returns the active canvas element (CPU or VTK) based on render mode.
   */
  getCanvas(): HTMLCanvasElement {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode === ActorRenderMode.CPU_IMAGE ||
      rendering?.renderMode === ActorRenderMode.CPU_VOLUME
    ) {
      return this.renderContext.cpu.canvas;
    }

    return this.renderContext.vtk.canvas;
  }

  /**
   * Adds overlay images on top of the primary render path output.
   */
  async addImages(stackInputs: IStackInput[]): Promise<void> {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode !== ActorRenderMode.VTK_IMAGE &&
      rendering?.renderMode !== ActorRenderMode.VTK_VOLUME_SLICE &&
      rendering?.renderMode !== ActorRenderMode.CPU_IMAGE
    ) {
      return;
    }

    for (const stackInput of stackInputs) {
      const image = this.resolveStackInputImage(stackInput);

      if (!image) {
        continue;
      }

      const reference = this.resolveOverlayReference(stackInput, image);
      const dataId = this.resolveOverlayDataId(stackInput, image, reference);
      viewportNextDataSetMetadataProvider.add(dataId, {
        image,
        imageData: stackInput.imageData,
        imageIds: [stackInput.imageId],
        initialImageIdIndex: 0,
        kind: 'planar',
        reference,
        useWorldCoordinateImageData:
          stackInput.useWorldCoordinateImageData === true,
      });

      await this.addData(dataId, {
        role: 'overlay',
      });

      const actorEntry = this.getActorForDataId(dataId);

      if (stackInput.callback && actorEntry) {
        stackInput.callback({
          imageActor: actorEntry.actor as never,
          imageId: stackInput.imageId,
        });
      }
    }

    this.render();
  }

  /**
   * Returns image metadata for a given image object.
   */
  getImageDataMetadata(image: IImage) {
    return getImageDataMetadata(image);
  }

  // ====================================================================
  // Public API -- queries
  // ====================================================================

  /**
   * Returns the current image ids for the active planar dataset.
   *
   * @returns The image ids exposed by the active image or volume dataset.
   */
  getImageIds(): string[] {
    const planarData = this.getPlanarData();

    if (!planarData) {
      return [];
    }

    return planarData.imageVolume?.imageIds || planarData.imageIds;
  }

  /**
   * Returns the current volume id when the active dataset is volume-backed.
   *
   * @returns The volume id for the active dataset, if one exists.
   */
  getVolumeId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    return (
      this.getPlanarReferenceContext(viewRefSpecifier)?.data.volumeId ??
      this.getPlanarData()?.volumeId
    );
  }

  getSourceDataId(): string | undefined {
    return this.sourceDataId;
  }

  /**
   * Returns the current slice index for stack-like and slice-like workflows.
   *
   * @returns The current zero-based image index.
   */
  getCurrentImageIdIndex(): number {
    return this.getActiveImageIdIndex();
  }

  /**
   * Resolves the currently referenced image id from the active camera state.
   *
   * @returns The current image id, if one can be resolved.
   */
  getCurrentImageId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarReferencedImageId({
      viewState: this.viewState,
      data: referenceContext?.data,
      frameOfReferenceUID: referenceContext?.frameOfReferenceUID,
      rendering: referenceContext?.rendering,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  /**
   * Alias for `getCurrentImageIdIndex` used by legacy stack-style callers.
   *
   * @returns The current zero-based image index.
   */
  getSliceIndex(): number {
    return this.getCurrentImageIdIndex();
  }

  // ====================================================================
  // Public API -- camera & navigation
  // ====================================================================

  protected normalizeViewState(viewState: PlanarViewState): PlanarViewState {
    return normalizePlanarViewState(viewState);
  }

  /**
   * Returns the current rotation angle in degrees.
   */
  getRotation(): number {
    return (
      this.getResolvedView()?.rotation ??
      normalizePlanarRotation(this.viewState.rotation)
    );
  }

  /**
   * Returns the current world-space anchor point when one is set.
   */
  getAnchorWorld(): Point3 | undefined {
    const anchorWorld = this.viewState.anchorWorld;

    return anchorWorld ? ([...anchorWorld] as Point3) : undefined;
  }

  /**
   * Sets or clears the world-space anchor point.
   */
  setAnchorWorld(point?: Point3): void {
    this.setViewState({
      anchorWorld: point ? ([...point] as Point3) : undefined,
    });
  }

  /**
   * Applies viewport-level options that affect the planar camera.
   */
  setOptions(options: ViewportInputOptions, immediate = false): void {
    this.options = cloneViewportOptions(options);

    if (this.options.displayArea) {
      this.setDisplayArea(
        this.options.displayArea,
        this.options.suppressEvents ?? false
      );
    }

    if (immediate) {
      this.render();
    }
  }

  /**
   * Resets viewport options to the construction defaults.
   */
  reset(immediate = false): void {
    this.options = cloneViewportOptions(this.defaultOptions);

    if (immediate) {
      this.render();
    }
  }

  /**
   * Returns the current display-area declaration, if any.
   */
  getDisplayArea(): PlanarDisplayArea | undefined {
    return cloneDisplayArea(
      this.viewState.displayArea ?? this.options.displayArea
    );
  }

  /**
   * Stores a display-area declaration on the semantic camera. The shared
   * planar camera resolver turns it into render-path-specific pan/zoom.
   */
  setDisplayArea(displayArea: PlanarDisplayArea, suppressEvents = false): void {
    const nextDisplayArea = cloneDisplayArea(displayArea);

    if (!nextDisplayArea) {
      return;
    }

    this.options = {
      ...this.options,
      displayArea: cloneDisplayArea(nextDisplayArea),
    };

    this.setViewState({
      anchorCanvas: [0.5, 0.5],
      anchorWorld: undefined,
      displayArea: nextDisplayArea,
      scale: [1, 1],
      scaleMode: nextDisplayArea.scaleMode ?? 'fit',
    });

    if (!suppressEvents && !this.suppressEvents) {
      triggerEvent(this.element, Events.DISPLAY_AREA_MODIFIED, {
        viewportId: this.id,
        displayArea: cloneDisplayArea(nextDisplayArea),
        storeAsInitialCamera: nextDisplayArea.storeAsInitialCamera,
      });
    }
  }

  /** @deprecated Legacy shim for `getZoom()`. */
  getZoom(): number {
    return (
      this.getResolvedView()?.zoom ?? getPlanarScaleZoom(this.viewState.scale)
    );
  }

  /**
   * Returns the current native two-axis Planar scale.
   */
  getScale(): Point2 {
    return (
      this.getResolvedView()?.scale ?? clonePlanarScale(this.viewState.scale)
    );
  }

  /** @deprecated Legacy shim for `setZoom(...)`. */
  setZoom(zoom: number, canvasPoint?: Point2): void {
    this.setScale(zoom, canvasPoint);
  }

  /**
   * Sets the native two-axis Planar scale. A scalar keeps legacy uniform zoom
   * behavior; a tuple intentionally changes the displayed aspect ratio.
   */
  setScale(scale: PlanarScaleInput, canvasPoint?: Point2): void {
    const resolvedView = this.getResolvedView();
    const nextScale = normalizePlanarScale(scale);

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withScale(nextScale, canvasPoint).state.viewState
      );
      return;
    }

    if (canvasPoint) {
      this.setScaleAtCanvasPoint(nextScale, canvasPoint);
      return;
    }

    this.setViewState({
      displayArea: undefined,
      scale: nextScale,
      scaleMode: 'fit',
    });
  }

  /** @deprecated Legacy shim for `getPan()`. */
  getPan(): Point2 {
    const resolvedView = this.getResolvedView();

    return resolvedView ? resolvedView.pan : [0, 0];
  }

  /** @deprecated Legacy shim for `setPan(...)`. */
  setPan(nextPan: Point2): void {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withPan(nextPan).state.viewState
      );
      return;
    }

    const currentPan = this.getPan();
    const [ax, ay] = this.viewState.anchorCanvas ?? [0.5, 0.5];
    const { height: canvasHeight, width: canvasWidth } =
      this.getCurrentCanvasDimensions();
    const deltaX = nextPan[0] - currentPan[0];
    const deltaY = nextPan[1] - currentPan[1];

    this.setViewState({
      anchorCanvas: [
        ax + deltaX / Math.max(canvasWidth, 1),
        ay + deltaY / Math.max(canvasHeight, 1),
      ],
      displayArea: undefined,
    });
  }

  /**
   * Sets the zoom scale anchored to a specific canvas point.
   */
  setScaleAtCanvasPoint(scale: PlanarScaleInput, canvasPoint: Point2): void {
    const resolvedView = this.getResolvedView();
    const nextScale = normalizePlanarScale(scale);

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withScale(nextScale, canvasPoint).state.viewState
      );
      return;
    }

    const worldPoint = this.buildFallbackCanvasToWorld(canvasPoint);
    const { height: canvasHeight, width: canvasWidth } =
      this.getCurrentCanvasDimensions();

    this.setViewState({
      anchorWorld: worldPoint,
      anchorCanvas: [
        canvasPoint[0] / Math.max(canvasWidth, 1),
        canvasPoint[1] / Math.max(canvasHeight, 1),
      ],
      displayArea: undefined,
      scale: nextScale,
      scaleMode: 'fit',
    });
  }

  /**
   * Returns the raw planar view state.
   */
  getViewState(): PlanarViewState {
    return {
      ...this.viewState,
      displayArea: cloneDisplayArea(this.viewState.displayArea),
    };
  }

  /**
   * Returns the resolved view snapshot that resolves the raw camera
   * state against the current render context and data geometry.
   */
  getResolvedView(
    args: {
      frameOfReferenceUID?: string;
      sliceIndex?: number;
    } = {}
  ) {
    return resolvePlanarViewportView({
      viewState: this.viewState,
      data: this.getPlanarData(),
      frameOfReferenceUID:
        args.frameOfReferenceUID ?? this.resolveFrameOfReferenceUID(),
      renderContext: this.renderContext,
      rendering: this.getCurrentPlanarRendering(),
      sliceIndex: args.sliceIndex,
    });
  }

  /**
   * Returns the current planar view-presentation snapshot.
   *
   * @param viewPresSel - Selector describing which presentation fields to
   * populate in the returned object.
   * @returns The selected planar view-presentation fields.
   */
  getViewPresentation(
    viewPresSel: PlanarViewPresentationSelector = {
      rotation: true,
      displayArea: true,
      zoom: true,
      scale: true,
      pan: true,
      flipHorizontal: true,
      flipVertical: true,
    }
  ): PlanarViewPresentation {
    const target: PlanarViewPresentation = {};
    const {
      rotation,
      displayArea,
      zoom,
      scale,
      pan,
      flipHorizontal,
      flipVertical,
    } = viewPresSel;
    const currentZoom = this.getZoom();
    const currentScale = this.getScale();

    if (rotation) {
      target.rotation = this.getRotation();
    }

    if (displayArea) {
      target.displayArea = this.getDisplayArea();
    }

    if (zoom) {
      target.zoom = currentZoom;
    }

    if (scale) {
      target.scale = clonePlanarScale(currentScale);
    }

    if (pan) {
      const currentPan = this.getPan();

      target.pan = [
        currentPan[0] / currentScale[0],
        currentPan[1] / currentScale[1],
      ];
    }

    if (flipHorizontal) {
      target.flipHorizontal = this.viewState.flipHorizontal ?? false;
    }

    if (flipVertical) {
      target.flipVertical = this.viewState.flipVertical ?? false;
    }

    return target;
  }

  /**
   * Applies view-presentation values such as pan, zoom, and rotation.
   *
   * @param viewPres - View-presentation values to apply to the viewport.
   */
  setViewPresentation(viewPres?: PlanarViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const {
      pan,
      rotation = this.getRotation(),
      flipHorizontal = this.viewState.flipHorizontal ?? false,
      flipVertical = this.viewState.flipVertical ?? false,
    } = viewPres;
    const hasZoom = hasOwn(viewPres, 'zoom');
    const hasScale = hasOwn(viewPres, 'scale');
    const hasDisplayArea = hasOwn(viewPres, 'displayArea');
    const nextScale = hasScale
      ? normalizePlanarScale(viewPres.scale)
      : normalizePlanarScale(viewPres.zoom ?? this.getScale());
    const nextCamera: Partial<PlanarViewState> = {
      flipHorizontal,
      flipVertical,
      rotation,
    };

    if (hasDisplayArea) {
      const displayArea = cloneDisplayArea(viewPres.displayArea);

      this.options = {
        ...this.options,
        displayArea,
      };

      nextCamera.anchorCanvas = [0.5, 0.5];
      nextCamera.anchorWorld = undefined;
      nextCamera.displayArea = displayArea;
      nextCamera.scale = hasZoom || hasScale ? nextScale : [1, 1];
      nextCamera.scaleMode = displayArea?.scaleMode ?? 'fit';
    } else if (hasZoom || hasScale || !this.viewState.displayArea) {
      nextCamera.scale = nextScale;
      nextCamera.scaleMode = 'fit';
    }

    this.setViewState(nextCamera);

    if (pan) {
      this.setPan([pan[0] * nextScale[0], pan[1] * nextScale[1]]);
    }
  }

  // ====================================================================
  // Public API -- view reference & synchronization
  // ====================================================================

  /**
   * Returns the rendering engine that owns this viewport.
   *
   * @returns The parent rendering engine, if it is still registered.
   */
  getRenderingEngine() {
    return renderingEngineCache.get(this.renderingEngineId);
  }

  /**
   * Builds a spatial reference object for cross-viewport synchronization.
   *
   * @param viewRefSpecifier - Optional fields that refine the produced
   * reference object.
   * @returns A spatial view reference for the current planar state.
   */
  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarViewReference({
      viewState: this.viewState,
      dataId: referenceContext?.dataId,
      frameOfReferenceUID:
        referenceContext?.frameOfReferenceUID ?? this.getFrameOfReferenceUID(),
      data: referenceContext?.data,
      rendering: referenceContext?.rendering,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  /**
   * Builds a stable id for the current view reference.
   *
   * @param viewRefSpecifier - Optional fields that refine the produced
   * reference id.
   * @returns A stable identifier for the current planar reference state.
   */
  getViewReferenceId(viewRefSpecifier: ViewReferenceSpecifier = {}): string {
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarViewReferenceId({
      viewState: this.viewState,
      frameOfReferenceUID: referenceContext?.frameOfReferenceUID,
      data: referenceContext?.data,
      rendering: referenceContext?.rendering,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  /**
   * Applies a view reference by activating the matching binding and
   * navigating to the referenced slice.
   */
  setViewReference(viewRef: ViewReference): void {
    if (!viewRef) {
      return;
    }

    const targetContext = this.resolveViewReferenceContext(viewRef);

    if (!targetContext) {
      return;
    }

    const didActivateBinding = this.activatePlanarReferenceContext(
      targetContext.dataId
    );
    const didApplyReference = this.applyViewReferenceToCurrentBinding(viewRef);

    if (didActivateBinding && !didApplyReference) {
      this.render();
    }
  }

  /**
   * Returns the active image-data object when the current render path exposes
   * one.
   *
   * @returns The active image-data object, if exposed by the render path.
   */
  getImageData() {
    return this.getCurrentBinding()?.getImageData?.();
  }

  // ====================================================================
  // Public API -- coordinate transforms
  // ====================================================================

  /**
   * Converts canvas-space to world-space. Uses the CPU image transform
   * when in CPU render mode, otherwise delegates to the resolved view.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering?.renderMode === ActorRenderMode.CPU_IMAGE) {
      const imageData = this.getImageData() as CPUIImageData | undefined;

      if (imageData) {
        return canvasToWorldPlanarCpuImage(
          rendering.enabledElement,
          imageData,
          canvasPos
        );
      }
    }

    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return this.buildFallbackCanvasToWorld(canvasPos);
    }

    return resolvedView.canvasToWorld(canvasPos);
  }

  /**
   * Converts world-space to canvas-space. Uses the CPU image transform
   * when in CPU render mode, otherwise delegates to the resolved view.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering?.renderMode === ActorRenderMode.CPU_IMAGE) {
      const imageData = this.getImageData() as CPUIImageData | undefined;

      if (imageData) {
        return worldToCanvasPlanarCpuImage(
          rendering.enabledElement,
          imageData,
          worldPos
        );
      }
    }

    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return this.buildFallbackWorldToCanvas(worldPos);
    }

    return resolvedView.worldToCanvas(worldPos);
  }

  /**
   * Returns the frame of reference UID from the resolved view,
   * resolving against the active binding's spatial metadata.
   */
  override getFrameOfReferenceUID(): string {
    return (
      this.getResolvedView({
        frameOfReferenceUID: this.resolveFrameOfReferenceUID(),
      })?.getFrameOfReferenceUID() ?? this.resolveFrameOfReferenceUID()
    );
  }

  /**
   * Returns whether the active dataset contains the given image id.
   *
   * @param imageId - Image id to look up in the active dataset.
   * @returns `true` when the image id is present in the active dataset.
   */
  hasImageId(imageId: string): boolean {
    return this.getImageIds().includes(imageId);
  }

  /**
   * Returns whether the active dataset contains an image with the given URI.
   *
   * @param imageURI - URI form of the image id to look up.
   * @returns `true` when a matching image URI exists in the active dataset.
   */
  hasImageURI(imageURI: string): boolean {
    return this.getImageIds().some(
      (imageId) => imageIdToURI(imageId) === imageURI
    );
  }

  /**
   * Returns whether the active dataset references the given volume id.
   *
   * @param volumeId - Volume id to compare against the active dataset.
   * @returns `true` when the active dataset references the given volume id.
   */
  hasVolumeId(volumeId: string): boolean {
    return this.getVolumeId() === volumeId;
  }

  /**
   * Returns whether the active dataset references a volume whose id contains
   * the given URI fragment.
   *
   * @param volumeURI - Volume URI substring to compare against the active
   * dataset volume id.
   * @returns `true` when the active dataset references the given volume URI.
   */
  hasVolumeURI(volumeURI: string): boolean {
    return String(this.getVolumeId() || '').includes(volumeURI);
  }

  /**
   * Returns whether a spatial plane is viewable in the current planar state.
   *
   * @param planeRestriction - Plane description to test against the current
   * viewport state.
   * @param options - Optional compatibility flags for the spatial check.
   * @returns `true` when the plane can be viewed in this viewport state.
   */
  isPlaneViewable(
    planeRestriction: PlaneRestriction,
    options?: ReferenceCompatibleOptions
  ): boolean {
    return isPlanarPlaneViewable({
      viewState: this.viewState,
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      options,
      planeRestriction,
      rendering: this.getCurrentPlanarRendering(),
      renderContext: this.renderContext,
    });
  }

  /**
   * Returns whether a view reference is spatially compatible with this
   * viewport.
   *
   * @param viewRef - View reference to test.
   * @param options - Optional compatibility flags for the spatial check.
   * @returns `true` when the reference can be viewed in this viewport state.
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    return super.isReferenceViewable(viewRef, options);
  }

  /**
   * Sets the active image index and resolves the corresponding image id.
   *
   * @param imageIdIndex - Requested zero-based image index.
   * @returns The resolved image id after clamping.
   */
  setImageIdIndex(imageIdIndex: number): Promise<string> {
    const imageIds = this.getImageIds();

    if (!imageIds.length) {
      return Promise.reject(
        new Error('[PlanarViewport] Cannot set image index on empty stack')
      );
    }

    const clampedImageIdIndex = Math.min(
      Math.max(0, imageIdIndex),
      this.getMaxImageIdIndex()
    );
    const resolvedImageId =
      imageIds[clampedImageIdIndex] || imageIds[imageIds.length - 1];
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode === ActorRenderMode.CPU_VOLUME ||
      rendering?.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
    ) {
      const sliceWorldPoint =
        this.getVolumeSliceWorldPointForImageIdIndex(clampedImageIdIndex);

      if (sliceWorldPoint) {
        this.setViewState({
          slice: {
            kind: 'volumePoint',
            sliceWorldPoint,
          },
        });
      }

      return Promise.resolve(resolvedImageId);
    }

    this.setViewState({
      slice: {
        kind: 'stackIndex',
        imageIdIndex: clampedImageIdIndex,
      },
    });

    return Promise.resolve(resolvedImageId);
  }

  /**
   * Scrolls by a signed image-index delta.
   *
   * @param delta - Signed number of images to move by.
   * @returns The resolved image id after scrolling.
   */
  scroll(delta: number): Promise<string> {
    return this.setImageIdIndex(this.getActiveImageIdIndex() + delta);
  }

  /**
   * Sets the planar orientation for volume-backed render modes.
   *
   * @param orientation - Target acquisition-aligned orientation.
   */
  setOrientation(orientation: PlanarSetOrientationInput): void {
    this.setViewState({ orientation: this.resolveSetOrientation(orientation) });
  }

  /**
   * Resets rotation and optionally resets pan and zoom.
   *
   * @param options - Flags controlling whether pan and zoom are reset.
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetCamera(options?: { resetPan?: boolean; resetZoom?: boolean }): boolean {
    const { resetPan = true, resetZoom = true } = options || {};
    this.setViewState({
      ...(resetPan
        ? {
            anchorWorld: undefined,
            anchorCanvas: [0.5, 0.5] as [number, number],
          }
        : {}),
      ...(resetZoom
        ? { scale: [1, 1] as Point2, scaleMode: 'fit' as const }
        : {}),
      rotation: 0,
    });
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * Resets camera state after a resize using the same behavior as
   * `resetCamera`.
   *
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetCameraForResize(): boolean {
    return this.resetCamera();
  }

  // ====================================================================
  // Public API -- lifecycle
  // ====================================================================

  /**
   * Returns whether this viewport bypasses the shared rendering pipeline.
   */
  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  /**
   * No-op called by the rendering engine after completing a frame.
   */
  setRendered(): void {
    // no-op
  }

  /**
   * Resizes the internal CPU canvas and notifies active render bindings.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    const { clientHeight, clientWidth } = this.element;
    const { canvas } = this.renderContext.cpu;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const targetWidth = Math.round(clientWidth * devicePixelRatio);
    const targetHeight = Math.round(clientHeight * devicePixelRatio);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    this.resizeBindingsWithActiveFirst();
  }

  /**
   * Renders the active planar bindings or queues an engine-driven render.
   */
  render(): void {
    if (this.isDestroyed) {
      return;
    }

    this.renderContext.cpu.composition.renderPassId += 1;

    if (!this.renderBindings()) {
      this.requestRenderingEngineRender();
    }
  }

  // ====================================================================
  // Protected & private
  // ====================================================================

  protected override onDestroy(): void {
    this.cpuCanvas?.remove();
    this.cpuCanvas = undefined;
    this.sourceDataId = undefined;
    this.renderContext.view.activeSourceICamera = undefined;
  }

  protected override modified(previousCamera?: ICamera): void {
    if (this.isDestroyed) {
      return;
    }

    this.updateBindingsCameraState();
    this.render();

    if (previousCamera) {
      this.triggerCameraModifiedEvent(previousCamera);
    }
  }

  protected override renderBindings(): boolean {
    if (this.isDestroyed) {
      return false;
    }

    let renderedByAdapter = false;
    const sourceBinding = this.getCurrentBinding();

    sourceBinding?.render?.();
    renderedByAdapter = renderedByAdapter || Boolean(sourceBinding?.render);

    for (const binding of this.bindings.values()) {
      if (binding === sourceBinding) {
        continue;
      }

      binding.render?.();
      renderedByAdapter = renderedByAdapter || Boolean(binding.render);
    }

    return renderedByAdapter;
  }

  private requestRenderingEngineRender(): void {
    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);

    if (renderingEngine) {
      renderingEngine.renderViewport(this.id);
    }
  }

  private setRenderModeVisibility(
    renderMode: PlanarEffectiveRenderMode,
    cpuCanvas: HTMLCanvasElement,
    vtkCanvas: HTMLCanvasElement
  ): void {
    const useCPUCanvas =
      renderMode === ActorRenderMode.CPU_IMAGE ||
      renderMode === ActorRenderMode.CPU_VOLUME;
    const viewportElement = this.element.querySelector(
      '.viewport-element'
    ) as HTMLDivElement | null;

    cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
    cpuCanvas.style.pointerEvents = useCPUCanvas ? 'auto' : 'none';
    vtkCanvas.style.display = useCPUCanvas ? 'none' : '';

    if (viewportElement) {
      viewportElement.style.pointerEvents = useCPUCanvas ? 'none' : '';
    }
  }

  protected createLegacyCompatibilityHost() {
    return {
      getElement: () => this.element,
      getViewportId: () => this.id,
      getRequestedOrientation: () => this.resolveRequestedOrientation(),
      prepareVolumeCompatibilityCamera: () => {
        this.viewState = this.normalizeViewState({
          ...this.viewState,
          orientation: this.resolveRequestedOrientation(),
        });
      },
      setData: (dataId, options) => this.setData(dataId, options),
      setDataList: (entries) => this.setDataList(entries),
      setImageIdIndex: (imageIdIndex) => this.setImageIdIndex(imageIdIndex),
      getCurrentImageId: () => this.getCurrentImageId(),
      render: () => this.render(),
      removeBindingsExcept: (keepDataIds) =>
        this.removeBindingsExcept(keepDataIds),
      setCameraOrientation: (orientation) => {
        this.setViewState({
          orientation: this.resolveSetOrientation(
            orientation as PlanarSetOrientationInput
          ),
        });
      },
      setDataPresentationState: (dataId, presentation) => {
        this.setDataPresentationState(dataId, presentation);
      },
      setDataPresentation: (dataId, presentation) => {
        this.setDataPresentation(dataId, presentation);
      },
      getDataPresentation: (dataId) => this.getDataPresentation(dataId),
      getCameraOrientation: () => this.viewState.orientation,
      getCurrentPlanarRendering: () => this.getCurrentPlanarRendering(),
      getActiveDataId: () => this.sourceDataId,
      getFirstBoundDataId: () => this.bindings.keys().next().value,
      findDataIdByVolumeId: (volumeId) => this.findDataIdByVolumeId(volumeId),
      getBindingActor: (dataId) => {
        const rendering = this.getBinding(dataId)?.rendering as
          | { actor?: unknown; compatibilityActor?: unknown }
          | undefined;

        return rendering?.actor ?? rendering?.compatibilityActor;
      },
      getDefaultVOIRange: (dataId) => {
        const rendering = this.getBinding(dataId)?.rendering as
          | { defaultVOIRange?: VOIRange }
          | undefined;

        return rendering?.defaultVOIRange;
      },
      getImageCount: () => this.getImageIds().length,
      getMaxImageIdIndex: () => this.getMaxImageIdIndex(),
    };
  }

  protected updateBindingsCameraState(): void {
    const currentBinding = this.getCurrentBinding();

    if (currentBinding) {
      currentBinding.applyViewState(this.viewState);
    } else {
      this.renderContext.view.activeSourceICamera = undefined;
    }

    this.forEachBinding((binding) => {
      if (binding !== currentBinding) {
        binding.applyViewState(this.viewState);
      }
    });
  }

  private resizeBindingsWithActiveFirst(): void {
    const currentBinding = this.getCurrentBinding();

    currentBinding?.resize?.();

    this.forEachBinding((binding) => {
      if (binding !== currentBinding) {
        binding.resize?.();
      }
    });
  }

  private getActiveImageIdIndex(): number {
    const binding = this.getCurrentBinding();
    const currentImageIdIndex = (
      binding?.rendering as { currentImageIdIndex?: number } | undefined
    )?.currentImageIdIndex;

    if (typeof currentImageIdIndex === 'number') {
      return currentImageIdIndex;
    }

    return this.viewState.slice?.kind === 'stackIndex'
      ? this.viewState.slice.imageIdIndex
      : 0;
  }

  protected getMaxImageIdIndex(): number {
    const binding = this.getCurrentBinding();
    const maxImageIdIndex = (
      binding?.rendering as { maxImageIdIndex?: number } | undefined
    )?.maxImageIdIndex;

    if (typeof maxImageIdIndex === 'number') {
      return maxImageIdIndex;
    }

    return Math.max(0, this.getImageIds().length - 1);
  }

  private getVolumeSliceWorldPointForImageIdIndex(
    imageIdIndex: number
  ): Point3 | undefined {
    const sliceBasis = this.getResolvedView({
      sliceIndex: imageIdIndex,
    })?.getSliceBasis();
    const sliceWorldPoint = sliceBasis?.sliceCenterWorld;

    return sliceWorldPoint ? ([...sliceWorldPoint] as Point3) : undefined;
  }

  private getPlanarData(): LoadedData<PlanarPayload> | undefined {
    return this.getCurrentPlanarData();
  }

  protected getCurrentBinding() {
    if (this.sourceDataId) {
      return this.getBinding(this.sourceDataId) ?? this.getFirstBinding();
    }

    return this.getFirstBinding();
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const dataSet = getViewportNextImageDataSet(dataId);

    if (!isPlanarRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
  }

  private async loadPlanarData(
    dataId: string,
    options: PlanarSetDataOptions
  ): Promise<{
    data: LoadedData<PlanarPayload>;
    selectedPath: SelectedPlanarRenderPath;
    resolvedOrientation: PlanarViewState['orientation'];
  }> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewport] No registered planar dataset metadata for ${dataId}`
      );
    }

    const resolvedOrientation = this.resolveRequestedOrientation(
      options.orientation
    );
    const selectedPath = selectPlanarRenderPath(dataSet, {
      orientation: resolvedOrientation,
      cpuThresholds: options.cpuThresholds,
    });
    const data = await (this.dataProvider as PlanarDataProvider).load(dataId, {
      acquisitionOrientation: selectedPath.acquisitionOrientation,
      orientation: resolvedOrientation,
      renderMode: selectedPath.renderMode,
      volumeId: selectedPath.volumeId,
    });

    return {
      data,
      selectedPath,
      resolvedOrientation,
    };
  }

  private applyLoadedPlanarViewState(
    resolvedOrientation: PlanarViewState['orientation'],
    planarData: PlanarPayload,
    selectedPath: SelectedPlanarRenderPath
  ): void {
    const isVolumePath =
      selectedPath.renderMode === ActorRenderMode.CPU_VOLUME ||
      selectedPath.renderMode === ActorRenderMode.VTK_VOLUME_SLICE;
    const orientation = normalizePlanarOrientation(
      resolvedOrientation,
      selectedPath.acquisitionOrientation
    );
    const slice = isVolumePath
      ? this.createInitialVolumeSliceState(
          planarData,
          selectedPath.renderMode,
          orientation
        )
      : {
          kind: 'stackIndex' as const,
          imageIdIndex: planarData.initialImageIdIndex,
        };

    this.viewState = this.normalizeViewState({
      ...this.viewState,
      slice,
      orientation,
    });
  }

  private createInitialVolumeSliceState(
    planarData: PlanarPayload,
    renderMode: PlanarEffectiveRenderMode,
    orientation: PlanarViewState['orientation']
  ): PlanarViewState['slice'] {
    if (!planarData.imageVolume) {
      return;
    }

    const { height, width } = this.getCurrentCanvasDimensions();
    const createSliceBasis =
      renderMode === ActorRenderMode.CPU_VOLUME
        ? createPlanarCpuVolumeSliceBasis
        : createPlanarVolumeSliceBasis;
    const initialImageIdIndex =
      orientation === OrientationAxis.ACQUISITION
        ? planarData.initialImageIdIndex
        : undefined;
    const { sliceBasis } = createSliceBasis({
      canvasHeight: height,
      canvasWidth: width,
      imageIdIndex: initialImageIdIndex,
      imageVolume: planarData.imageVolume,
      orientation,
    });

    return {
      kind: 'volumePoint',
      sliceWorldPoint: [...sliceBasis.sliceCenterWorld] as Point3,
    };
  }

  private resolveRequestedOrientation(
    orientation?: PlanarSetDataOptions['orientation']
  ): PlanarViewState['orientation'] {
    return (
      clonePlanarOrientation(
        (orientation ??
          (this.defaultOptions
            .orientation as PlanarViewState['orientation'])) ||
          OrientationAxis.ACQUISITION
      ) || OrientationAxis.ACQUISITION
    );
  }

  private resolveSetOrientation(
    orientation: PlanarSetOrientationInput
  ): PlanarViewState['orientation'] {
    if (typeof orientation !== 'string') {
      return clonePlanarOrientation(orientation) || OrientationAxis.ACQUISITION;
    }

    if (!isReformatOrientation(orientation)) {
      return orientation as PlanarViewState['orientation'];
    }

    const baseOrientation = getBaseReformatOrientation(orientation);
    const cameraVectors = getCameraVectors(
      {
        getActors: () => this.getActors(),
        getCamera: () => this.getCameraForEvent(),
        getCurrentImageId: () => this.getCurrentImageId(),
        getImageIds: () => this.getImageIds(),
        type: ViewportType.ORTHOGRAPHIC,
      } as unknown as IBaseVolumeViewport,
      {
        useViewportNormal: true,
        ...(baseOrientation ? { orientation: baseOrientation } : {}),
      }
    );

    if (cameraVectors) {
      return {
        viewPlaneNormal: cameraVectors.viewPlaneNormal,
        viewUp: cameraVectors.viewUp,
      };
    }

    return baseOrientation || this.viewState.orientation;
  }

  protected removeBindingsExcept(keepDataIds: Set<string>): void {
    for (const dataId of Array.from(this.bindings.keys())) {
      if (!keepDataIds.has(dataId)) {
        this.removeData(dataId);
      }
    }
  }

  private resolveBindingRole(options: PlanarSetDataOptions): BindingRole {
    return options.role === 'source' ? 'source' : 'overlay';
  }

  private promoteSourceDataId(dataId: string): void {
    for (const [bindingDataId, binding] of this.bindings.entries()) {
      binding.role = bindingDataId === dataId ? 'source' : 'overlay';
    }

    this.sourceDataId = dataId;
  }

  private promoteFirstAvailableBindingToSource(): void {
    const firstBindingDataId = this.bindings.keys().next().value;

    if (firstBindingDataId) {
      this.promoteSourceDataId(firstBindingDataId);
    }
  }

  private resolveStackInputImage(stackInput: IStackInput): IImage | undefined {
    const cachedImage = cache.getImage(stackInput.imageId);

    if (cachedImage) {
      return cachedImage;
    }

    if (!stackInput.imageData) {
      return;
    }

    return createPlanarImageFromVTKImageData(
      stackInput.imageId,
      stackInput.imageData as PlanarStackInputImageData
    );
  }

  private resolveOverlayReference(
    stackInput: IStackInput,
    image: IImage
  ): ViewportDataReference {
    const reference = stackInput.reference as ViewportDataReference | undefined;

    if (reference && typeof reference.kind === 'string') {
      return reference;
    }

    return {
      kind: 'image',
      imageId: image.imageId,
    };
  }

  private resolveOverlayDataId(
    stackInput: IStackInput,
    image: IImage,
    reference: ViewportDataReference
  ): string {
    const explicitDataId = stackInput.dataId;

    if (typeof explicitDataId === 'string') {
      return explicitDataId;
    }

    if (
      reference.kind === 'segmentation' &&
      typeof reference.representationUID === 'string'
    ) {
      return reference.representationUID;
    }

    const baseDataId = image.imageId;

    if (!this.getBinding(baseDataId)) {
      return baseDataId;
    }

    return `overlay:${baseDataId}`;
  }

  private getActorForDataId(dataId: string): ActorEntry | undefined {
    const binding = this.getBinding(dataId);

    return binding?.getActorEntry?.(binding.data);
  }

  private getProjectedBindingActorEntries(role?: BindingRole): ActorEntry[] {
    const actorEntries: ActorEntry[] = [];

    for (const binding of this.bindings.values()) {
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

  protected findBindingDataIdByActorEntryUID(
    actorEntryUID: string
  ): string | undefined {
    for (const [dataId, binding] of this.bindings.entries()) {
      const actorEntry = binding.getActorEntry?.(binding.data);

      if (actorEntry?.uid === actorEntryUID) {
        return dataId;
      }
    }
  }

  protected findDataIdByVolumeId(volumeId: string): string | undefined {
    for (const [dataId, binding] of this.bindings.entries()) {
      const bindingVolumeId = (
        binding.data as LoadedData<PlanarPayload> | undefined
      )?.volumeId;

      if (bindingVolumeId === volumeId) {
        return dataId;
      }
    }
  }

  protected getCurrentPlanarRendering(): PlanarRendering | undefined {
    return this.getCurrentBinding()?.rendering as PlanarRendering | undefined;
  }

  private resolveFrameOfReferenceUID(): string {
    const binding = this.getCurrentBinding();

    return (
      binding?.getFrameOfReferenceUID() ?? `${this.type}-viewport-${this.id}`
    );
  }

  private buildFallbackCanvasToWorld(canvasPos: Point2): Point3 {
    const anchorCanvas = this.viewState.anchorCanvas ?? [0.5, 0.5];
    const anchorWorld = this.viewState.anchorWorld ?? [0, 0, 0];
    const { height, width } = this.getCurrentCanvasDimensions();
    const [scaleX, scaleY] = normalizePlanarScale(this.viewState.scale);

    return [
      anchorWorld[0] + (canvasPos[0] - anchorCanvas[0] * width) / scaleX,
      anchorWorld[1] + (canvasPos[1] - anchorCanvas[1] * height) / scaleY,
      anchorWorld[2],
    ];
  }

  private buildFallbackWorldToCanvas(worldPos: Point3): Point2 {
    const anchorCanvas = this.viewState.anchorCanvas ?? [0.5, 0.5];
    const anchorWorld = this.viewState.anchorWorld ?? [0, 0, 0];
    const { height, width } = this.getCurrentCanvasDimensions();
    const [scaleX, scaleY] = normalizePlanarScale(this.viewState.scale);

    return [
      (worldPos[0] - anchorWorld[0]) * scaleX + anchorCanvas[0] * width,
      (worldPos[1] - anchorWorld[1]) * scaleY + anchorCanvas[1] * height,
    ];
  }

  private applyResolvedViewState(nextCamera: PlanarViewState): void {
    const previousCamera = this.getCameraForEvent();

    this.viewState = this.normalizeViewState(nextCamera);
    this.modified(previousCamera);
  }

  protected getCameraForEvent(): ICamera {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      return resolvedView.toICamera() as unknown as ICamera;
    }

    return {
      parallelProjection: true,
      focalPoint: [0, 0, 0],
      position: [0, 0, 1],
      parallelScale: 1,
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
      presentationScale: [1, 1],
      scale: [1, 1],
    } as unknown as ICamera;
  }

  private getCurrentPresentation(): DerivedPlanarPresentation | undefined {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    return {
      flipHorizontal: resolvedView.state.viewState.flipHorizontal === true,
      flipVertical: resolvedView.state.viewState.flipVertical === true,
      pan: resolvedView.pan,
      rotation: resolvedView.rotation,
      scale: resolvedView.scale,
      zoom: resolvedView.zoom,
    };
  }

  private getCurrentCanvasDimensions(): { width: number; height: number } {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering) {
      const { canvasHeight, canvasWidth } = getPlanarViewStateCanvasDimensions({
        renderContext: this.renderContext,
        rendering,
      });

      return {
        width: canvasWidth || this.element.clientWidth,
        height: canvasHeight || this.element.clientHeight,
      };
    }

    return {
      width: this.element.clientWidth,
      height: this.element.clientHeight,
    };
  }

  private getCurrentPlanarData(): LoadedData<PlanarPayload> | undefined {
    return this.getCurrentBinding()?.data as
      | LoadedData<PlanarPayload>
      | undefined;
  }

  private getCurrentPlanarReferenceContext():
    | PlanarReferenceContext
    | undefined {
    if (this.sourceDataId) {
      const activeContext = this.getPlanarReferenceContextByDataId(
        this.sourceDataId
      );

      if (activeContext) {
        return activeContext;
      }
    }

    for (const [dataId] of this.bindings.entries()) {
      return this.getPlanarReferenceContextByDataId(dataId);
    }
  }

  private getPlanarReferenceContext(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): PlanarReferenceContext | undefined {
    if (viewRefSpecifier.volumeId) {
      return (
        this.findPlanarReferenceContextByVolumeId(viewRefSpecifier.volumeId) ??
        this.getCurrentPlanarReferenceContext()
      );
    }

    return this.getCurrentPlanarReferenceContext();
  }

  private getPlanarReferenceContextByDataId(
    dataId: string
  ): PlanarReferenceContext | undefined {
    const binding = this.getBinding(dataId);

    if (!binding) {
      return;
    }

    return {
      dataId,
      data: binding.data as LoadedData<PlanarPayload>,
      frameOfReferenceUID:
        binding.getFrameOfReferenceUID() ?? `${this.type}-viewport-${this.id}`,
      rendering: binding.rendering as PlanarRendering,
    };
  }

  private getAllPlanarReferenceContexts(): PlanarReferenceContext[] {
    const contexts: PlanarReferenceContext[] = [];

    for (const [dataId] of this.bindings.entries()) {
      const referenceContext = this.getPlanarReferenceContextByDataId(dataId);

      if (referenceContext) {
        contexts.push(referenceContext);
      }
    }

    return contexts;
  }

  protected getReferenceViewContexts(): ViewportNextReferenceContext[] {
    const referenceContexts = this.getAllPlanarReferenceContexts();

    if (!referenceContexts.length) {
      return super.getReferenceViewContexts();
    }

    return referenceContexts.map((referenceContext) =>
      this.getViewportNextReferenceContext(referenceContext)
    );
  }

  private getViewportNextReferenceContext(
    referenceContext: PlanarReferenceContext
  ): ViewportNextReferenceContext {
    const resolvedView = resolvePlanarViewportView({
      viewState: this.viewState,
      data: referenceContext.data,
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      rendering: referenceContext.rendering,
      renderContext: this.renderContext,
    })?.toICamera();
    const volumeId = referenceContext.data.volumeId;

    return {
      dataId: referenceContext.dataId,
      dataIds: [referenceContext.data.id],
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      imageIds: this.getImageIdsForReferenceContext(referenceContext),
      currentImageIdIndex: referenceContext.rendering.currentImageIdIndex,
      volumeId,
      volumeIds: volumeId ? [volumeId] : undefined,
      cameraFocalPoint: resolvedView?.focalPoint,
      viewPlaneNormal: resolvedView?.viewPlaneNormal,
      ...getDimensionGroupReferenceContext(referenceContext.data.imageVolume),
    };
  }

  private findPlanarReferenceContextByVolumeId(
    volumeId: string
  ): PlanarReferenceContext | undefined {
    for (const [dataId, binding] of this.bindings.entries()) {
      const bindingData = binding.data as LoadedData<PlanarPayload>;

      if (bindingData.volumeId === volumeId) {
        return this.getPlanarReferenceContextByDataId(dataId);
      }
    }
  }

  private findPlanarReferenceContextByImageReference(
    referencedImageId?: string,
    referencedImageURI?: string
  ): PlanarReferenceContext | undefined {
    const targetImageURI =
      referencedImageURI ||
      (referencedImageId ? imageIdToURI(referencedImageId) : undefined);

    if (!targetImageURI) {
      return;
    }

    for (const referenceContext of this.getAllPlanarReferenceContexts()) {
      if (
        this.getImageIdsForReferenceContext(referenceContext).some(
          (imageId) => imageIdToURI(imageId) === targetImageURI
        )
      ) {
        return referenceContext;
      }
    }
  }

  private resolveViewReferenceContext(
    viewRef: ViewReference
  ): PlanarReferenceContext | undefined {
    if (viewRef.dataId) {
      const dataContext = this.getPlanarReferenceContextByDataId(
        viewRef.dataId
      );

      if (dataContext) {
        return dataContext;
      }
    }

    if (viewRef.volumeId) {
      const volumeContext = this.findPlanarReferenceContextByVolumeId(
        viewRef.volumeId
      );

      if (volumeContext) {
        return volumeContext;
      }
    }

    const imageContext = this.findPlanarReferenceContextByImageReference(
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (imageContext) {
      return imageContext;
    }

    const currentReferenceContext = this.getCurrentPlanarReferenceContext();

    if (
      viewRef.FrameOfReferenceUID &&
      currentReferenceContext?.frameOfReferenceUID !==
        viewRef.FrameOfReferenceUID
    ) {
      return;
    }

    return currentReferenceContext;
  }

  private activatePlanarReferenceContext(dataId: string): boolean {
    if (this.sourceDataId === dataId) {
      return false;
    }

    this.promoteSourceDataId(dataId);
    this.updateBindingsCameraState();

    return true;
  }

  private applyViewReferenceToCurrentBinding(viewRef: ViewReference): boolean {
    const referenceContext = this.getCurrentPlanarReferenceContext();

    if (
      !referenceContext ||
      (viewRef.FrameOfReferenceUID &&
        referenceContext.frameOfReferenceUID !== viewRef.FrameOfReferenceUID)
    ) {
      return false;
    }

    const { rendering } = referenceContext;

    if (
      rendering.renderMode === ActorRenderMode.CPU_IMAGE ||
      rendering.renderMode === ActorRenderMode.VTK_IMAGE
    ) {
      return this.applyImageViewReference(referenceContext, viewRef);
    }

    return this.applyVolumeViewReference(referenceContext, viewRef);
  }

  private applyImageViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): boolean {
    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const referencedImageIndex = this.findImageIdIndexByReference(
      imageIds,
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof referencedImageIndex === 'number') {
      this.setImageIdIndex(referencedImageIndex);
      return true;
    }

    if (typeof viewRef.sliceIndex === 'number') {
      this.setImageIdIndex(viewRef.sliceIndex);
      return true;
    }

    return false;
  }

  private applyVolumeViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): boolean {
    const normalizedViewRef = this.normalizeVolumeViewReference(
      referenceContext,
      viewRef
    );
    const resolvedView = this.getResolvedView({
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
    })?.toICamera();

    if (!resolvedView?.viewPlaneNormal) {
      return false;
    }

    const currentViewPlaneNormal = resolvedView.viewPlaneNormal;
    const refViewPlaneNormal = normalizedViewRef.viewPlaneNormal;
    const shouldReorient =
      refViewPlaneNormal &&
      !this.areNormalsEqual(currentViewPlaneNormal, refViewPlaneNormal) &&
      !this.areNormalsOpposite(currentViewPlaneNormal, refViewPlaneNormal);
    const effectiveViewPlaneNormal =
      refViewPlaneNormal ?? currentViewPlaneNormal;
    const isOppositeNormal =
      !shouldReorient &&
      this.areNormalsOpposite(currentViewPlaneNormal, effectiveViewPlaneNormal);
    const nextImageIdIndex = this.resolveVolumeReferenceImageIdIndex(
      referenceContext,
      normalizedViewRef,
      effectiveViewPlaneNormal,
      isOppositeNormal
    );
    const viewStatePatch: Partial<PlanarViewState> = {};

    if (shouldReorient && refViewPlaneNormal) {
      viewStatePatch.orientation = {
        viewPlaneNormal: [...refViewPlaneNormal] as Point3,
        ...(normalizedViewRef.viewUp
          ? {
              viewUp: [...normalizedViewRef.viewUp] as Point3,
            }
          : {}),
      };
    }

    const sliceWorldPoint =
      normalizedViewRef.cameraFocalPoint ??
      (typeof nextImageIdIndex === 'number'
        ? this.getVolumeSliceWorldPointForImageIdIndex(nextImageIdIndex)
        : undefined);

    if (sliceWorldPoint) {
      viewStatePatch.slice = {
        kind: 'volumePoint',
        sliceWorldPoint: [...sliceWorldPoint] as Point3,
      };
    }

    if (!Object.keys(viewStatePatch).length) {
      return false;
    }

    this.setViewState(viewStatePatch);

    return true;
  }

  private normalizeVolumeViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): ViewReference {
    if (!viewRef.planeRestriction || viewRef.viewPlaneNormal) {
      return viewRef;
    }

    const orientation = this.deriveOrientationFromPlaneRestriction(
      referenceContext,
      viewRef.planeRestriction
    );

    return {
      ...viewRef,
      cameraFocalPoint:
        viewRef.cameraFocalPoint ?? viewRef.planeRestriction.point,
      ...orientation,
    };
  }

  private deriveOrientationFromPlaneRestriction(
    referenceContext: PlanarReferenceContext,
    planeRestriction: PlaneRestriction
  ): Pick<ViewReference, 'viewPlaneNormal' | 'viewUp'> {
    const resolvedView = this.getResolvedView({
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
    })?.toICamera();
    const currentViewPlaneNormal = resolvedView?.viewPlaneNormal;
    const currentViewUp = resolvedView?.viewUp;
    const { inPlaneVector1, inPlaneVector2 } = planeRestriction;
    const result: Pick<ViewReference, 'viewPlaneNormal' | 'viewUp'> = {};

    if (
      currentViewPlaneNormal &&
      this.isPlaneRestrictionCompatibleWithNormal(
        planeRestriction,
        currentViewPlaneNormal
      )
    ) {
      result.viewPlaneNormal = [...currentViewPlaneNormal] as Point3;
      if (inPlaneVector1) {
        result.viewUp = [...inPlaneVector1] as Point3;
      } else if (currentViewUp) {
        result.viewUp = [...currentViewUp] as Point3;
      }

      return result;
    }

    let derivedViewPlaneNormal: Point3 | undefined;

    if (inPlaneVector1 && inPlaneVector2) {
      const cross = vec3.cross(
        vec3.create(),
        inPlaneVector2 as unknown as vec3,
        inPlaneVector1 as unknown as vec3
      );

      if (vec3.length(cross) > 0) {
        vec3.normalize(cross, cross);
        derivedViewPlaneNormal = [...cross] as Point3;
      }
    } else if (inPlaneVector1 && currentViewPlaneNormal) {
      const cross = vec3.cross(
        vec3.create(),
        currentViewPlaneNormal as unknown as vec3,
        inPlaneVector1 as unknown as vec3
      );

      if (vec3.length(cross) > 0) {
        vec3.normalize(cross, cross);
        derivedViewPlaneNormal = [...cross] as Point3;
      }
    }

    if (derivedViewPlaneNormal) {
      result.viewPlaneNormal = derivedViewPlaneNormal;
    }

    if (inPlaneVector1) {
      result.viewUp = [...inPlaneVector1] as Point3;
    } else if (currentViewUp) {
      result.viewUp = [...currentViewUp] as Point3;
    }

    return result;
  }

  private isPlaneRestrictionCompatibleWithNormal(
    planeRestriction: PlaneRestriction,
    viewPlaneNormal: Point3
  ): boolean {
    return (
      (!planeRestriction.inPlaneVector1 ||
        isEqual(
          0,
          vec3.dot(
            viewPlaneNormal as unknown as vec3,
            planeRestriction.inPlaneVector1 as unknown as vec3
          )
        )) &&
      (!planeRestriction.inPlaneVector2 ||
        isEqual(
          0,
          vec3.dot(
            viewPlaneNormal as unknown as vec3,
            planeRestriction.inPlaneVector2 as unknown as vec3
          )
        ))
    );
  }

  private resolveVolumeReferenceImageIdIndex(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference,
    effectiveViewPlaneNormal: Point3,
    isOppositeNormal: boolean
  ): number | undefined {
    const { rendering } = referenceContext;

    if (
      rendering.renderMode !== ActorRenderMode.CPU_VOLUME &&
      rendering.renderMode !== ActorRenderMode.VTK_VOLUME_SLICE
    ) {
      return;
    }

    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const maxImageIdIndex = rendering.maxImageIdIndex;

    if (
      typeof viewRef.sliceIndex === 'number' &&
      viewRef.volumeId === referenceContext.data.volumeId &&
      viewRef.viewPlaneNormal
    ) {
      const targetSliceIndex = isOppositeNormal
        ? maxImageIdIndex - viewRef.sliceIndex
        : viewRef.sliceIndex;

      return Math.min(Math.max(0, targetSliceIndex), maxImageIdIndex);
    }

    const referencedImageIndex = this.findImageIdIndexByReference(
      imageIds,
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof referencedImageIndex === 'number') {
      return referencedImageIndex;
    }

    const targetPoint =
      viewRef.cameraFocalPoint ?? viewRef.planeRestriction?.point;

    if (targetPoint) {
      const referencedImageId = getClosestImageId(
        rendering.imageVolume,
        targetPoint,
        effectiveViewPlaneNormal
      );

      return this.findImageIdIndexByReference(imageIds, referencedImageId);
    }

    if (typeof viewRef.sliceIndex === 'number') {
      return Math.min(Math.max(0, viewRef.sliceIndex), maxImageIdIndex);
    }
  }

  private getImageIdsForReferenceContext(
    referenceContext: PlanarReferenceContext
  ): string[] {
    return (
      referenceContext.data.imageVolume?.imageIds ||
      referenceContext.data.imageIds
    );
  }

  private findImageIdIndexByReference(
    imageIds: string[],
    referencedImageId?: string,
    referencedImageURI?: string
  ): number | undefined {
    const targetImageURI =
      referencedImageURI ||
      (referencedImageId ? imageIdToURI(referencedImageId) : undefined);

    if (!targetImageURI) {
      return;
    }

    const foundImageIdIndex = imageIds.findIndex(
      (imageId) => imageIdToURI(imageId) === targetImageURI
    );

    return foundImageIdIndex >= 0 ? foundImageIdIndex : undefined;
  }

  private areNormalsEqual(
    currentViewPlaneNormal?: Point3,
    targetViewPlaneNormal?: Point3
  ): boolean {
    return Boolean(
      currentViewPlaneNormal &&
        targetViewPlaneNormal &&
        isEqual(currentViewPlaneNormal, targetViewPlaneNormal)
    );
  }

  private areNormalsOpposite(
    currentViewPlaneNormal?: Point3,
    targetViewPlaneNormal?: Point3
  ): boolean {
    if (!currentViewPlaneNormal || !targetViewPlaneNormal) {
      return false;
    }

    return isEqual(
      vec3.negate(
        vec3.create(),
        currentViewPlaneNormal as unknown as vec3
      ) as unknown as Point3,
      targetViewPlaneNormal
    );
  }
}

type PlanarStackInputImageData = {
  getDimensions: () => ArrayLike<number>;
  getSpacing: () => ArrayLike<number>;
  getPointData: () => {
    getScalars: () => {
      getData: () => ArrayLike<number>;
      getNumberOfComponents?: () => number;
    };
  };
};

function cloneViewportOptions(
  options: PlanarViewportInputOptions = {}
): PlanarViewportInputOptions {
  return deepClone(options);
}

function getBaseReformatOrientation(
  orientation: PlanarSetOrientationInput
):
  | OrientationAxis.AXIAL
  | OrientationAxis.CORONAL
  | OrientationAxis.SAGITTAL
  | undefined {
  switch (orientation) {
    case OrientationAxis.AXIAL_REFORMAT:
      return OrientationAxis.AXIAL;
    case OrientationAxis.CORONAL_REFORMAT:
      return OrientationAxis.CORONAL;
    case OrientationAxis.SAGITTAL_REFORMAT:
      return OrientationAxis.SAGITTAL;
    default:
      return;
  }
}

function isReformatOrientation(
  orientation: PlanarSetOrientationInput
): boolean {
  return (
    orientation === OrientationAxis.REFORMAT ||
    orientation === OrientationAxis.AXIAL_REFORMAT ||
    orientation === OrientationAxis.CORONAL_REFORMAT ||
    orientation === OrientationAxis.SAGITTAL_REFORMAT
  );
}

function createPlanarImageFromVTKImageData(
  imageId: string,
  imageData: PlanarStackInputImageData
): IImage {
  const dimensions = imageData.getDimensions();
  const spacing = imageData.getSpacing();
  const columns = dimensions[0] ?? 1;
  const rows = dimensions[1] ?? 1;
  const columnPixelSpacing = spacing[0] ?? 1;
  const rowPixelSpacing = spacing[1] ?? 1;
  const scalars = imageData.getPointData().getScalars();
  const scalarData = scalars.getData() as ReturnType<IImage['getPixelData']>;
  const scalarRange = scalarData.length
    ? getMinMax(scalarData)
    : { min: 0, max: 1 };
  const { min, max } =
    Number.isFinite(scalarRange.min) && Number.isFinite(scalarRange.max)
      ? scalarRange
      : { min: 0, max: 1 };
  const windowWidth = Math.max(max - min, 1);
  const dataType = scalarData.constructor?.name || 'Uint8Array';

  return {
    imageId,
    minPixelValue: min,
    maxPixelValue: max,
    slope: 1,
    intercept: 0,
    windowCenter: min + windowWidth / 2,
    windowWidth,
    voiLUTFunction: VOILUTFunctionType.LINEAR,
    getPixelData: () => scalarData,
    getCanvas: () => {
      const canvas = document.createElement('canvas');

      canvas.width = columns;
      canvas.height = rows;

      return canvas;
    },
    rows,
    columns,
    height: rows,
    width: columns,
    color: false,
    rgba: false,
    numberOfComponents: scalars.getNumberOfComponents?.() ?? 1,
    columnPixelSpacing,
    rowPixelSpacing,
    invert: false,
    photometricInterpretation: 'MONOCHROME2',
    sizeInBytes:
      (scalarData as { byteLength?: number }).byteLength ??
      scalarData.length * 4,
    dataType: dataType as IImage['dataType'],
  };
}

function isPlanarRegisteredDataSet(
  value: unknown
): value is PlanarRegisteredDataSet {
  if (!isViewportNextImageDataSet(value) || value.imageIds.length === 0) {
    return false;
  }

  return (
    (value.initialImageIdIndex === undefined ||
      typeof value.initialImageIdIndex === 'number') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string')
  );
}

export default PlanarViewport;
