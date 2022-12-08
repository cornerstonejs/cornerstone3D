import Events from '../enums/Events';
import renderingEngineCache from './renderingEngineCache';
import eventTarget from '../eventTarget';
import { triggerEvent, uuidv4 } from '../utilities';
import { vtkOffscreenMultiRenderWindow } from './vtkClasses';
import ViewportType from '../enums/ViewportType';
import VolumeViewport from './VolumeViewport';
import BaseVolumeViewport from './BaseVolumeViewport';
import StackViewport from './StackViewport';
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline';
import getOrCreateCanvas from './helpers/getOrCreateCanvas';
import { getShouldUseCPURendering, isCornerstoneInitialized } from '../init';
import type IStackViewport from '../types/IStackViewport';
import type IRenderingEngine from '../types/IRenderingEngine';
import type IVolumeViewport from '../types/IVolumeViewport';
import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
} from '../types/IViewport';
import { OrientationAxis } from '../enums';
import VolumeViewport3D from './VolumeViewport3D';

type ViewportDisplayCoords = {
  sxStartDisplayCoords: number;
  syStartDisplayCoords: number;
  sxEndDisplayCoords: number;
  syEndDisplayCoords: number;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
};

/**
 * A RenderingEngine takes care of the full pipeline of creating viewports and rendering
 * them on a large offscreen canvas and transmitting this data back to the screen. This allows us
 * to leverage the power of vtk.js whilst only using one WebGL context for the processing, and allowing
 * us to share texture memory across on-screen viewports that show the same data.
 *
 * Instantiating a rendering engine:
 * ```js
 * const renderingEngine = new RenderingEngine('pet-ct-rendering-engine');
 * ```
 *
 * There are various ways you can trigger a render on viewports. The simplest is to call `render()`
 * on the rendering engine; however, it will trigger a render on all viewports. A more efficient
 * way to do this is to call `renderViewports([viewportId])` on the rendering engine to
 * trigger a render on a specific viewport(s). Each viewport also has a `.render` method which can be used to trigger a render on that
 * viewport.
 *
 * Rendering engine uses `detect-gpu` external library to detect if GPU is available and
 * it has minimum requirement to be able to render a volume with vtk.js. If GPU is not available
 * RenderingEngine will throw an error if you try to render a volume; however, for StackViewports
 * it is capable of falling back to CPU rendering for Stack images.
 *
 * By default RenderingEngine will use vtk.js enabled pipeline for rendering viewports,
 * however, if a custom rendering pipeline is specified by a custom viewport, it will be used instead.
 * We use this custom pipeline to render a StackViewport on CPU using Cornerstone-legacy cpu rendering pipeline.
 *
 * @public
 */
class RenderingEngine implements IRenderingEngine {
  /** Unique identifier for renderingEngine */
  readonly id: string;
  /** A flag which tells if the renderingEngine has been destroyed */
  public hasBeenDestroyed: boolean;
  public offscreenMultiRenderWindow: any;
  readonly offScreenCanvasContainer: any; // WebGL
  private _viewports: Map<string, IStackViewport | IVolumeViewport>;
  private _needsRender: Set<string> = new Set();
  private _animationFrameSet = false;
  private _animationFrameHandle: number | null = null;
  private useCPURendering: boolean;

  /**
   * @param uid - Unique identifier for RenderingEngine
   */
  constructor(id?: string) {
    this.id = id ? id : uuidv4();
    this.useCPURendering = getShouldUseCPURendering();

    renderingEngineCache.set(this);

    if (!isCornerstoneInitialized()) {
      throw new Error(
        '@cornerstonejs/core is not initialized, run init() first'
      );
    }

    if (!this.useCPURendering) {
      this.offscreenMultiRenderWindow =
        vtkOffscreenMultiRenderWindow.newInstance();
      this.offScreenCanvasContainer = document.createElement('div');
      this.offscreenMultiRenderWindow.setContainer(
        this.offScreenCanvasContainer
      );
    }

    this._viewports = new Map();
    this.hasBeenDestroyed = false;
  }

  /**
   * Enables the requested viewport and add it to the viewports. It will
   * properly create the Stack viewport or Volume viewport:
   *
   * 1) Checks if the viewport is defined already, if yes, remove it first
   * 2) Checks if the viewport is using a custom rendering pipeline, if no,
   * it calculates a new offscreen canvas with the new requested viewport
   * 3) Adds the viewport
   *
   *
   * ```typescript
   * renderingEngine.enableElement({
   *  viewportId: viewportId,
   *  type: ViewportType.ORTHOGRAPHIC,
   *  element,
   *  defaultOptions: {
   *    orientation: Enums.OrientationAxis.AXIAL,
   *    background: [1, 0, 1],
   *  },
   * })
   * ```
   *
   * @fires Events.ELEMENT_ENABLED
   *
   * @param viewportInputEntry - viewport specifications
   */
  public enableElement(viewportInputEntry: PublicViewportInput): void {
    const viewportInput = this._normalizeViewportInputEntry(viewportInputEntry);

    this._throwIfDestroyed();
    const { element, viewportId } = viewportInput;

    // Throw error if no canvas
    if (!element) {
      throw new Error('No element provided');
    }

    // 1. Get the viewport from the list of available viewports.
    const viewport = this.getViewport(viewportId);

    // 1.a) If there is a found viewport, we remove the viewport and create a new viewport
    if (viewport) {
      this.disableElement(viewportId);
      // todo: if only removing the viewport, make sure resize also happens
      // this._removeViewport(viewportId)
    }

    // 2.a) See if viewport uses a custom rendering pipeline.
    const { type } = viewportInput;

    const viewportUsesCustomRenderingPipeline =
      viewportTypeUsesCustomRenderingPipeline(type);

    // 2.b) Retrieving the list of viewports for calculation of the new size for
    // offScreen canvas.

    // If the viewport being added uses a custom pipeline, or we aren't using
    // GPU rendering, we don't need to resize the offscreen canvas.
    if (!this.useCPURendering && !viewportUsesCustomRenderingPipeline) {
      this.enableVTKjsDrivenViewport(viewportInput);
    } else {
      // 3 Add the requested viewport to rendering Engine
      this.addCustomViewport(viewportInput);
    }

    // 5. Set the background color for the canvas
    const canvas = getOrCreateCanvas(element);
    const { background } = viewportInput.defaultOptions;
    this.fillCanvasWithBackgroundColor(canvas, background);
  }

  /**
   * Disables the requested viewportId from the rendering engine:
   *
   * 1) It removes the viewport from the the list of viewports
   * 2) remove the renderer from the offScreen render window if using vtk.js driven
   * rendering pipeline
   * 3) resetting the viewport to remove the canvas attributes and canvas data
   * 4) resize the offScreen appropriately (if using vtk.js driven rendering pipeline)
   *
   * @fires Events.ELEMENT_ENABLED
   *
   * @param viewportId - viewport Id
   *
   */
  public disableElement(viewportId: string): void {
    this._throwIfDestroyed();
    // 1. Getting the viewport to remove it
    const viewport = this.getViewport(viewportId);

    // 2 To throw if there is no viewport stored in rendering engine
    if (!viewport) {
      console.warn(`viewport ${viewportId} does not exist`);
      return;
    }

    // 3. Reset the viewport to remove attributes, and reset the canvas
    this._resetViewport(viewport);

    // 4. Remove the related renderer from the offScreenMultiRenderWindow
    if (
      !viewportTypeUsesCustomRenderingPipeline(viewport.type) &&
      !this.useCPURendering
    ) {
      this.offscreenMultiRenderWindow.removeRenderer(viewportId);
    }

    // 5. Remove the requested viewport from the rendering engine
    this._removeViewport(viewportId);
    viewport.isDisabled = true;

    // 6. Avoid rendering for the disabled viewport
    this._needsRender.delete(viewportId);

    // 7. Clear RAF if no viewport is left
    const viewports = this.getViewports();
    if (!viewports.length) {
      this._clearAnimationFrame();
    }

    // 8. Resize the offScreen canvas to accommodate for the new size (after removal)
    // Note: Resize should not reset pan and zoom when disabling an element.
    // This is because we are only resizing the offscreen canvas to deal with the element
    // which was removed, and do not wish to alter the current state of any other currently enabled element
    const immediate = true;
    const keepCamera = true;
    this.resize(immediate, keepCamera);
  }

  /**
   * It takes an array of viewport input objects including element, viewportId, type
   * and defaultOptions. It will add the viewport to the rendering engine and enables them.
   *
   *
   * ```typescript
   *renderingEngine.setViewports([
   *   {
   *     viewportId: axialViewportId,
   *     type: ViewportType.ORTHOGRAPHIC,
   *     element: document.getElementById('axialDiv'),
   *     defaultOptions: {
   *       orientation: Enums.OrientationAxis.AXIAL,
   *     },
   *   },
   *   {
   *     viewportId: sagittalViewportId,
   *     type: ViewportType.ORTHOGRAPHIC,
   *     element: document.getElementById('sagittalDiv'),
   *     defaultOptions: {
   *       orientation: Enums.OrientationAxis.SAGITTAL,
   *     },
   *   },
   *   {
   *     viewportId: customOrientationViewportId,
   *     type: ViewportType.ORTHOGRAPHIC,
   *     element: document.getElementById('customOrientationDiv'),
   *     defaultOptions: {
   *       orientation: { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] },
   *     },
   *   },
   * ])
   * ```
   *
   * @fires Events.ELEMENT_ENABLED
   *
   * @param viewportInputEntries - Array<PublicViewportInput>
   */

  public setViewports(
    publicViewportInputEntries: Array<PublicViewportInput>
  ): void {
    const viewportInputEntries = this._normalizeViewportInputEntries(
      publicViewportInputEntries
    );
    this._throwIfDestroyed();
    this._reset();

    // 1. Split viewports based on whether they use vtk.js or a custom pipeline.

    const vtkDrivenViewportInputEntries: NormalizedViewportInput[] = [];
    const customRenderingViewportInputEntries: NormalizedViewportInput[] = [];

    viewportInputEntries.forEach((vpie) => {
      if (
        !this.useCPURendering &&
        !viewportTypeUsesCustomRenderingPipeline(vpie.type)
      ) {
        vtkDrivenViewportInputEntries.push(vpie);
      } else {
        customRenderingViewportInputEntries.push(vpie);
      }
    });

    this.setVtkjsDrivenViewports(vtkDrivenViewportInputEntries);
    this.setCustomViewports(customRenderingViewportInputEntries);
  }

  /**
   * Resizes the offscreen viewport and recalculates translations to on screen canvases.
   * It is up to the parent app to call the resize of the on-screen canvas changes.
   * This is left as an app level concern as one might want to debounce the changes, or the like.
   *
   * @param immediate - Whether all of the viewports should be rendered immediately.
   * @param keepCamera - Whether to keep the camera for other viewports while resizing the offscreen canvas
   */
  public resize(immediate = true, keepCamera = true): void {
    this._throwIfDestroyed();
    // 1. Get the viewports' canvases
    const viewports = this._getViewportsAsArray();

    const vtkDrivenViewports = [];
    const customRenderingViewports = [];

    viewports.forEach((vpie) => {
      if (!viewportTypeUsesCustomRenderingPipeline(vpie.type)) {
        vtkDrivenViewports.push(vpie);
      } else {
        customRenderingViewports.push(vpie);
      }
    });

    this._resizeVTKViewports(vtkDrivenViewports, keepCamera, immediate);

    this._resizeUsingCustomResizeHandler(
      customRenderingViewports,
      keepCamera,
      immediate
    );
  }

  /**
   * Returns the viewport by Id
   *
   * @returns viewport
   */
  public getViewport(viewportId: string): IStackViewport | IVolumeViewport {
    return this._viewports.get(viewportId);
  }

  /**
   * getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
   *
   * @returns Array of viewports
   */
  public getViewports(): Array<IStackViewport | IVolumeViewport> {
    this._throwIfDestroyed();

    return this._getViewportsAsArray();
  }

  /**
   * Filters all the available viewports and return the stack viewports
   * @returns stack viewports registered on the rendering Engine
   */
  public getStackViewports(): Array<IStackViewport> {
    this._throwIfDestroyed();

    const viewports = this.getViewports();

    const isStackViewport = (
      viewport: IStackViewport | IVolumeViewport
    ): viewport is StackViewport => {
      return viewport instanceof StackViewport;
    };

    return viewports.filter(isStackViewport);
  }

  /**
   * Return all the viewports that are volume viewports
   * @returns An array of VolumeViewport objects.
   */
  public getVolumeViewports(): Array<IVolumeViewport> {
    this._throwIfDestroyed();

    const viewports = this.getViewports();

    const isVolumeViewport = (
      viewport: IStackViewport | IVolumeViewport
    ): viewport is BaseVolumeViewport => {
      return viewport instanceof BaseVolumeViewport;
    };

    return viewports.filter(isVolumeViewport);
  }

  /**
   * Renders all viewports on the next animation frame.
   *
   * @fires Events.IMAGE_RENDERED
   */
  public render(): void {
    const viewports = this.getViewports();
    const viewportIds = viewports.map((vp) => vp.id);

    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  /**
   * Renders any viewports viewing the given Frame Of Reference.
   *
   * @param FrameOfReferenceUID - The unique identifier of the
   * Frame Of Reference.
   */
  public renderFrameOfReference = (FrameOfReferenceUID: string): void => {
    const viewports = this._getViewportsAsArray();
    const viewportIdsWithSameFrameOfReferenceUID = viewports.map((vp) => {
      if (vp.getFrameOfReferenceUID() === FrameOfReferenceUID) {
        return vp.id;
      }
    });

    return this.renderViewports(viewportIdsWithSameFrameOfReferenceUID);
  };

  /**
   * Renders the provided Viewport IDs.
   *
   */
  public renderViewports(viewportIds: Array<string>): void {
    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  /**
   * Renders only a specific `Viewport` on the next animation frame.
   *
   * @param viewportId - The Id of the viewport.
   */
  public renderViewport(viewportId: string): void {
    this._setViewportsToBeRenderedNextFrame([viewportId]);
  }

  /**
   * destroy the rendering engine. It will remove all the viewports and,
   * if the rendering engine is using the GPU, it will also destroy the GPU
   * resources.
   */
  public destroy(): void {
    if (this.hasBeenDestroyed) {
      return;
    }

    // remove vtk rendered first before resetting the viewport
    if (!this.useCPURendering) {
      const viewports = this._getViewportsAsArray();
      viewports.forEach((vp) => {
        this.offscreenMultiRenderWindow.removeRenderer(vp.id);
      });

      // Free up WebGL resources
      this.offscreenMultiRenderWindow.delete();

      // Make sure all references go stale and are garbage collected.
      delete this.offscreenMultiRenderWindow;
    }

    this._reset();
    renderingEngineCache.delete(this.id);

    this.hasBeenDestroyed = true;
  }

  /**
   * Fill the canvas with the background color
   * @param canvas - The canvas element to draw on.
   * @param backgroundColor - An array of three numbers between 0 and 1 that
   * specify the red, green, and blue values of the background color.
   */
  public fillCanvasWithBackgroundColor(
    canvas: HTMLCanvasElement,
    backgroundColor: [number, number, number]
  ): void {
    const ctx = canvas.getContext('2d');

    // Default to black if no background color is set
    let fillStyle;
    if (backgroundColor) {
      const rgb = backgroundColor.map((f) => Math.floor(255 * f));
      fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    } else {
      fillStyle = 'black';
    }

    // We draw over the previous stack with the background color while we
    // wait for the next stack to load
    ctx.fillStyle = fillStyle;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private _normalizeViewportInputEntry(
    viewportInputEntry: PublicViewportInput
  ) {
    const { type, defaultOptions } = viewportInputEntry;
    let options = defaultOptions;

    if (!options || Object.keys(options).length === 0) {
      options = {
        background: [0, 0, 0],
        orientation: null,
      };

      if (type === ViewportType.ORTHOGRAPHIC) {
        options = {
          ...options,
          orientation: OrientationAxis.AXIAL,
        };
      }
    }

    return {
      ...viewportInputEntry,
      defaultOptions: options,
    };
  }

  private _normalizeViewportInputEntries(
    viewportInputEntries: Array<PublicViewportInput>
  ): Array<NormalizedViewportInput> {
    const normalizedViewportInputs = [];

    viewportInputEntries.forEach((viewportInput) => {
      normalizedViewportInputs.push(
        this._normalizeViewportInputEntry(viewportInput)
      );
    });

    return normalizedViewportInputs;
  }

  private _resizeUsingCustomResizeHandler(
    customRenderingViewports: StackViewport[],
    keepCamera = true,
    immediate = true
  ) {
    // 1. If viewport has a custom resize method, call it here.
    customRenderingViewports.forEach((vp) => {
      if (typeof vp.resize === 'function') vp.resize();
    });

    // 3. Reset viewport cameras
    customRenderingViewports.forEach((vp) => {
      const prevCamera = vp.getCamera();
      vp.resetCamera();

      if (keepCamera) {
        vp.setCamera(prevCamera);
      }
    });

    // 2. If render is immediate: Render all
    if (immediate === true) {
      this.render();
    }
  }

  private _resizeVTKViewports(
    vtkDrivenViewports: Array<IStackViewport | IVolumeViewport>,
    keepCamera = true,
    immediate = true
  ) {
    const canvasesDrivenByVtkJs = vtkDrivenViewports.map((vp) => vp.canvas);

    if (canvasesDrivenByVtkJs.length) {
      // 1. Recalculate and resize the offscreen canvas size
      const { offScreenCanvasWidth, offScreenCanvasHeight } =
        this._resizeOffScreenCanvas(canvasesDrivenByVtkJs);

      // 2. Recalculate the viewports location on the off screen canvas
      this._resize(
        vtkDrivenViewports,
        offScreenCanvasWidth,
        offScreenCanvasHeight
      );
    }

    // 3. Reset viewport cameras
    vtkDrivenViewports.forEach((vp: IStackViewport | IVolumeViewport) => {
      const canvas = getOrCreateCanvas(vp.element);
      const rect = canvas.getBoundingClientRect();
      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;

      const prevCamera = vp.getCamera();
      vp.resetCamera();

      if (keepCamera) {
        vp.setCamera(prevCamera);
      }
    });

    // 4. If render is immediate: Render all
    if (immediate === true) {
      this.render();
    }
  }

  /**
   * Enables a viewport to be driven by the offscreen vtk.js rendering engine.
   *
   * @param viewportInputEntry - Information object used to
   * construct and enable the viewport.
   */
  private enableVTKjsDrivenViewport(
    viewportInputEntry: NormalizedViewportInput
  ) {
    const viewports = this._getViewportsAsArray();
    const viewportsDrivenByVtkJs = viewports.filter(
      (vp) => viewportTypeUsesCustomRenderingPipeline(vp.type) === false
    );

    const canvasesDrivenByVtkJs = viewportsDrivenByVtkJs.map((vp) => vp.canvas);

    const canvas = getOrCreateCanvas(viewportInputEntry.element);
    canvasesDrivenByVtkJs.push(canvas);

    const devicePixelRatio = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;

    // 2.c Calculating the new size for offScreen Canvas
    const { offScreenCanvasWidth, offScreenCanvasHeight } =
      this._resizeOffScreenCanvas(canvasesDrivenByVtkJs);

    // 2.d Re-position previous viewports on the offScreen Canvas based on the new
    // offScreen canvas size
    const xOffset = this._resize(
      viewportsDrivenByVtkJs,
      offScreenCanvasWidth,
      offScreenCanvasHeight
    );

    const internalViewportEntry = { ...viewportInputEntry, canvas };

    // 3 Add the requested viewport to rendering Engine
    this.addVtkjsDrivenViewport(internalViewportEntry, {
      offScreenCanvasWidth,
      offScreenCanvasHeight,
      xOffset,
    });
  }

  /**
   * Disables the requested viewportId from the rendering engine:
   * 1) It removes the viewport from the the list of viewports
   * 2) remove the renderer from the offScreen render window
   * 3) resetting the viewport to remove the canvas attributes and canvas data
   * 4) resize the offScreen appropriately
   *
   * @param viewportId - viewport Id
   *
   */
  private _removeViewport(viewportId: string): void {
    // 1. Get the viewport
    const viewport = this.getViewport(viewportId);
    if (!viewport) {
      console.warn(`viewport ${viewportId} does not exist`);
      return;
    }

    // 2. Delete the viewports from the the viewports
    this._viewports.delete(viewportId);
  }

  /**
   *  Adds a viewport driven by vtk.js to the `RenderingEngine`.
   *
   * @param viewportInputEntry - Information object used to construct and enable the viewport.
   * @param options - Options object used to configure the viewport.
   * @param options.offScreenCanvasWidth - The width of the offscreen canvas.
   * @param options.offScreenCanvasHeight - The height of the offscreen canvas.
   * @param options.xOffset - The x offset of the viewport on the offscreen canvas.
   */
  private addVtkjsDrivenViewport(
    viewportInputEntry: InternalViewportInput,
    offscreenCanvasProperties?: {
      offScreenCanvasWidth: number;
      offScreenCanvasHeight: number;
      xOffset: number;
    }
  ): void {
    const { element, canvas, viewportId, type, defaultOptions } =
      viewportInputEntry;

    // Make the element not focusable, we use this for modifier keys to work
    element.tabIndex = -1;

    const { offScreenCanvasWidth, offScreenCanvasHeight, xOffset } =
      offscreenCanvasProperties;

    // 1. Calculate the size of location of the viewport on the offScreen canvas
    const {
      sxStartDisplayCoords,
      syStartDisplayCoords,
      sxEndDisplayCoords,
      syEndDisplayCoords,
      sx,
      sy,
      sWidth,
      sHeight,
    } = this._getViewportCoordsOnOffScreenCanvas(
      viewportInputEntry,
      offScreenCanvasWidth,
      offScreenCanvasHeight,
      xOffset
    );

    // 2. Add a renderer to the offScreenMultiRenderWindow
    this.offscreenMultiRenderWindow.addRenderer({
      viewport: [
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords,
      ],
      id: viewportId,
      background: defaultOptions.background
        ? defaultOptions.background
        : [0, 0, 0],
    });

    // 3. ViewportInput to be passed to a stack/volume viewport
    const viewportInput = <ViewportInput>{
      id: viewportId,
      element, // div
      renderingEngineId: this.id,
      type,
      canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      defaultOptions: defaultOptions || {},
    };

    // 4. Create a proper viewport based on the type of the viewport
    let viewport;
    if (type === ViewportType.STACK) {
      // 4.a Create stack viewport
      viewport = new StackViewport(viewportInput);
    } else if (
      type === ViewportType.ORTHOGRAPHIC ||
      type === ViewportType.PERSPECTIVE
    ) {
      // 4.b Create a volume viewport
      viewport = new VolumeViewport(viewportInput);
    } else if (type === ViewportType.VOLUME_3D) {
      viewport = new VolumeViewport3D(viewportInput);
    } else {
      throw new Error(`Viewport Type ${type} is not supported`);
    }

    // 5. Storing the viewports
    this._viewports.set(viewportId, viewport);

    const eventDetail: EventTypes.ElementEnabledEventDetail = {
      element,
      viewportId,
      renderingEngineId: this.id,
    };

    if (!viewport.suppressEvents) {
      triggerEvent(eventTarget, Events.ELEMENT_ENABLED, eventDetail);
    }
  }

  /**
   * Adds a viewport using a custom rendering pipeline to the `RenderingEngine`.
   *
   * @param viewportInputEntry - Information object used to
   * construct and enable the viewport.
   */
  private addCustomViewport(viewportInputEntry: PublicViewportInput): void {
    const { element, viewportId, type, defaultOptions } = viewportInputEntry;

    // Make the element not focusable, we use this for modifier keys to work
    element.tabIndex = -1;

    const canvas = getOrCreateCanvas(element);

    // Add a viewport with no offset
    const { clientWidth, clientHeight } = canvas;

    // Set the canvas to be same resolution as the client.
    // Note: This ignores devicePixelRatio for now. We may want to change it in the
    // future but it has no benefit for the Cornerstone CPU rendering pathway at the
    // moment anyway.
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    const viewportInput = <ViewportInput>{
      id: viewportId,
      renderingEngineId: this.id,
      element, // div
      type,
      canvas,
      sx: 0, // No offset, uses own renderer
      sy: 0,
      sWidth: clientWidth,
      sHeight: clientHeight,
      defaultOptions: defaultOptions || {},
    };

    // 4. Create a proper viewport based on the type of the viewport

    if (type !== ViewportType.STACK) {
      // In the future these will need to be pluggable, but we aren't there yet
      // and these are just Stacks for now.
      throw new Error('Support for fully custom viewports not yet implemented');
    }

    // 4.a Create stack viewport
    const viewport = new StackViewport(viewportInput);

    // 5. Storing the viewports
    this._viewports.set(viewportId, viewport);

    const eventDetail: EventTypes.ElementEnabledEventDetail = {
      element,
      viewportId,
      renderingEngineId: this.id,
    };

    triggerEvent(eventTarget, Events.ELEMENT_ENABLED, eventDetail);
  }

  /**
   * Sets multiple viewports using custom rendering
   * pipelines to the `RenderingEngine`.
   *
   * @param viewportInputEntries - An array of information
   * objects used to construct and enable the viewports.
   */
  private setCustomViewports(viewportInputEntries: PublicViewportInput[]) {
    viewportInputEntries.forEach((vpie) => this.addCustomViewport(vpie));
  }

  /**
   * Sets multiple vtk.js driven viewports to
   * the `RenderingEngine`.
   *
   * @param viewportInputEntries - An array of information
   * objects used to construct and enable the viewports.
   */
  private setVtkjsDrivenViewports(
    viewportInputEntries: NormalizedViewportInput[]
  ) {
    // Deal with vtkjs driven viewports
    if (viewportInputEntries.length) {
      // 1. Getting all the canvases from viewports calculation of the new offScreen size
      const vtkDrivenCanvases = viewportInputEntries.map((vp) =>
        getOrCreateCanvas(vp.element)
      );

      // Ensure the canvas size includes any scaling due to device pixel ratio
      vtkDrivenCanvases.forEach((canvas) => {
        const devicePixelRatio = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
      });

      // 2. Set canvas size based on height and sum of widths
      const { offScreenCanvasWidth, offScreenCanvasHeight } =
        this._resizeOffScreenCanvas(vtkDrivenCanvases);

      /*
          TODO: Commenting this out until we can mock the Canvas usage in the tests (or use jsdom?)
          if (!offScreenCanvasWidth || !offScreenCanvasHeight) {
            throw new Error('Invalid offscreen canvas width or height')
          }*/

      // 3. Adding the viewports based on the viewportInputEntry definition to the
      // rendering engine.
      let xOffset = 0;
      for (let i = 0; i < viewportInputEntries.length; i++) {
        const vtkDrivenViewportInputEntry = viewportInputEntries[i];
        const canvas = vtkDrivenCanvases[i];
        const internalViewportEntry = {
          ...vtkDrivenViewportInputEntry,
          canvas,
        };

        this.addVtkjsDrivenViewport(internalViewportEntry, {
          offScreenCanvasWidth,
          offScreenCanvasHeight,
          xOffset,
        });

        // Incrementing the xOffset which provides the horizontal location of each
        // viewport on the offScreen canvas
        xOffset += canvas.width;
      }
    }
  }

  /**
   * Resizes the offscreen canvas based on the provided vtk.js driven canvases.
   *
   * @param canvases - An array of HTML Canvas
   */
  private _resizeOffScreenCanvas(
    canvasesDrivenByVtkJs: Array<HTMLCanvasElement>
  ): { offScreenCanvasWidth: number; offScreenCanvasHeight: number } {
    const { offScreenCanvasContainer, offscreenMultiRenderWindow } = this;

    const devicePixelRatio = window.devicePixelRatio || 1;

    // 1. Calculated the height of the offScreen canvas to be the maximum height
    // between canvases
    const offScreenCanvasHeight = Math.max(
      ...canvasesDrivenByVtkJs.map(
        (canvas) => canvas.clientHeight * devicePixelRatio
      )
    );

    // 2. Calculating the width of the offScreen canvas to be the sum of all
    let offScreenCanvasWidth = 0;

    canvasesDrivenByVtkJs.forEach((canvas) => {
      offScreenCanvasWidth += canvas.clientWidth * devicePixelRatio;
    });

    offScreenCanvasContainer.width = offScreenCanvasWidth;
    offScreenCanvasContainer.height = offScreenCanvasHeight;

    // 3. Resize command
    offscreenMultiRenderWindow.resize();

    return { offScreenCanvasWidth, offScreenCanvasHeight };
  }

  /**
   * Recalculates and updates the viewports location on the offScreen canvas upon its resize
   *
   * @param viewports - An array of viewports
   * @param offScreenCanvasWidth - new offScreen canvas width
   * @param offScreenCanvasHeight - new offScreen canvas height
   *
   * @returns _xOffset the final offset which will be used for the next viewport
   */
  private _resize(
    viewportsDrivenByVtkJs: Array<IStackViewport | IVolumeViewport>,
    offScreenCanvasWidth: number,
    offScreenCanvasHeight: number
  ): number {
    // Redefine viewport properties
    let _xOffset = 0;

    const devicePixelRatio = window.devicePixelRatio || 1;

    for (let i = 0; i < viewportsDrivenByVtkJs.length; i++) {
      const viewport = viewportsDrivenByVtkJs[i];
      const {
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords,
        sx,
        sy,
        sWidth,
        sHeight,
      } = this._getViewportCoordsOnOffScreenCanvas(
        viewport,
        offScreenCanvasWidth,
        offScreenCanvasHeight,
        _xOffset
      );

      _xOffset += viewport.canvas.clientWidth * devicePixelRatio;

      viewport.sx = sx;
      viewport.sy = sy;
      viewport.sWidth = sWidth;
      viewport.sHeight = sHeight;

      // Updating the renderer for the viewport
      const renderer = this.offscreenMultiRenderWindow.getRenderer(viewport.id);
      renderer.setViewport([
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords,
      ]);
    }

    // Returns the final xOffset
    return _xOffset;
  }

  /**
   * Calculates the location of the provided viewport on the offScreenCanvas
   *
   * @param viewports - An array of viewports
   * @param offScreenCanvasWidth - new offScreen canvas width
   * @param offScreenCanvasHeight - new offScreen canvas height
   * @param _xOffset - xOffSet to draw
   */
  private _getViewportCoordsOnOffScreenCanvas(
    viewport: InternalViewportInput | IStackViewport | IVolumeViewport,
    offScreenCanvasWidth: number,
    offScreenCanvasHeight: number,
    _xOffset: number
  ): ViewportDisplayCoords {
    const { canvas } = viewport;
    const { clientWidth, clientHeight } = canvas;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const height = clientHeight * devicePixelRatio;
    const width = clientWidth * devicePixelRatio;

    // Update the canvas drawImage offsets.
    const sx = _xOffset;
    const sy = 0;
    const sWidth = width;
    const sHeight = height;

    const sxStartDisplayCoords = sx / offScreenCanvasWidth;

    // Need to offset y if it not max height
    const syStartDisplayCoords =
      sy + (offScreenCanvasHeight - height) / offScreenCanvasHeight;

    const sWidthDisplayCoords = sWidth / offScreenCanvasWidth;
    const sHeightDisplayCoords = sHeight / offScreenCanvasHeight;

    return {
      sxStartDisplayCoords,
      syStartDisplayCoords,
      sxEndDisplayCoords: sxStartDisplayCoords + sWidthDisplayCoords,
      syEndDisplayCoords: syStartDisplayCoords + sHeightDisplayCoords,
      sx,
      sy,
      sWidth,
      sHeight,
    };
  }

  /**
   * @method _getViewportsAsArray Returns an array of all viewports
   *
   * @returns {Array} Array of viewports.
   */
  private _getViewportsAsArray() {
    return Array.from(this._viewports.values());
  }

  private _setViewportsToBeRenderedNextFrame(viewportIds: string[]) {
    // Add the viewports to the set of flagged viewports
    viewportIds.forEach((viewportId) => {
      this._needsRender.add(viewportId);
    });

    // Render any flagged viewports
    this._render();
  }

  /**
   * Sets up animation frame if necessary
   */
  private _render() {
    // If we have viewports that need rendering and we have not already
    // set the RAF callback to run on the next frame.
    if (this._needsRender.size > 0 && this._animationFrameSet === false) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedViewports
      );

      // Set the flag that we have already set up the next RAF call.
      this._animationFrameSet = true;
    }
  }

  /**
   * Renders all viewports.
   */
  private _renderFlaggedViewports = () => {
    this._throwIfDestroyed();

    if (!this.useCPURendering) {
      this.performVtkDrawCall();
    }

    const viewports = this._getViewportsAsArray();
    const eventDetailArray = [];

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      if (this._needsRender.has(viewport.id)) {
        const eventDetail =
          this.renderViewportUsingCustomOrVtkPipeline(viewport);
        eventDetailArray.push(eventDetail);

        // This viewport has been rendered, we can remove it from the set
        this._needsRender.delete(viewport.id);

        // If there is nothing left that is flagged for rendering, stop the loop
        if (this._needsRender.size === 0) {
          break;
        }
      }
    }

    // allow RAF to be called again
    this._animationFrameSet = false;
    this._animationFrameHandle = null;

    eventDetailArray.forEach((eventDetail) => {
      triggerEvent(eventDetail.element, Events.IMAGE_RENDERED, eventDetail);
    });
  };

  /**
   * Performs the single `vtk.js` draw call which is used to render the offscreen
   * canvas for vtk.js. This is a bulk rendering step for all Volume and Stack
   * viewports when GPU rendering is available.
   */
  private performVtkDrawCall() {
    // Render all viewports under vtk.js' control.
    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const renderers = offscreenMultiRenderWindow.getRenderers();

    if (!renderers.length) {
      return;
    }

    for (let i = 0; i < renderers.length; i++) {
      const { renderer, id } = renderers[i];

      // Requesting viewports that need rendering to be rendered only
      if (this._needsRender.has(id)) {
        renderer.setDraw(true);
      } else {
        renderer.setDraw(false);
      }
    }

    renderWindow.render();

    // After redraw we set all renderers to not render until necessary
    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(false);
    }
  }

  /**
   * Renders the given viewport
   * using its proffered method.
   *
   * @param viewport - The viewport to render
   */
  private renderViewportUsingCustomOrVtkPipeline(
    viewport: IStackViewport | IVolumeViewport
  ): EventTypes.ImageRenderedEventDetail[] {
    let eventDetail;

    if (viewportTypeUsesCustomRenderingPipeline(viewport.type) === true) {
      eventDetail =
        viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
    } else {
      if (this.useCPURendering) {
        throw new Error(
          'GPU not available, and using a viewport with no custom render pipeline.'
        );
      }

      const { offscreenMultiRenderWindow } = this;
      const openGLRenderWindow =
        offscreenMultiRenderWindow.getOpenGLRenderWindow();
      const context = openGLRenderWindow.get3DContext();
      const offScreenCanvas = context.canvas;

      eventDetail = this._renderViewportFromVtkCanvasToOnscreenCanvas(
        viewport,
        offScreenCanvas
      );
    }

    return eventDetail;
  }

  /**
   * Renders a particular `Viewport`'s on screen canvas.
   * @param viewport - The `Viewport` to render.
   * @param offScreenCanvas - The offscreen canvas to render from.
   */
  private _renderViewportFromVtkCanvasToOnscreenCanvas(
    viewport: IStackViewport | IVolumeViewport,
    offScreenCanvas
  ): EventTypes.ImageRenderedEventDetail {
    const {
      element,
      canvas,
      sx,
      sy,
      sWidth,
      sHeight,
      id: viewportId,
      renderingEngineId,
      suppressEvents,
    } = viewport;

    const { width: dWidth, height: dHeight } = canvas;

    const onScreenContext = canvas.getContext('2d');

    onScreenContext.drawImage(
      offScreenCanvas,
      sx,
      sy,
      sWidth,
      sHeight,
      0, //dx
      0, // dy
      dWidth,
      dHeight
    );

    return {
      element,
      suppressEvents,
      viewportId,
      renderingEngineId,
    };
  }

  /**
   * Reset the viewport by removing the data attributes
   * and clearing the context of draw. It also emits an element disabled event
   *
   * @param viewport - The `Viewport` to render.
   */
  private _resetViewport(viewport: IStackViewport | IVolumeViewport) {
    const renderingEngineId = this.id;

    const { element, canvas, id: viewportId } = viewport;

    const eventDetail: EventTypes.ElementDisabledEventDetail = {
      element,
      viewportId,
      renderingEngineId,
    };

    // Trigger first before removing the data attributes, as we need the enabled
    // element to remove tools associated with the viewport
    triggerEvent(eventTarget, Events.ELEMENT_DISABLED, eventDetail);

    element.removeAttribute('data-viewport-uid');
    element.removeAttribute('data-rendering-engine-uid');

    // clear drawing
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  private _clearAnimationFrame() {
    window.cancelAnimationFrame(this._animationFrameHandle);

    this._needsRender.clear();
    this._animationFrameSet = false;
    this._animationFrameHandle = null;
  }

  /**
   * Resets the `RenderingEngine`
   */
  private _reset() {
    const viewports = this._getViewportsAsArray();

    viewports.forEach((viewport) => {
      this._resetViewport(viewport);
    });

    this._clearAnimationFrame();

    this._viewports = new Map();
  }

  /**
   * Throws an error if trying to interact with the `RenderingEngine`
   * instance after its `destroy` method has been called.
   */
  private _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      );
    }
  }

  // debugging utils for offScreen canvas
  _downloadOffScreenCanvas() {
    const dataURL = this._debugRender();
    _TEMPDownloadURI(dataURL);
  }

  // debugging utils for offScreen canvas
  _debugRender(): void {
    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const renderers = offscreenMultiRenderWindow.getRenderers();

    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(true);
    }

    renderWindow.render();
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const context = openGLRenderWindow.get3DContext();

    const offScreenCanvas = context.canvas;
    const dataURL = offScreenCanvas.toDataURL();

    this._getViewportsAsArray().forEach((viewport) => {
      const { sx, sy, sWidth, sHeight } = viewport;

      const canvas = <HTMLCanvasElement>viewport.canvas;
      const { width: dWidth, height: dHeight } = canvas;

      const onScreenContext = canvas.getContext('2d');

      //sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
      onScreenContext.drawImage(
        offScreenCanvas,
        sx,
        sy,
        sWidth,
        sHeight,
        0, //dx
        0, // dy
        dWidth,
        dHeight
      );
    });

    return dataURL;
  }
}

export default RenderingEngine;

// debugging utils for offScreen canvas
function _TEMPDownloadURI(uri) {
  const link = document.createElement('a');

  link.download = 'viewport.png';
  link.href = uri;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
