import BaseRenderingEngine, { VIEWPORT_MIN_SIZE } from './BaseRenderingEngine';
import WebGLContextPool from './WebGLContextPool';
import { getConfiguration } from '../init';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';
import { coreLog } from '../utilities/logger';
import viewportTypeUsesCustomRenderingPipeline, {
  viewportUsesCustomRenderingPipeline,
} from './helpers/viewportTypeUsesCustomRenderingPipeline';
import getOrCreateCanvas, {
  updateCanvasSizeAndAspectRatio,
} from './helpers/getOrCreateCanvas';
import { setElementTouchActionNone } from './helpers/elementTouchAction';
import { isWebGLContextLost } from './helpers/attachWebGLContextEvents';
import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
} from '../types/IViewport';
import type EngineViewport from './EngineViewport';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { VtkOffscreenMultiRenderWindow } from '../types';
import { getViewportClassForInput } from './helpers/viewportTypeToViewportClass';
import copyWebGLCanvasToCanvas from './helpers/copyWebGLCanvasToCanvas';

/**
 * ContextPoolRenderingEngine extends BaseRenderingEngine to provide parallel rendering
 * capabilities using multiple WebGL contexts for improved performance.
 *
 * @public
 */
const log = coreLog.getLogger('RenderingEngine', 'ContextPoolRenderingEngine');

class ContextPoolRenderingEngine extends BaseRenderingEngine {
  private contextPool?: WebGLContextPool;

  constructor(id?: string) {
    super(id);
    if (!this.useCPURendering) {
      this.ensureContextPool();
    }
  }

  private ensureContextPool(): WebGLContextPool {
    if (!this.contextPool) {
      const { rendering } = getConfiguration();
      const { webGlContextCount } = rendering;
      this.contextPool = new WebGLContextPool(
        webGlContextCount,
        this.id,
        (contextIndex) => this._renderViewportsOfRestoredContext(contextIndex)
      );
    }

    return this.contextPool;
  }

  /**
   * Renders once more every viewport that draws through a context that the
   * browser restored. The GL objects of that context were dropped before this
   * runs, so the render builds them again from the data in memory. A
   * destroyed engine renders nothing.
   */
  private _renderViewportsOfRestoredContext(contextIndex: number): void {
    if (this.hasBeenDestroyed || !this.contextPool) {
      return;
    }

    const viewportIds = this._getViewportsAsArray()
      .filter(
        (viewport) =>
          !viewportUsesCustomRenderingPipeline(viewport) &&
          this.contextPool.getContextIndexForViewport(viewport.id) ===
            contextIndex
      )
      .map((viewport) => viewport.id);

    if (viewportIds.length) {
      this.renderViewports(viewportIds);
    }
  }

  /**
   * Whether the WebGL context that a viewport draws through is lost now. The
   * engine then leaves the viewport flagged and its canvas as it is, and the
   * restore of the context renders it again.
   */
  private _isViewportContextLost(viewport: EngineViewport): boolean {
    if (!this.contextPool || viewportUsesCustomRenderingPipeline(viewport)) {
      return false;
    }

    const contextIndex = this.contextPool.getContextIndexForViewport(
      viewport.id
    );

    return isWebGLContextLost(
      this.contextPool.getContextByIndex(contextIndex)?.context
    );
  }

  /**
   * Enables a viewport to be driven by the offscreen vtk.js rendering engine.
   *
   * @param viewportInputEntry - Information object used to
   * construct and enable the viewport.
   */
  protected enableVTKjsDrivenViewport(
    viewportInputEntry: NormalizedViewportInput
  ) {
    const viewports = this._getViewportsAsArray();
    const viewportsDrivenByVtkJs = viewports.filter(
      (vp) => viewportTypeUsesCustomRenderingPipeline(vp.type) === false
    );

    const canvasesDrivenByVtkJs = viewportsDrivenByVtkJs.map((vp) => vp.canvas);

    const canvas = getOrCreateCanvas(viewportInputEntry.element);
    updateCanvasSizeAndAspectRatio(canvas);
    canvasesDrivenByVtkJs.push(canvas);

    const internalViewportEntry = { ...viewportInputEntry, canvas };

    this.addVtkjsDrivenViewport(internalViewportEntry);
  }

  /**
   *  Adds a viewport driven by vtk.js to the `RenderingEngine`.
   *
   * Every such viewport draws through the first WebGL context of the pool.
   * The legacy stack viewport was spread over the contexts, because it never
   * showed a volume. A planar viewport can show a volume at any time after
   * its mount, also when it shows a stack at first, and the texture of a
   * volume is shared by every viewport that shows it. A texture that two
   * contexts draw is deleted and uploaded again at every switch between
   * them.
   *
   * @param viewportInputEntry - Information object used to construct and enable the viewport.
   */
  protected addVtkjsDrivenViewport(
    viewportInputEntry: InternalViewportInput
  ): void {
    const contextPool = this.ensureContextPool();
    const { element, canvas, viewportId, type, defaultOptions } =
      viewportInputEntry;

    element.tabIndex = -1;

    // Deliver touch input to cornerstone tools instead of the browser
    // (scroll, pinch-zoom, double-tap zoom). Restored in _resetViewport.
    setElementTouchActionNone(element);

    const contextIndex = 0;
    contextPool.assignViewportToContext(viewportId, contextIndex);

    // Track viewport size
    contextPool.updateViewportSize(viewportId, canvas.width, canvas.height);

    // Get the context and add the renderer
    const contextData = contextPool.getContextByIndex(contextIndex);

    const { context: offscreenMultiRenderWindow, container } = contextData;

    // Initialize the offscreen canvas size to the max size for this context
    const maxSize = contextPool.getMaxSizeForContext(contextIndex);
    // @ts-expect-error
    container.width = maxSize.width;
    // @ts-expect-error
    container.height = maxSize.height;

    offscreenMultiRenderWindow.resize();

    offscreenMultiRenderWindow.addRenderer({
      viewport: [0, 0, 1, 1],
      id: viewportId,
      background: defaultOptions.background
        ? defaultOptions.background
        : [0, 0, 0],
    });

    const viewportInput = {
      id: viewportId,
      element,
      renderingEngineId: this.id,
      type,
      canvas,
      sx: 0,
      sy: 0,
      sWidth: canvas.width,
      sHeight: canvas.height,
      defaultOptions: defaultOptions || {},
    } as ViewportInput;

    const ViewportClass = getViewportClassForInput(viewportInputEntry);

    if (!ViewportClass) {
      throw new Error(`Viewport Type ${type} is not supported`);
    }

    const viewport = new ViewportClass(viewportInput);

    this._viewports.set(viewportId, viewport as EngineViewport);

    const eventDetail: EventTypes.ElementEnabledEventDetail = {
      element,
      viewportId,
      renderingEngineId: this.id,
    };

    if (!(viewport as { suppressEvents?: boolean }).suppressEvents) {
      triggerEvent(eventTarget, Events.ELEMENT_ENABLED, eventDetail);
    }
  }

  /**
   * Sets multiple vtk.js driven viewports to
   * the `RenderingEngine`.
   *
   * @param viewportInputEntries - An array of information
   * objects used to construct and enable the viewports.
   */
  protected setVtkjsDrivenViewports(
    viewportInputEntries: NormalizedViewportInput[]
  ) {
    if (viewportInputEntries.length) {
      const vtkDrivenCanvases = viewportInputEntries.map((vp) =>
        getOrCreateCanvas(vp.element)
      );

      vtkDrivenCanvases.forEach((canvas) =>
        updateCanvasSizeAndAspectRatio(canvas)
      );

      for (let i = 0; i < viewportInputEntries.length; i++) {
        const vtkDrivenViewportInputEntry = viewportInputEntries[i];
        const canvas = vtkDrivenCanvases[i];
        const internalViewportEntry = {
          ...vtkDrivenViewportInputEntry,
          canvas,
        };

        this.addVtkjsDrivenViewport(internalViewportEntry);
      }
    }
  }

  /**
   * Returns the displayed size (in device pixels) of a viewport's container.
   *
   * For native Generic ("next") viewports the on-screen canvas returned by
   * getOrCreateCanvas (the .cornerstone-canvas / VTK target) can report
   * clientWidth/Height === 0 when the CPU render path is active and that canvas
   * is hidden in favor of the CPU canvas. Measuring from the viewport element
   * instead always reflects the real container size, so native viewports are
   * detected on container resize and their resize() (which refits the active
   * CPU/VTK canvas) actually runs.
   */
  private _getDisplayedSize(vp: EngineViewport): {
    displayedWidth: number;
    displayedHeight: number;
  } {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const sizeSource = vp.element;
    return {
      displayedWidth: Math.round(sizeSource.clientWidth * devicePixelRatio),
      displayedHeight: Math.round(sizeSource.clientHeight * devicePixelRatio),
    };
  }

  /**
   * Resizes viewports that use VTK.js for rendering.
   * Only updates the VTK offscreen size when the displayed size (canvas client size in device pixels)
   * differs from the current rendered size (canvas.width/height). The on-screen canvas dimensions
   * are updated only when the VTK render result is copied in _copyToOnscreenCanvas, avoiding
   * flicker during resize. If a render is already scheduled, resize is deferred until the next
   * resize() call.
   */
  protected _resizeVTKViewports(
    vtkDrivenViewports: EngineViewport[],
    keepCamera = true,
    immediate = true
  ) {
    // Compute target display size (pixels the canvas is actually displayed at) for each viewport
    const viewportsNeedingResize: EngineViewport[] = [];
    for (const vp of vtkDrivenViewports) {
      const canvas = getOrCreateCanvas(vp.element);
      const { displayedWidth, displayedHeight } = this._getDisplayedSize(vp);

      if (displayedWidth === 0 || displayedHeight === 0) {
        continue;
      }
      const renderedWidth = canvas.width;
      const renderedHeight = canvas.height;

      if (
        displayedWidth === renderedWidth &&
        displayedHeight === renderedHeight
      ) {
        continue;
      }
      viewportsNeedingResize.push(vp as EngineViewport);
    }

    if (viewportsNeedingResize.length === 0) {
      return;
    }

    for (const vp of viewportsNeedingResize) {
      const { displayedWidth, displayedHeight } = this._getDisplayedSize(vp);
      const targetWidth = Math.max(VIEWPORT_MIN_SIZE, displayedWidth);
      const targetHeight = Math.max(VIEWPORT_MIN_SIZE, displayedHeight);

      vp.sWidth = targetWidth;
      vp.sHeight = targetHeight;
    }

    if (this._animationFrameSet) {
      return;
    }

    if (vtkDrivenViewports.length) {
      this._resize(vtkDrivenViewports as EngineViewport[]);
    }

    vtkDrivenViewports.forEach((vp) => {
      vp.resize?.();
    });

    if (immediate) {
      this.render();
    }
  }

  /**
   * Renders all viewports.
   */
  protected _renderFlaggedViewports = (): void => {
    this._throwIfDestroyed();
    this._deferHeldViewports();

    const viewports = this._getViewportsAsArray();
    const viewportsToRender = viewports.filter(
      (vp) => this._needsRender.has(vp.id) && !this._isViewportContextLost(vp)
    );

    if (viewportsToRender.length === 0) {
      this._animationFrameSet = false;
      this._animationFrameHandle = null;
      return;
    }

    const renderStart = performance.now();

    // Render all viewports synchronously
    const eventDetails = viewportsToRender.map((viewport) => {
      const eventDetail = this.renderViewportUsingCustomOrVtkPipeline(viewport);
      viewport.setRendered();
      this._needsRender.delete(viewport.id);
      return eventDetail;
    });

    this._animationFrameSet = false;
    this._animationFrameHandle = null;

    const waiting = viewportsToRender.map((vp) =>
      this._waitsForStorage(vp, renderStart)
    );

    // Trigger all events after rendering is complete
    eventDetails.forEach((eventDetail, index) => {
      if (eventDetail?.element && !waiting[index]) {
        triggerEvent(eventDetail.element, Events.IMAGE_RENDERED, eventDetail);
      }
    });

    // Fidelity event after IMAGE_RENDERED so consumers can query the frame
    // that was just drawn.
    this._notifyFidelityOfRenderedViewports(
      viewportsToRender.filter((_vp, index) => !waiting[index])
    );
  };

  private renderViewportUsingCustomOrVtkPipeline(
    viewport: EngineViewport
  ): EventTypes.ImageRenderedEventDetail {
    // Handle custom rendering pipeline viewports
    if (viewportUsesCustomRenderingPipeline(viewport)) {
      const eventDetail =
        viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
      return eventDetail;
    }

    // If using CPU rendering, throw error
    if (!this.contextPool) {
      throw new Error(
        'GPU not available, and using a viewport with no custom render pipeline.'
      );
    }

    // Get the context assigned to this viewport
    const assignedContextIndex = this.contextPool.getContextIndexForViewport(
      viewport.id
    );

    const contextData =
      this.contextPool.getContextByIndex(assignedContextIndex);

    const { context, container } = contextData;

    const eventDetail = this._renderViewportWithContext(
      viewport,
      context,
      container
    );
    return eventDetail;
  }

  private _renderViewportWithContext(
    viewport: EngineViewport,
    offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow,
    offScreenCanvasContainer: HTMLDivElement
  ): EventTypes.ImageRenderedEventDetail {
    if (
      viewport.canvas.clientWidth === 0 ||
      viewport.canvas.clientHeight === 0
    ) {
      return;
    }
    // Check viewport size
    if (
      viewport.sWidth < VIEWPORT_MIN_SIZE ||
      viewport.sHeight < VIEWPORT_MIN_SIZE
    ) {
      log.warn('Viewport is too small', viewport.sWidth, viewport.sHeight);
      return;
    }

    if (viewportUsesCustomRenderingPipeline(viewport)) {
      return viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
    }

    if (!this.contextPool) {
      throw new Error(
        'GPU not available, and using a viewport with no custom render pipeline.'
      );
    }

    // Add renderer if not already present
    if (!offscreenMultiRenderWindow.getRenderer(viewport.id)) {
      offscreenMultiRenderWindow.addRenderer({
        viewport: [0, 0, 1, 1],
        id: viewport.id,
        background: viewport.defaultOptions?.background || [0, 0, 0],
      });
    }

    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const view = renderWindow.getViews()[0];

    const originalRenderPasses = view.getRenderPasses();

    const viewportRenderPasses = this.getViewportRenderPasses(viewport.id);

    if (viewportRenderPasses) {
      view.setRenderPasses(viewportRenderPasses);
    }

    // Update the offscreen canvas size if needed
    this._resizeOffScreenCanvasForViewport(
      viewport,
      offScreenCanvasContainer,
      offscreenMultiRenderWindow
    );

    const renderer = offscreenMultiRenderWindow.getRenderer(viewport.id);

    // Get the context index and calculate viewport specific rendering area
    const contextIndex = this.contextPool.getContextIndexForViewport(
      viewport.id
    );
    const maxSize = this.contextPool.getMaxSizeForContext(contextIndex);

    const viewportWidth = viewport.sWidth;
    const viewportHeight = viewport.sHeight;

    const xEnd = Math.min(1, viewportWidth / maxSize.width);
    const yEnd = Math.min(1, viewportHeight / maxSize.height);

    renderer.setViewport(0, 0, xEnd, yEnd);

    // Set only this renderer (and its overlay renderers) to draw.
    // Overlay renderers use the convention id = viewportId::suffix.
    const allRenderers = offscreenMultiRenderWindow.getRenderers();
    allRenderers.forEach(({ renderer: r, id }) => {
      const baseId = id.split('::')[0];
      r.setDraw(baseId === viewport.id);
    });

    // Handle widget renderers
    const widgetRenderers = this.getWidgetRenderers();
    widgetRenderers.forEach((viewportId, renderer) => {
      renderer.setDraw(viewportId === viewport.id);
    });

    renderWindow.render();

    allRenderers.forEach(({ renderer: r }) => r.setDraw(false));

    widgetRenderers.forEach((_, renderer) => {
      renderer.setDraw(false);
    });

    if (originalRenderPasses) {
      view.setRenderPasses(originalRenderPasses);
    }

    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const context = openGLRenderWindow.get3DContext();
    const offScreenCanvas = context.canvas;

    const eventDetail = this._copyToOnscreenCanvas(viewport, offScreenCanvas);

    return eventDetail;
  }

  /**
   * Renders a particular `Viewport`'s on screen canvas.
   * @param viewport - The `Viewport` to render.
   * @param offScreenCanvas - The offscreen canvas to render from.
   */
  protected _renderViewportFromVtkCanvasToOnscreenCanvas(
    viewport: EngineViewport,
    offScreenCanvas: HTMLCanvasElement
  ): EventTypes.ImageRenderedEventDetail {
    return this._copyToOnscreenCanvas(viewport, offScreenCanvas);
  }

  private _resizeOffScreenCanvasForViewport(
    viewport: EngineViewport,
    offScreenCanvasContainer: HTMLDivElement,
    offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow
  ): void {
    const contextIndex = this.contextPool.getContextIndexForViewport(
      viewport.id
    );
    if (contextIndex === undefined) {
      return;
    }

    const maxSizeChanged = this.contextPool.updateViewportSize(
      viewport.id,
      viewport.sWidth,
      viewport.sHeight
    );

    if (!maxSizeChanged) {
      return;
    }

    const maxSize = this.contextPool.getMaxSizeForContext(contextIndex);

    if (
      // @ts-expect-error
      offScreenCanvasContainer.width === maxSize.width &&
      // @ts-expect-error
      offScreenCanvasContainer.height === maxSize.height
    ) {
      return;
    }

    // @ts-expect-error
    offScreenCanvasContainer.width = maxSize.width;
    // @ts-expect-error
    offScreenCanvasContainer.height = maxSize.height;

    offscreenMultiRenderWindow.resize();
  }

  private _copyToOnscreenCanvas(
    viewport: EngineViewport,
    offScreenCanvas: HTMLCanvasElement
  ): EventTypes.ImageRenderedEventDetail {
    const {
      element,
      canvas,
      id: viewportId,
      renderingEngineId,
      suppressEvents,
    } = viewport;
    const dWidth = viewport.sWidth;
    const dHeight = viewport.sHeight;

    // Update on-screen canvas size only when the VTK render result is available,
    // so the displayed size matches the rendered size and aspect ratio without flicker.
    updateCanvasSizeAndAspectRatio(canvas, { width: dWidth, height: dHeight });

    const onScreenContext = canvas.getContext('2d');

    // Get the context index for this viewport to find the max size
    const contextIndex =
      this.contextPool.getContextIndexForViewport(viewportId);
    const maxSize = this.contextPool.getMaxSizeForContext(contextIndex);

    const sourceY = maxSize.height - dHeight;

    copyWebGLCanvasToCanvas(
      onScreenContext,
      offScreenCanvas,
      0, // Source X
      sourceY, // Source Y (copy from where VTK rendered at bottom)
      dWidth, // Source width
      dHeight, // Source height
      0, // Destination X
      0, // Destination Y
      dWidth, // Destination width
      dHeight // Destination height
    );

    return {
      element,
      suppressEvents,
      viewportId,
      renderingEngineId,
      viewportStatus: viewport.viewportStatus,
    };
  }

  private _resize(viewportsDrivenByVtkJs: EngineViewport[]): void {
    // Track which contexts need resizing
    const contextsToResize = new Set<number>();

    for (const viewport of viewportsDrivenByVtkJs) {
      viewport.sx = 0;
      viewport.sy = 0;
      // Use viewport.sWidth/sHeight (set by _resizeVTKViewports to target size); do not overwrite from canvas,
      // so that we only update the on-screen canvas when the VTK result is copied in _copyToOnscreenCanvas.

      // Get the context assigned to this viewport
      const contextIndex = this.contextPool.getContextIndexForViewport(
        viewport.id
      );

      // Update viewport size and check if max size changed
      const maxSizeChanged = this.contextPool.updateViewportSize(
        viewport.id,
        viewport.sWidth,
        viewport.sHeight
      );

      if (maxSizeChanged) {
        contextsToResize.add(contextIndex);
      }

      const contextData = this.contextPool.getContextByIndex(contextIndex);
      const { context: offscreenMultiRenderWindow } = contextData;
      const renderer = offscreenMultiRenderWindow.getRenderer(viewport.id);

      // Calculate viewport coordinates relative to the max size
      const maxSize = this.contextPool.getMaxSizeForContext(contextIndex);
      const xEnd = Math.min(1, viewport.sWidth / maxSize.width);
      const yEnd = Math.min(1, viewport.sHeight / maxSize.height);

      renderer.setViewport(0, 0, xEnd, yEnd);
    }

    // Resize contexts that had their max size change
    contextsToResize.forEach((contextIndex) => {
      const contextData = this.contextPool.getContextByIndex(contextIndex);
      if (contextData) {
        const { context: offscreenMultiRenderWindow, container } = contextData;
        const maxSize = this.contextPool.getMaxSizeForContext(contextIndex);

        // @ts-expect-error
        container.width = maxSize.width;
        // @ts-expect-error
        container.height = maxSize.height;

        offscreenMultiRenderWindow.resize();
      }
    });
  }

  private getWidgetRenderers(): Map<vtkRenderer, string> {
    const allViewports = this._getViewportsAsArray();
    const widgetRenderers = new Map();

    allViewports.forEach((vp) => {
      const widgets = vp.getWidgets ? vp.getWidgets() : [];
      widgets.forEach((widget) => {
        const renderer = widget.getRenderer ? widget.getRenderer() : null;
        if (renderer) {
          widgetRenderers.set(renderer, vp.id);
        }
      });
    });

    return widgetRenderers;
  }

  /**
   * Get the render passes for a specific viewport
   * @param viewportId - The viewport ID
   * @returns The render passes for the viewport or null
   */
  private getViewportRenderPasses(viewportId: string) {
    const viewport = this.getViewport<EngineViewport>(viewportId);
    return viewport?.getRenderPasses ? viewport.getRenderPasses() : null;
  }

  /**
   * Get the renderer for a specific viewport
   * @param viewportId - The ID of the viewport
   * @returns The vtkRenderer instance or undefined
   */
  public getRenderer(viewportId: string): vtkRenderer | undefined {
    const contextIndex =
      this.contextPool?.getContextIndexForViewport(viewportId);

    if (contextIndex === undefined || !this.contextPool) {
      return;
    }

    const contextData = this.contextPool.getContextByIndex(contextIndex);

    if (!contextData) {
      return;
    }

    const { context: offscreenMultiRenderWindow } = contextData;
    return offscreenMultiRenderWindow.getRenderer(viewportId);
  }

  /**
   * Disables the requested viewportId from the rendering engine.
   * Calls the base implementation and then handles context-specific cleanup.
   *
   * @param viewportId - viewport Id
   */
  public disableElement(viewportId: string): void {
    const viewport = this.getViewport(viewportId);
    if (!viewport) {
      return;
    }
    super.disableElement(viewportId);

    if (
      !viewportTypeUsesCustomRenderingPipeline(viewport.type) &&
      this.contextPool
    ) {
      const contextIndex =
        this.contextPool.getContextIndexForViewport(viewportId);

      if (contextIndex !== undefined) {
        const contextData = this.contextPool.getContextByIndex(contextIndex);

        if (contextData) {
          const { context: offscreenMultiRenderWindow } = contextData;
          offscreenMultiRenderWindow.removeRenderer(viewportId);
        }
      }

      this.contextPool.removeViewport(viewportId);
    }
  }

  public destroy(): void {
    super.destroy();

    if (this.contextPool) {
      this.contextPool.destroy();
    }
  }

  public getOffscreenMultiRenderWindow(
    viewportId: string
  ): VtkOffscreenMultiRenderWindow {
    if (!this.contextPool) {
      throw new Error('Offscreen multi render window is not available.');
    }

    const contextIndex =
      this.contextPool.getContextIndexForViewport(viewportId);

    if (contextIndex === undefined) {
      throw new Error(
        `Offscreen multi render window is not available for viewport ${viewportId}.`
      );
    }

    const contextData = this.contextPool.getContextByIndex(contextIndex);

    if (!contextData) {
      throw new Error(
        `Offscreen multi render window is not available for viewport ${viewportId}.`
      );
    }

    return contextData.context;
  }
}

export default ContextPoolRenderingEngine;
