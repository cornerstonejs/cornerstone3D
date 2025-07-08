import Events from '../enums/Events';
import renderingEngineCache from './renderingEngineCache';
import eventTarget from '../eventTarget';
import uuidv4 from '../utilities/uuidv4';
import triggerEvent from '../utilities/triggerEvent';
import { vtkOffscreenMultiRenderWindow } from './vtkClasses';
import ViewportType from '../enums/ViewportType';
import VolumeViewport from './VolumeViewport';
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
import VolumeViewport3D from './VolumeViewport3D';

const VIEWPORT_MIN_SIZE = 2;

class RenderingEngineSequential {
  readonly id: string;
  public hasBeenDestroyed: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public offscreenMultiRenderWindow: any;
  readonly offScreenCanvasContainer: HTMLDivElement;
  private _viewports: Map<string, IViewport>;
  private _needsRender = new Set<string>();
  private _animationFrameSet = false;
  private _animationFrameHandle: number | null = null;
  private useCPURendering: boolean;

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

  public enableElement(viewportInputEntry: PublicViewportInput): void {
    const viewportInput = this._normalizeViewportInputEntry(viewportInputEntry);

    this._throwIfDestroyed();
    const { element, viewportId } = viewportInput;

    if (!element) {
      throw new Error('No element provided');
    }

    const viewport = this.getViewport(viewportId);

    if (viewport) {
      this.disableElement(viewportId);
    }

    const { type } = viewportInput;

    const viewportUsesCustomRenderingPipeline =
      viewportTypeUsesCustomRenderingPipeline(type);

    if (!this.useCPURendering && !viewportUsesCustomRenderingPipeline) {
      this.enableVTKjsDrivenViewport(viewportInput);
    } else {
      this.addCustomViewport(viewportInput);
    }

    const canvas = getOrCreateCanvas(element);
    const { background } = viewportInput.defaultOptions;
    this.fillCanvasWithBackgroundColor(canvas, background);
  }

  public disableElement(viewportId: string): void {
    this._throwIfDestroyed();

    const viewport = this.getViewport(viewportId);

    if (!viewport) {
      console.warn(`viewport ${viewportId} does not exist`);
      return;
    }

    this._resetViewport(viewport);

    if (
      !viewportTypeUsesCustomRenderingPipeline(viewport.type) &&
      !this.useCPURendering
    ) {
      this.offscreenMultiRenderWindow.removeRenderer(viewportId);
    }

    this._removeViewport(viewportId);
    viewport.isDisabled = true;

    this._needsRender.delete(viewportId);

    const viewports = this.getViewports();
    if (!viewports.length) {
      this._clearAnimationFrame();
    }
  }

  public setViewports(publicViewportInputEntries: PublicViewportInput[]): void {
    const viewportInputEntries = this._normalizeViewportInputEntries(
      publicViewportInputEntries
    );
    this._throwIfDestroyed();
    this._reset();

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

    viewportInputEntries.forEach((vp) => {
      const canvas = getOrCreateCanvas(vp.element);
      const { background } = vp.defaultOptions;
      this.fillCanvasWithBackgroundColor(canvas, background);
    });
  }

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

  public getViewport(viewportId: string): IViewport {
    return this._viewports?.get(viewportId);
  }

  public getViewports(): IViewport[] {
    this._throwIfDestroyed();

    return this._getViewportsAsArray();
  }

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

  public getStackViewports(): IStackViewport[] {
    this._throwIfDestroyed();

    const viewports = this.getViewports();

    return viewports.filter(
      (vp) => vp instanceof StackViewport
    ) as IStackViewport[];
  }

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

  public render(): void {
    const viewports = this.getViewports();
    const viewportIds = viewports.map((vp) => vp.id);

    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  public renderFrameOfReference = (FrameOfReferenceUID: string): void => {
    const viewports = this._getViewportsAsArray();
    const viewportIdsWithSameFrameOfReferenceUID = viewports.map((vp) => {
      if (vp.getFrameOfReferenceUID() === FrameOfReferenceUID) {
        return vp.id;
      }
    });

    this.renderViewports(viewportIdsWithSameFrameOfReferenceUID);
  };

  public renderViewports(viewportIds: string[]): void {
    this._setViewportsToBeRenderedNextFrame(viewportIds);
  }

  public renderViewport(viewportId: string): void {
    this._setViewportsToBeRenderedNextFrame([viewportId]);
  }

  public destroy(): void {
    if (this.hasBeenDestroyed) {
      return;
    }

    if (!this.useCPURendering) {
      const viewports = this._getViewportsAsArray();
      viewports.forEach((vp) => {
        this.offscreenMultiRenderWindow.removeRenderer(vp.id);
      });

      this.offscreenMultiRenderWindow.delete();

      delete this.offscreenMultiRenderWindow;
    }

    this._reset();
    renderingEngineCache.delete(this.id);

    this.hasBeenDestroyed = true;
  }

  public fillCanvasWithBackgroundColor(
    canvas: HTMLCanvasElement,
    backgroundColor: [number, number, number]
  ): void {
    const ctx = canvas.getContext('2d');

    let fillStyle;
    if (backgroundColor) {
      const rgb = backgroundColor.map((f) => Math.floor(255 * f));
      fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    } else {
      fillStyle = 'black';
    }

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
    customRenderingViewports.forEach((vp) => {
      if (typeof vp.resize === 'function') {
        vp.resize();
      }
    });

    customRenderingViewports.forEach((vp) => {
      const prevCamera = vp.getCamera();
      vp.resetCamera();

      if (keepCamera) {
        vp.setCamera(prevCamera);
      }
    });

    if (immediate) {
      this.render();
    }
  }

  private _resizeVTKViewports(
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

    const internalViewportEntry = { ...viewportInputEntry, canvas };

    this.addVtkjsDrivenViewport(internalViewportEntry);
  }

  private _removeViewport(viewportId: string): void {
    const viewport = this.getViewport(viewportId);
    if (!viewport) {
      console.warn(`viewport ${viewportId} does not exist`);
      return;
    }

    this._viewports.delete(viewportId);
  }

  private addVtkjsDrivenViewport(
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

  private addCustomViewport(viewportInputEntry: PublicViewportInput): void {
    const { element, viewportId, type, defaultOptions } = viewportInputEntry;

    element.tabIndex = -1;

    const canvas = getOrCreateCanvas(element);

    const { clientWidth, clientHeight } = canvas;

    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    const viewportInput = {
      id: viewportId,
      renderingEngineId: this.id,
      element,
      type,
      canvas,
      sx: 0,
      sy: 0,
      sWidth: clientWidth,
      sHeight: clientHeight,
      defaultOptions: defaultOptions || {},
    } as ViewportInput;

    const ViewportType = viewportTypeToViewportClass[type];
    const viewport = new ViewportType(viewportInput);

    this._viewports.set(viewportId, viewport);

    const eventDetail: EventTypes.ElementEnabledEventDetail = {
      element,
      viewportId,
      renderingEngineId: this.id,
    };

    triggerEvent(eventTarget, Events.ELEMENT_ENABLED, eventDetail);
  }

  private setCustomViewports(viewportInputEntries: PublicViewportInput[]) {
    viewportInputEntries.forEach((vpie) => {
      this.addCustomViewport(vpie);
    });
  }

  private setVtkjsDrivenViewports(
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

  private _getViewportsAsArray() {
    return Array.from(this._viewports.values());
  }

  private _setViewportsToBeRenderedNextFrame(viewportIds: string[]) {
    viewportIds.forEach((viewportId) => {
      this._needsRender.add(viewportId);
    });

    this._render();
  }

  private _render() {
    if (this._needsRender.size > 0 && !this._animationFrameSet) {
      this._animationFrameHandle = window.requestAnimationFrame(
        this._renderFlaggedViewports
      );

      this._animationFrameSet = true;
    }
  }

  private _renderFlaggedViewports = () => {
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
  ): EventTypes.ImageRenderedEventDetail[] {
    let eventDetail;

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

  private _renderViewportFromVtkCanvasToOnscreenCanvas(
    viewport: IViewport,
    offScreenCanvas
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

  private _resetViewport(viewport: IViewport) {
    const renderingEngineId = this.id;

    const { element, canvas, id: viewportId } = viewport;

    const eventDetail: EventTypes.ElementDisabledEventDetail = {
      element,
      viewportId,
      renderingEngineId,
    };

    viewport.removeWidgets();

    triggerEvent(eventTarget, Events.ELEMENT_DISABLED, eventDetail);

    element.removeAttribute('data-viewport-uid');
    element.removeAttribute('data-rendering-engine-uid');

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  private _clearAnimationFrame() {
    window.cancelAnimationFrame(this._animationFrameHandle);

    this._needsRender.clear();
    this._animationFrameSet = false;
    this._animationFrameHandle = null;
  }

  private _reset() {
    const viewports = this._getViewportsAsArray();

    viewports.forEach((viewport) => {
      this._resetViewport(viewport);
    });

    this._clearAnimationFrame();

    this._viewports = new Map();
  }

  private _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      );
    }
  }
}

export default RenderingEngineSequential;
