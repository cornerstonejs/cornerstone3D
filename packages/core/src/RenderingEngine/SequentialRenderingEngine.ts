import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';
import ViewportType from '../enums/ViewportType';
import VolumeViewport from './VolumeViewport';
import StackViewport from './StackViewport';
import getOrCreateCanvas from './helpers/getOrCreateCanvas';
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline';
import BaseRenderingEngine from './BaseRenderingEngine';
import VolumeViewport3D from './VolumeViewport3D';

import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
  IViewport,
} from '../types/IViewport';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';

class SequentialRenderingEngine extends BaseRenderingEngine {
  public resize(immediate = true, keepCamera = true): void {
    this._throwIfDestroyed();
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

    let viewport;
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

  protected _performRender(): void {}

  /**
   * Renders VTK viewport - sequential rendering resizes canvas and draws individually
   */
  protected _renderVtkViewport(
    viewport: IViewport
  ): EventTypes.ImageRenderedEventDetail {
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

    return this._renderViewportFromVtkCanvasToOnscreenCanvas(
      viewport,
      offScreenCanvas,
      0,
      0,
      viewport.canvas.width,
      viewport.canvas.height
    );
  }
}

export default SequentialRenderingEngine;
