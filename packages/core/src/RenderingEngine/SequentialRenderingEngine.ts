import BaseRenderingEngine, { VIEWPORT_MIN_SIZE } from './BaseRenderingEngine';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';
import ViewportType from '../enums/ViewportType';
import VolumeViewport from './VolumeViewport';
import StackViewport from './StackViewport';
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline';
import getOrCreateCanvas from './helpers/getOrCreateCanvas';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import VolumeViewport3D from './VolumeViewport3D';

import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
  IViewport,
} from '../types/IViewport';

/**
 * SequentialRenderingEngine extends BaseRenderingEngine to provide a different
 * rendering strategy where viewports are rendered sequentially one at a time on the offscreen,
 * rather than all at once.
 *
 *
 * @public
 */
class SequentialRenderingEngine extends BaseRenderingEngine {
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

    this.offscreenMultiRenderWindow.addRenderer({
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
  protected _renderFlaggedViewports = () => {
    this._throwIfDestroyed();

    const viewports = this._getViewportsAsArray();
    const eventDetailArray = [];

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      if (this._needsRender.has(viewport.id)) {
        const eventDetail =
          this.renderViewportUsingCustomOrVtkPipeline(viewport);
        eventDetailArray.push(eventDetail);
        viewport.setRendered();

        this._needsRender.delete(viewport.id);

        if (this._needsRender.size === 0) {
          break;
        }
      }
    }

    this._animationFrameSet = false;
    this._animationFrameHandle = null;

    eventDetailArray.forEach((eventDetail) => {
      if (!eventDetail?.element) {
        return;
      }
      triggerEvent(eventDetail.element, Events.IMAGE_RENDERED, eventDetail);
    });
  };

  /**
   * Renders the given viewport
   * using its proffered method.
   *
   * @param viewport - The viewport to render
   */
  protected renderViewportUsingCustomOrVtkPipeline(
    viewport: IViewport
  ): EventTypes.ImageRenderedEventDetail {
    let eventDetail: EventTypes.ImageRenderedEventDetail;

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

      const { offscreenMultiRenderWindow } = this;
      const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

      this._resizeOffScreenCanvasForSingleViewport(viewport.canvas);

      const renderer = offscreenMultiRenderWindow.getRenderer(viewport.id);

      renderer.setViewport([0, 0, 1, 1]);

      const allRenderers = offscreenMultiRenderWindow.getRenderers();
      allRenderers.forEach(({ renderer: r, id }) => {
        r.setDraw(id === viewport.id);
      });

      renderWindow.render();

      allRenderers.forEach(({ renderer: r }) => r.setDraw(false));

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
  protected _renderViewportFromVtkCanvasToOnscreenCanvas(
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

  private _resizeOffScreenCanvasForSingleViewport(
    currentViewport: HTMLCanvasElement
  ): {
    offScreenCanvasWidth: number;
    offScreenCanvasHeight: number;
  } {
    const { offScreenCanvasContainer, offscreenMultiRenderWindow } = this;

    const offScreenCanvasWidth = currentViewport.width;
    const offScreenCanvasHeight = currentViewport.height;

    // @ts-expect-error
    offScreenCanvasContainer.width = offScreenCanvasWidth;
    // @ts-expect-error
    offScreenCanvasContainer.height = offScreenCanvasHeight;

    offscreenMultiRenderWindow.resize();

    return { offScreenCanvasWidth, offScreenCanvasHeight };
  }

  private _resize(
    viewportsDrivenByVtkJs: (IStackViewport | IVolumeViewport)[]
  ): void {
    for (const viewport of viewportsDrivenByVtkJs) {
      viewport.sx = 0;
      viewport.sy = 0;
      viewport.sWidth = viewport.canvas.width;
      viewport.sHeight = viewport.canvas.height;

      const renderer = this.offscreenMultiRenderWindow.getRenderer(viewport.id);
      renderer.setViewport([0, 0, 1, 1]);
    }
  }
}

export default SequentialRenderingEngine;
