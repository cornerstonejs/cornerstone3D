import Events from '../enums/Events';
import renderingEngineCache from './renderingEngineCache';
import type { IRenderingEngine } from '../types';
import eventTarget from '../eventTarget';
import uuidv4 from '../utilities/uuidv4';
import triggerEvent from '../utilities/triggerEvent';
import { vtkOffscreenMultiRenderWindow } from './vtkClasses';
import ViewportType from '../enums/ViewportType';
import BaseVolumeViewport from './BaseVolumeViewport';
import StackViewport from './StackViewport';
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline';
import getOrCreateCanvas from './helpers/getOrCreateCanvas';
import { getShouldUseCPURendering, isCornerstoneInitialized } from '../init';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import viewportTypeToViewportClass from './helpers/viewportTypeToViewportClass';

import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
  IViewport,
} from '../types/IViewport';
import { OrientationAxis } from '../enums';

// Rendering engines seem to not like rendering things less than 2 pixels per side
const VIEWPORT_MIN_SIZE = 2;

/**
 * Abstract base class for rendering engines that provides common functionality
 * for both standard and sequential rendering engines.
 *
 * @abstract
 */
abstract class BaseRenderingEngine {
  /** Unique identifier for renderingEngine */
  readonly id: string;
  /** A flag which tells if the renderingEngine has been destroyed or not */
  public hasBeenDestroyed: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public offscreenMultiRenderWindow: any;
  readonly offScreenCanvasContainer: HTMLDivElement;
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

    renderingEngineCache.set(this as unknown as IRenderingEngine);

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
   * Enables the requested viewport and add it to the viewports.
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
   * Disables the requested viewportId from the rendering engine
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
  }

  /**
   * It takes an array of viewport input objects and enables them
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
   * Resizes viewports and optionally maintains camera settings
   */
  public abstract resize(immediate?: boolean, keepCamera?: boolean): void;

  /**
   * Returns the viewport by Id
   */
  public getViewport(viewportId: string): IViewport {
    return this._viewports?.get(viewportId);
  }

  /**
   * getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
   */
  public getViewports(): IViewport[] {
    this._throwIfDestroyed();

    return this._getViewportsAsArray();
  }

  /**
   * Retrieves a stack viewport by its ID
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
   */
  public render(): void {
    const viewports = this.getViewports();
    const viewportIds = viewports.map((vp) => vp.id);

    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  /**
   * Renders any viewports viewing the given Frame Of Reference.
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
   */
  public renderViewports(viewportIds: string[]): void {
    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  /**
   * Renders only a specific `Viewport` on the next animation frame.
   */
  public renderViewport(viewportId: string): void {
    this._setViewportsToBeRenderedNextFrame([viewportId]);
  }

  /**
   * destroy the rendering engine.
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

  /**
   * Enables a viewport to be driven by the offscreen vtk.js rendering engine.
   */
  protected abstract enableVTKjsDrivenViewport(
    viewportInputEntry: NormalizedViewportInput
  ): void;

  /**
   * Adds a viewport using a custom rendering pipeline
   */
  protected addCustomViewport(viewportInputEntry: PublicViewportInput): void {
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
    } as ViewportInput;

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
   * Sets multiple viewports using custom rendering pipelines
   */
  protected setCustomViewports(viewportInputEntries: PublicViewportInput[]) {
    viewportInputEntries.forEach((vpie) => {
      this.addCustomViewport(vpie);
    });
  }

  /**
   * Sets multiple vtk.js driven viewports
   */
  protected abstract setVtkjsDrivenViewports(
    viewportInputEntries: NormalizedViewportInput[]
  ): void;

  /**
   * Adds a viewport driven by vtk.js
   */
  protected abstract addVtkjsDrivenViewport(
    viewportInputEntry: InternalViewportInput,
    offscreenCanvasProperties?: {
      offScreenCanvasWidth: number;
      offScreenCanvasHeight: number;
      xOffset: number;
    }
  ): void;

  /**
   * Resize handler for custom rendering viewports
   */
  protected _resizeUsingCustomResizeHandler(
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
   * Resize handler for VTK viewports
   */
  protected abstract _resizeVTKViewports(
    vtkDrivenViewports: (IStackViewport | IVolumeViewport)[],
    keepCamera?: boolean,
    immediate?: boolean
  ): void;

  /**
   * Renders a particular viewport
   */
  protected renderViewportUsingCustomOrVtkPipeline(
    viewport: IViewport
  ): EventTypes.ImageRenderedEventDetail[] {
    let eventDetail;

    // Rendering engines start having issues without at least two pixels
    // in each direction
    if (
      viewport.sWidth < VIEWPORT_MIN_SIZE ||
      viewport.sHeight < VIEWPORT_MIN_SIZE
    ) {
      console.warn('Viewport is too small', viewport.sWidth, viewport.sHeight);
      return;
    }
    if (viewportTypeUsesCustomRenderingPipeline(viewport.type) === true) {
      eventDetail =
        viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
    } else {
      if (this.useCPURendering) {
        throw new Error(
          'GPU not available, and using a viewport with no custom render pipeline.'
        );
      }

      eventDetail = this._renderVtkViewport(viewport);
    }

    return eventDetail;
  }

  /**
   * Abstract method for rendering VTK viewports - implemented differently for standard vs sequential
   */
  protected abstract _renderVtkViewport(
    viewport: IViewport
  ): EventTypes.ImageRenderedEventDetail;

  /**
   * Renders a viewport from VTK canvas to onscreen canvas
   */
  protected _renderViewportFromVtkCanvasToOnscreenCanvas(
    viewport: IViewport,
    offScreenCanvas: HTMLCanvasElement,
    sx: number = 0,
    sy: number = 0,
    sWidth?: number,
    sHeight?: number
  ): EventTypes.ImageRenderedEventDetail {
    const {
      element,
      canvas,
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
      sWidth || dWidth,
      sHeight || dHeight,
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
      viewportStatus: viewport.viewportStatus,
    };
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
   * @method _getViewportsAsArray Returns an array of all viewports
   */
  protected _getViewportsAsArray() {
    return Array.from(this._viewports.values());
  }

  protected _setViewportsToBeRenderedNextFrame(viewportIds: string[]) {
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
   * Renders all viewports.
   */
  protected _renderFlaggedViewports = () => {
    this._throwIfDestroyed();

    this._performRender();

    const viewports = this._getViewportsAsArray();
    const eventDetailArray = [];

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      if (this._needsRender.has(viewport.id)) {
        const eventDetail =
          this.renderViewportUsingCustomOrVtkPipeline(viewport);
        eventDetailArray.push(eventDetail);
        viewport.setRendered();

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
      // Very small viewports won't have an element
      if (!eventDetail?.element) {
        return;
      }
      triggerEvent(eventDetail.element, Events.IMAGE_RENDERED, eventDetail);
    });
  };

  /**
   * Performs the actual render - implemented differently for standard vs sequential
   */
  protected abstract _performRender(): void;

  /**
   * Reset the viewport by removing the data attributes
   * and clearing the context of draw. It also emits an element disabled event
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
}

export default BaseRenderingEngine;
