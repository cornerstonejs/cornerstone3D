import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';

import BaseRenderingEngine, { VIEWPORT_MIN_SIZE } from './BaseRenderingEngine';
import viewportTypeUsesCustomRenderingPipeline from './helpers/viewportTypeUsesCustomRenderingPipeline';
import getOrCreateCanvas from './helpers/getOrCreateCanvas';
import viewportTypeToViewportClass from './helpers/viewportTypeToViewportClass';
import { vtkStreamingOpenGLRenderWindow } from './vtkClasses';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';

import type * as EventTypes from '../types/EventTypes';
import type {
  ViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
  IViewport,
} from '../types/IViewport';
import type IStackViewport from '../types/IStackViewport';
import type IVolumeViewport from '../types/IVolumeViewport';

interface DirectViewportContext {
  renderWindow: vtkRenderWindow;
  openGLRenderWindow: vtkOpenGLRenderWindow;
  renderer: vtkRenderer;
}

class DirectRenderingEngine extends BaseRenderingEngine {
  private viewportContexts = new Map<string, DirectViewportContext>();

  constructor(id?: string) {
    super(id);
  }

  protected enableVTKjsDrivenViewport(
    viewportInputEntry: NormalizedViewportInput
  ) {
    const canvas = getOrCreateCanvas(viewportInputEntry.element);
    const devicePixelRatio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;

    const internalViewportEntry = { ...viewportInputEntry, canvas };
    this.addVtkjsDrivenViewport(internalViewportEntry);
  }

  protected addVtkjsDrivenViewport(
    viewportInputEntry: InternalViewportInput
  ): void {
    const { element, canvas, viewportId, type, defaultOptions } =
      viewportInputEntry;

    element.tabIndex = -1;

    const renderWindow = vtkRenderWindow.newInstance();
    const openGLRenderWindow = vtkStreamingOpenGLRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance();

    renderWindow.addView(openGLRenderWindow);
    renderWindow.addRenderer(renderer);

    openGLRenderWindow.setCanvas(canvas);
    openGLRenderWindow.setSize(canvas.width, canvas.height);

    renderer.setBackground(
      defaultOptions.background ? defaultOptions.background : [0, 0, 0]
    );

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

    const ViewportType = viewportTypeToViewportClass[type];
    if (!ViewportType) {
      throw new Error(`Viewport Type ${type} is not supported`);
    }

    this.viewportContexts.set(viewportId, {
      renderWindow,
      openGLRenderWindow,
      renderer,
    });

    const viewport = new ViewportType(viewportInput);

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
    if (!viewportInputEntries.length) {
      return;
    }

    viewportInputEntries.forEach((vp) => {
      const canvas = getOrCreateCanvas(vp.element);
      const devicePixelRatio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;

      const internalViewportEntry = { ...vp, canvas };
      this.addVtkjsDrivenViewport(internalViewportEntry);
    });
  }

  protected _resizeVTKViewports(
    vtkDrivenViewports: (IStackViewport | IVolumeViewport)[],
    keepCamera = true,
    immediate = true
  ) {
    vtkDrivenViewports.forEach((vp) => {
      const canvas = getOrCreateCanvas(vp.element);
      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;

      vp.sx = 0;
      vp.sy = 0;
      vp.sWidth = canvas.width;
      vp.sHeight = canvas.height;

      const context = this.viewportContexts.get(vp.id);
      context?.openGLRenderWindow.setSize(canvas.width, canvas.height);
    });

    vtkDrivenViewports.forEach((vp) => {
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

  private renderViewportUsingCustomOrVtkPipeline(
    viewport: IViewport
  ): EventTypes.ImageRenderedEventDetail {
    if (
      viewport.sWidth < VIEWPORT_MIN_SIZE ||
      viewport.sHeight < VIEWPORT_MIN_SIZE
    ) {
      console.warn('Viewport is too small', viewport.sWidth, viewport.sHeight);
      return;
    }

    if (viewportTypeUsesCustomRenderingPipeline(viewport.type) === true) {
      return viewport.customRenderViewportToCanvas() as EventTypes.ImageRenderedEventDetail;
    }

    if (this.useCPURendering) {
      throw new Error(
        'GPU not available, and using a viewport with no custom render pipeline.'
      );
    }

    const context = this.viewportContexts.get(viewport.id);
    if (!context) {
      throw new Error(`No rendering context found for viewport ${viewport.id}`);
    }

    const { renderWindow, openGLRenderWindow } = context;
    const originalRenderPasses = openGLRenderWindow.getRenderPasses();
    const viewportRenderPasses = viewport.getRenderPasses
      ? viewport.getRenderPasses()
      : null;

    if (viewportRenderPasses) {
      openGLRenderWindow.setRenderPasses(viewportRenderPasses);
    }

    renderWindow.render();

    if (originalRenderPasses) {
      openGLRenderWindow.setRenderPasses(originalRenderPasses);
    }

    const {
      element,
      id: viewportId,
      renderingEngineId,
      suppressEvents,
    } = viewport;

    return {
      element,
      suppressEvents,
      viewportId,
      renderingEngineId,
      viewportStatus: viewport.viewportStatus,
    } as EventTypes.ImageRenderedEventDetail;
  }

  public getRenderer(viewportId: string): vtkRenderer | undefined {
    return this.viewportContexts.get(viewportId)?.renderer;
  }

  public disableElement(viewportId: string): void {
    const viewport = this.getViewport(viewportId);
    if (!viewport) {
      return;
    }
    super.disableElement(viewportId);

    const context = this.viewportContexts.get(viewportId);
    if (context) {
      context.renderWindow.delete();
      context.openGLRenderWindow.delete();
      context.renderer.delete();
      this.viewportContexts.delete(viewportId);
    }
  }

  public destroy(): void {
    if (this.hasBeenDestroyed) {
      return;
    }
    super.destroy();

    this.viewportContexts.forEach((context) => {
      context.renderWindow.delete();
      context.openGLRenderWindow.delete();
      context.renderer.delete();
    });

    this.viewportContexts.clear();
  }

  public getOffscreenMultiRenderWindow(): never {
    throw new Error(
      'Offscreen multi render window is not available in direct rendering mode.'
    );
  }

  public fillCanvasWithBackgroundColor(
    _canvas: HTMLCanvasElement,
    _backgroundColor: [number, number, number]
  ): void {
    // No-op: avoid creating a 2D context on a WebGL canvas.
  }
}

export default DirectRenderingEngine;
