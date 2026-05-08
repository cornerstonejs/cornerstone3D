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
import { vtkOffscreenMultiRenderWindow } from './vtkClasses';

import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
  IViewport,
} from '../types/IViewport';

interface ViewportDisplayCoords {
  sxStartDisplayCoords: number;
  syStartDisplayCoords: number;
  sxEndDisplayCoords: number;
  syEndDisplayCoords: number;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

/**
 * A RenderingEngine takes care of the full pipeline of creating viewports and rendering
 * them on a large offscreen canvas and transmitting this data back to the screen. This allows us
 * to leverage the power of vtk.js whilst only using one WebGL context for the processing, and allowing
 * us to share texture memory across on-screen viewports that show the same data.
 *
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
 *
 * RenderingEngine checks for WebGL context availability to determine if GPU rendering is possible.
 * If a WebGL context is not available, RenderingEngine will fall back to CPU rendering for StackViewports.
 * However, for volume rendering, GPU availability is required, and an error will be thrown if attempted without GPU support.
 *
 * By default, RenderingEngine will use the vtk.js-enabled pipeline for rendering viewports.
 * However, if a custom rendering pipeline is specified by a custom viewport, it will be used instead.
 * We use this custom pipeline to render a StackViewport on CPU using the Cornerstone legacy CPU rendering pipeline.
 *
 * @public
 */
class TiledRenderingEngine extends BaseRenderingEngine {
  constructor(id?: string) {
    super(id);

    if (!this.useCPURendering) {
      this.offscreenMultiRenderWindow =
        vtkOffscreenMultiRenderWindow.newInstance();
      this.offScreenCanvasContainer = document.createElement('div');
      this.offscreenMultiRenderWindow.setContainer(
        this.offScreenCanvasContainer
      );
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

    // 2.c Calculating the new size for offScreen Canvas
    const { offScreenCanvasWidth, offScreenCanvasHeight } =
      this._resizeOffScreenCanvas(canvasesDrivenByVtkJs);

    // 2.d Re-position previous viewports on the offScreen Canvas based on the new
    // offScreen canvas size
    const xOffset = this._resize(
      viewportsDrivenByVtkJs as (IStackViewport | IVolumeViewport)[],
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
   *  Adds a viewport driven by vtk.js to the `RenderingEngine`.
   *
   * @param viewportInputEntry - Information object used to construct and enable the viewport.
   * @param options - Options object used to configure the viewport.
   * @param options.offScreenCanvasWidth - The width of the offscreen canvas.
   * @param options.offScreenCanvasHeight - The height of the offscreen canvas.
   * @param options.xOffset - The x offset of the viewport on the offscreen canvas.
   */
  protected addVtkjsDrivenViewport(
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
    const viewportInput = {
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
    } as ViewportInput;

    // 4. Create a proper viewport based on the type of the viewport
    let viewport: IViewport;
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
   * Sets multiple vtk.js driven viewports to
   * the `RenderingEngine`.
   *
   * @param viewportInputEntries - An array of information
   * objects used to construct and enable the viewports.
   */
  protected setVtkjsDrivenViewports(
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
   * Resizes viewports that use VTK.js for rendering.
   */
  protected _resizeVTKViewports(
    vtkDrivenViewports: (IStackViewport | IVolumeViewport)[],
    keepCamera = true,
    immediate = true
  ) {
    // Ensure all the canvases are ready for rendering
    const canvasesDrivenByVtkJs = vtkDrivenViewports.map(
      (vp: IStackViewport | IVolumeViewport) => {
        return getOrCreateCanvas(vp.element);
      }
    );

    // reset the canvas size to the client size
    canvasesDrivenByVtkJs.forEach((canvas) => {
      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    });

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
      const prevCamera = vp.getCamera();
      const rotation = vp.getRotation();
      const { flipHorizontal } = prevCamera;
      vp.resetCameraForResize();

      const displayArea = vp.getDisplayArea();

      // TODO - make this use get/set Presentation or in some way preserve the
      // basic presentation info on this viewport, rather than preserving camera
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

    // 4. If render is immediate: Render all
    if (immediate) {
      this.render();
    }
  }

  /**
   * Renders all viewports.
   */
  protected _renderFlaggedViewports = () => {
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
  protected renderViewportUsingCustomOrVtkPipeline(
    viewport: IViewport
  ): EventTypes.ImageRenderedEventDetail {
    let eventDetail: EventTypes.ImageRenderedEventDetail;

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
  protected _renderViewportFromVtkCanvasToOnscreenCanvas(
    viewport: IViewport,
    offScreenCanvas: HTMLCanvasElement
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
      viewportStatus: viewport.viewportStatus,
    };
  }

  /**
   * Resizes the offscreen canvas based on the provided vtk.js driven canvases.
   *
   * @param canvases - An array of HTML Canvas
   */
  private _resizeOffScreenCanvas(canvasesDrivenByVtkJs: HTMLCanvasElement[]): {
    offScreenCanvasWidth: number;
    offScreenCanvasHeight: number;
  } {
    const { offScreenCanvasContainer, offscreenMultiRenderWindow } = this;

    // 1. Calculated the height of the offScreen canvas to be the maximum height
    // between canvases
    const offScreenCanvasHeight = Math.max(
      ...canvasesDrivenByVtkJs.map((canvas) => canvas.height)
    );

    // 2. Calculating the width of the offScreen canvas to be the sum of all
    let offScreenCanvasWidth = 0;

    canvasesDrivenByVtkJs.forEach((canvas) => {
      offScreenCanvasWidth += canvas.width;
    });

    // @ts-expect-error
    offScreenCanvasContainer.width = offScreenCanvasWidth;
    // @ts-expect-error
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
    viewportsDrivenByVtkJs: (IStackViewport | IVolumeViewport)[],
    offScreenCanvasWidth: number,
    offScreenCanvasHeight: number
  ): number {
    // Redefine viewport properties
    let _xOffset = 0;

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
        viewport as IViewport,
        offScreenCanvasWidth,
        offScreenCanvasHeight,
        _xOffset
      );

      _xOffset += viewport.canvas.width;

      viewport.sx = sx;
      viewport.sy = sy;
      viewport.sWidth = sWidth;
      viewport.sHeight = sHeight;

      // Updating the renderer for the viewport
      const renderer = this.offscreenMultiRenderWindow.getRenderer(viewport.id);
      renderer.setViewport(
        sxStartDisplayCoords,
        syStartDisplayCoords,
        sxEndDisplayCoords,
        syEndDisplayCoords
      );
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
    viewport: InternalViewportInput | IViewport,
    offScreenCanvasWidth: number,
    offScreenCanvasHeight: number,
    _xOffset: number
  ): ViewportDisplayCoords {
    const { canvas } = viewport;
    const { width: sWidth, height: sHeight } = canvas;

    // Update the canvas drawImage offsets.
    const sx = _xOffset;
    const sy = 0;

    const sxStartDisplayCoords = sx / offScreenCanvasWidth;

    // Need to offset y if it not max height
    const syStartDisplayCoords =
      sy + (offScreenCanvasHeight - sHeight) / offScreenCanvasHeight;

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
}

export default TiledRenderingEngine;
