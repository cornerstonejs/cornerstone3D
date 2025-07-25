import BaseRenderingEngine, { VIEWPORT_MIN_SIZE } from './BaseRenderingEngine';
import WebGLContextPool from './WebGLContextPool';
import { getConfiguration } from '../init';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';
import ViewportType from '../enums/ViewportType';
import VolumeViewport from './VolumeViewport';
import StackViewport from './StackViewport';
import VolumeViewport3D from './VolumeViewport3D';
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline';
import getOrCreateCanvas from './helpers/getOrCreateCanvas';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';

import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
  IViewport,
} from '../types/IViewport';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { VtkOffscreenMultiRenderWindow } from '../types';

/**
 * ContextPoolRenderingEngine extends BaseRenderingEngine to provide parallel rendering
 * capabilities using multiple WebGL contexts for improved performance.
 *
 * @public
 */
class ContextPoolRenderingEngine extends BaseRenderingEngine {
  private contextPool: WebGLContextPool;

  constructor(id?: string) {
    super(id);
    const { rendering } = getConfiguration();
    const { webGlContextCount } = rendering;

    if (!this.useCPURendering) {
      this.contextPool = new WebGLContextPool(webGlContextCount);
    }
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
    canvasesDrivenByVtkJs.push(canvas);

    const internalViewportEntry = { ...viewportInputEntry, canvas };

    this.addVtkjsDrivenViewport(internalViewportEntry);
  }

  /**
   *  Adds a viewport driven by vtk.js to the `RenderingEngine`.
   *
   * @param viewportInputEntry - Information object used to construct and enable the viewport.
   */
  protected addVtkjsDrivenViewport(
    viewportInputEntry: InternalViewportInput
  ): void {
    const { element, canvas, viewportId, type, defaultOptions } =
      viewportInputEntry;

    element.tabIndex = -1;

    // Assign viewport to a context
    // Stack viewports get distributed across contexts, all others use context 0
    let contextIndex = 0;
    if (type === ViewportType.STACK) {
      const contexts = this.contextPool.getAllContexts();
      contextIndex = this._viewports.size % contexts.length;
    }
    this.contextPool.assignViewportToContext(viewportId, contextIndex);

    // Get the context and add the renderer
    const contextData = this.contextPool.getContextByIndex(contextIndex);

    const { context: offscreenMultiRenderWindow } = contextData;
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

    let viewport: IViewport;
    if (type === ViewportType.STACK) {
      viewport = new StackViewport(viewportInput);
    } else if (
      type === ViewportType.ORTHOGRAPHIC ||
      type === ViewportType.PERSPECTIVE
    ) {
      viewport = new VolumeViewport(viewportInput);
    } else if (type === ViewportType.VOLUME_3D) {
      viewport = new VolumeViewport3D(viewportInput);
    } else {
      throw new Error(`Viewport Type ${type} is not supported`);
    }

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

      vtkDrivenCanvases.forEach((canvas) => {
        const devicePixelRatio = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
      });

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
   * Resizes viewports that use VTK.js for rendering.
   */
  protected _resizeVTKViewports(
    vtkDrivenViewports: (IStackViewport | IVolumeViewport)[],
    keepCamera = true,
    immediate = true
  ) {
    const canvasesDrivenByVtkJs = vtkDrivenViewports.map(
      (vp: IStackViewport | IVolumeViewport) => {
        return getOrCreateCanvas(vp.element);
      }
    );

    canvasesDrivenByVtkJs.forEach((canvas) => {
      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    });

    if (canvasesDrivenByVtkJs.length) {
      this._resize(vtkDrivenViewports);
    }

    vtkDrivenViewports.forEach((vp: IStackViewport | IVolumeViewport) => {
      const prevCamera = vp.getCamera();
      const rotation = vp.getRotation();
      const { flipHorizontal } = prevCamera;
      vp.resetCameraForResize();

      const displayArea = vp.getDisplayArea();

      if (keepCamera) {
        if (displayArea) {
          if (flipHorizontal) {
            vp.setCamera({ flipHorizontal });
          }
          if (rotation) {
            vp.setViewPresentation({ rotation });
          }
        } else {
          vp.setCamera(prevCamera);
        }
      }
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

    const viewports = this._getViewportsAsArray();
    const viewportsToRender = viewports.filter((vp) =>
      this._needsRender.has(vp.id)
    );

    if (viewportsToRender.length === 0) {
      this._animationFrameSet = false;
      this._animationFrameHandle = null;
      return;
    }

    // Render all viewports synchronously
    const eventDetails = viewportsToRender.map((viewport) => {
      const eventDetail = this.renderViewportUsingCustomOrVtkPipeline(viewport);
      viewport.setRendered();
      this._needsRender.delete(viewport.id);
      return eventDetail;
    });

    this._animationFrameSet = false;
    this._animationFrameHandle = null;

    // Trigger all events after rendering is complete
    eventDetails.forEach((eventDetail) => {
      if (eventDetail?.element) {
        triggerEvent(eventDetail.element, Events.IMAGE_RENDERED, eventDetail);
      }
    });
  };

  private renderViewportUsingCustomOrVtkPipeline(
    viewport: IViewport
  ): EventTypes.ImageRenderedEventDetail {
    // Handle custom rendering pipeline viewports
    if (viewportTypeUsesCustomRenderingPipeline(viewport.type)) {
      const eventDetail =
        viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
      return eventDetail;
    }

    // If using CPU rendering, throw error
    if (this.useCPURendering) {
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
    viewport: IViewport,
    offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow,
    offScreenCanvasContainer: HTMLDivElement
  ): EventTypes.ImageRenderedEventDetail {
    // Check viewport size
    if (
      viewport.sWidth < VIEWPORT_MIN_SIZE ||
      viewport.sHeight < VIEWPORT_MIN_SIZE
    ) {
      console.warn('Viewport is too small', viewport.sWidth, viewport.sHeight);
      return;
    }

    if (viewportTypeUsesCustomRenderingPipeline(viewport.type)) {
      return viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
    }

    if (this.useCPURendering) {
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

    this._resizeOffScreenCanvasForViewport(
      viewport.canvas,
      offScreenCanvasContainer,
      offscreenMultiRenderWindow
    );

    const renderer = offscreenMultiRenderWindow.getRenderer(viewport.id);
    renderer.setViewport(0, 0, 1, 1);

    // Set only this renderer to draw
    const allRenderers = offscreenMultiRenderWindow.getRenderers();
    allRenderers.forEach(({ renderer: r, id }) => {
      r.setDraw(id === viewport.id);
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
    viewport: IViewport,
    offScreenCanvas: HTMLCanvasElement
  ): EventTypes.ImageRenderedEventDetail {
    return this._copyToOnscreenCanvas(viewport, offScreenCanvas);
  }

  private _resizeOffScreenCanvasForViewport(
    viewportCanvas: HTMLCanvasElement,
    offScreenCanvasContainer: HTMLDivElement,
    offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow
  ): void {
    const offScreenCanvasWidth = viewportCanvas.width;
    const offScreenCanvasHeight = viewportCanvas.height;

    if (
      // @ts-expect-error
      offScreenCanvasContainer.height === offScreenCanvasHeight &&
      // @ts-expect-error
      offScreenCanvasContainer.width === offScreenCanvasWidth
    ) {
      return;
    }

    // @ts-expect-error
    offScreenCanvasContainer.width = offScreenCanvasWidth;
    // @ts-expect-error
    offScreenCanvasContainer.height = offScreenCanvasHeight;

    offscreenMultiRenderWindow.resize();
  }

  private _copyToOnscreenCanvas(
    viewport: IViewport,
    offScreenCanvas: HTMLCanvasElement
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
      0,
      0,
      dWidth,
      dHeight,
      0,
      0,
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

  private _resize(
    viewportsDrivenByVtkJs: (IStackViewport | IVolumeViewport)[]
  ): void {
    for (const viewport of viewportsDrivenByVtkJs) {
      viewport.sx = 0;
      viewport.sy = 0;
      viewport.sWidth = viewport.canvas.width;
      viewport.sHeight = viewport.canvas.height;

      // Get the context assigned to this viewport
      const contextIndex = this.contextPool.getContextIndexForViewport(
        viewport.id
      );

      const contextData = this.contextPool.getContextByIndex(contextIndex);
      const { context: offscreenMultiRenderWindow } = contextData;
      const renderer = offscreenMultiRenderWindow.getRenderer(viewport.id);

      renderer.setViewport(0, 0, 1, 1);
    }
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
   * Get the renderer for a specific viewport
   * @param viewportId - The ID of the viewport
   * @returns The vtkRenderer instance or undefined
   */
  public getRenderer(viewportId: string): vtkRenderer | undefined {
    const contextIndex =
      this.contextPool?.getContextIndexForViewport(viewportId);

    const contextData = this.contextPool.getContextByIndex(contextIndex);

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
      !this.useCPURendering
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
    }
  }

  public destroy(): void {
    if (this.contextPool) {
      this.contextPool.destroy();
    }
    super.destroy();
  }

  public getOffscreenMultiRenderWindow(
    viewportId: string
  ): VtkOffscreenMultiRenderWindow {
    if (this.useCPURendering) {
      throw new Error(
        'Offscreen multi render window is not available when using CPU rendering.'
      );
    }

    const contextIndex =
      this.contextPool.getContextIndexForViewport(viewportId);

    const contextData = this.contextPool.getContextByIndex(contextIndex);

    return contextData.context;
  }
}

export default ContextPoolRenderingEngine;
