import Events from '../enums/Events';
import renderingEngineCache from './renderingEngineCache';
import eventTarget from '../eventTarget';
import uuidv4 from '../utilities/uuidv4';
import triggerEvent from '../utilities/triggerEvent';
import ViewportType from '../enums/ViewportType';
import BaseVolumeViewport from './BaseVolumeViewport';
import StackViewport from './StackViewport';
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline';
import getOrCreateCanvas from './helpers/getOrCreateCanvas';
import {
  getShouldUseCPURendering,
  isCornerstoneInitialized,
  getConfiguration,
} from '../init';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import viewportTypeToViewportClass from './helpers/viewportTypeToViewportClass';

import type * as EventTypes from '../types/EventTypes';
import type {
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
  IViewport,
} from '../types/IViewport';
import { OrientationAxis } from '../enums';
import type { VtkOffscreenMultiRenderWindow } from '../types';
import { StatsOverlay } from './helpers/stats';
import { convertColorArrayToRgbString } from '../utilities/convertColorArrayToRgbString';

// Rendering engines seem to not like rendering things less than 2 pixels per side
export const VIEWPORT_MIN_SIZE = 2;

/**
 * Base class for rendering engines that handle viewport rendering.
 * This abstract class provides the common functionality shared between
 * different rendering strategies
 *
 * @abstract
 */
abstract class BaseRenderingEngine {
  /** Unique identifier for renderingEngine */
  readonly id: string;
  /** A flag which tells if the renderingEngine has been destroyed or not */
  public hasBeenDestroyed: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow;
  public offScreenCanvasContainer: HTMLDivElement;
  protected _viewports: Map<string, IViewport>;
  protected _needsRender = new Set<string>();
  protected _animationFrameSet = false;
  protected _animationFrameHandle: number | null = null;
  protected useCPURendering: boolean;

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

    this._viewports = new Map();
    this.hasBeenDestroyed = false;

    const config = getConfiguration();

    if (config?.debug?.statsOverlay) {
      StatsOverlay.setup();
    }
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
   * ```
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
   * fires Events.ELEMENT_ENABLED
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
   * fires Events.ELEMENT_ENABLED
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
      // Only remove renderer if offscreenMultiRenderWindow exists (not in ContextPoolRenderingEngine)
      if (this.offscreenMultiRenderWindow) {
        this.offscreenMultiRenderWindow.removeRenderer(viewportId);
      }
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

    // Note: we should not call resize at the end of here, the reason is that
    // in batch rendering, we might disable a viewport and enable others at the same
    // time which would interfere with each other. So we just let the enable
    // to call resize, and also resize getting called by applications on the
    // DOM resize event.
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
   * fires Events.ELEMENT_ENABLED
   *
   * @param viewportInputEntries - Array<PublicViewportInput>
   */

  public setViewports(publicViewportInputEntries: PublicViewportInput[]): void {
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

    // Making sure the setViewports api also can fill the canvas
    // properly
    viewportInputEntries.forEach((vp) => {
      const canvas = getOrCreateCanvas(vp.element);
      const { background } = vp.defaultOptions;
      this.fillCanvasWithBackgroundColor(canvas, background);
    });
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

    if (vtkDrivenViewports.length) {
      this._resizeVTKViewports(vtkDrivenViewports, keepCamera, immediate);
    }

    if (customRenderingViewports.length) {
      this._resizeUsingCustomResizeHandler(
        customRenderingViewports,
        keepCamera,
        immediate
      );
    }
  }

  /**
   * Returns the viewport by Id
   *
   * @returns viewport
   */
  public getViewport(viewportId: string): IViewport {
    return this._viewports?.get(viewportId);
  }

  /**
   * getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
   *
   * @returns Array of viewports
   */
  public getViewports(): IViewport[] {
    this._throwIfDestroyed();

    return this._getViewportsAsArray();
  }

  /**
   * Retrieves a stack viewport by its ID. used just for type safety
   *
   * @param viewportId - The ID of the viewport to retrieve.
   * @returns The stack viewport with the specified ID.
   * @throws Error if the viewport with the given ID does not exist or is not a StackViewport.
   */
  public getStackViewport(viewportId: string): IStackViewport {
    this._throwIfDestroyed();

    const viewport = this.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    if (!(viewport instanceof StackViewport)) {
      throw new Error(`Viewport with Id ${viewportId} is not a StackViewport.`);
    }

    return viewport;
  }

  /**
   * Filters all the available viewports and return the stack viewports
   * @returns stack viewports registered on the rendering Engine
   */
  public getStackViewports(): IStackViewport[] {
    this._throwIfDestroyed();

    const viewports = this.getViewports();

    return viewports.filter(
      (vp) => vp instanceof StackViewport
    ) as IStackViewport[];
  }
  /**
   * Return all the viewports that are volume viewports
   * @returns An array of VolumeViewport objects.
   */
  public getVolumeViewports(): IVolumeViewport[] {
    this._throwIfDestroyed();

    const viewports = this.getViewports();

    const isVolumeViewport = (
      viewport: IViewport
    ): viewport is BaseVolumeViewport => {
      return viewport instanceof BaseVolumeViewport;
    };

    return viewports.filter(isVolumeViewport) as IVolumeViewport[];
  }

  /**
   * Renders all viewports on the next animation frame.
   *
   * fires Events.IMAGE_RENDERED
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

    this.renderViewports(viewportIdsWithSameFrameOfReferenceUID);
  };

  /**
   * Renders the provided Viewport IDs.
   *
   */
  public renderViewports(viewportIds: string[]): void {
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

    StatsOverlay.cleanup();

    // remove vtk rendered first before resetting the viewport
    if (!this.useCPURendering) {
      const viewports = this._getViewportsAsArray();
      viewports.forEach((vp) => {
        if (this.offscreenMultiRenderWindow) {
          this.offscreenMultiRenderWindow.removeRenderer(vp.id);
        }
      });

      // Free up WebGL resources
      if (this.offscreenMultiRenderWindow) {
        this.offscreenMultiRenderWindow.delete();
      }

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
    const fillStyle = backgroundColor
      ? convertColorArrayToRgbString(backgroundColor)
      : 'black';

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
        displayArea: null,
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
    viewportInputEntries: PublicViewportInput[]
  ): NormalizedViewportInput[] {
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
      if (typeof vp.resize === 'function') {
        vp.resize();
      }
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
    if (immediate) {
      this.render();
    }
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

    const viewportInput = {
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
    const ViewportType = viewportTypeToViewportClass[type];
    const viewport = new ViewportType(viewportInput);

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
   * Returns the renderer for a given viewportId.
   * @param viewportId - The Id of the viewport.
   * @returns The renderer for the viewport.
   */
  public getRenderer(viewportId) {
    return this.offscreenMultiRenderWindow.getRenderer(viewportId);
  }

  /**
   * Returns the offscreen multi-render window used for rendering.
   */
  public getOffscreenMultiRenderWindow(
    viewportId?: string
  ): VtkOffscreenMultiRenderWindow {
    if (this.useCPURendering) {
      throw new Error(
        'Offscreen multi render window is not available when using CPU rendering.'
      );
    }
    return this.offscreenMultiRenderWindow;
  }

  /**
   * Sets multiple viewports using custom rendering
   * pipelines to the `RenderingEngine`.
   *
   * @param viewportInputEntries - An array of information
   * objects used to construct and enable the viewports.
   */
  private setCustomViewports(viewportInputEntries: PublicViewportInput[]) {
    viewportInputEntries.forEach((vpie) => {
      this.addCustomViewport(vpie);
    });
  }

  /**
   * @method _getViewportsAsArray Returns an array of all viewports
   *
   * @returns Array of viewports.
   */
  protected _getViewportsAsArray(): IViewport[] {
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
    if (this._needsRender.size > 0 && !this._animationFrameSet) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedViewports
      );

      // Set the flag that we have already set up the next RAF call.
      this._animationFrameSet = true;
    }
  }

  /**
   * Reset the viewport by removing the data attributes
   * and clearing the context of draw. It also emits an element disabled event
   *
   * @param viewport - The `Viewport` to render.
   */
  private _resetViewport(viewport: IViewport) {
    const renderingEngineId = this.id;

    const { element, canvas, id: viewportId } = viewport;

    const eventDetail: EventTypes.ElementDisabledEventDetail = {
      element,
      viewportId,
      renderingEngineId,
    };

    viewport.removeWidgets();

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
  protected _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      );
    }
  }

  /**
   * Resizes viewports that use VTK.js for rendering.
   * This method must be implemented by subclasses to define their specific
   * resizing strategy.
   */
  protected abstract _resizeVTKViewports(
    vtkDrivenViewports: (IStackViewport | IVolumeViewport)[],
    keepCamera: boolean,
    immediate: boolean
  ): void;

  /**
   * Enables a viewport to be driven by the offscreen vtk.js rendering engine.
   * This method must be implemented by subclasses to define their specific
   * viewport enabling strategy.
   *
   * @param viewportInputEntry - Information object used to
   * construct and enable the viewport.
   */
  protected abstract enableVTKjsDrivenViewport(
    viewportInputEntry: NormalizedViewportInput
  ): void;

  /**
   * Adds a viewport driven by vtk.js to the `RenderingEngine`.
   * This method must be implemented by subclasses to define their specific
   * approach to adding VTK.js driven viewports.
   *
   * @param viewportInputEntry - Information object used to construct and enable the viewport.
   * @param offscreenCanvasProperties - Optional properties for configuring the offscreen canvas.
   */
  protected abstract addVtkjsDrivenViewport(
    viewportInputEntry: InternalViewportInput,
    offscreenCanvasProperties?: unknown
  ): void;

  /**
   * Renders all viewports.
   * This method must be implemented by subclasses to define their specific
   * rendering strategy
   */
  protected abstract _renderFlaggedViewports(): void;

  /**
   * Sets multiple vtk.js driven viewports to
   * the `RenderingEngine`.
   * This method must be implemented by subclasses to define their specific
   * approach to setting multiple VTK.js driven viewports.
   *
   * @param viewportInputEntries - An array of information
   * objects used to construct and enable the viewports.
   */
  protected abstract setVtkjsDrivenViewports(
    viewportInputEntries: NormalizedViewportInput[]
  ): void;

  /**
   * Renders a particular `Viewport`'s on screen canvas.
   * This method must be implemented by subclasses to define how to copy
   * from the offscreen canvas to the onscreen canvas.
   *
   * @param viewport - The `Viewport` to render.
   * @param offScreenCanvas - The offscreen canvas to render from.
   */
  protected abstract _renderViewportFromVtkCanvasToOnscreenCanvas(
    viewport: IViewport,
    offScreenCanvas: HTMLCanvasElement
  ): EventTypes.ImageRenderedEventDetail;
}

export default BaseRenderingEngine;
