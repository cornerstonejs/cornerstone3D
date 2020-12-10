import { Events as EVENTS } from './../enums/index';
import renderingEngineCache from './renderingEngineCache';
import renderingEventTarget from './renderingEventTarget';
import triggerEvent from '../utils/triggerEvent.js';
import { vtkOffscreenMultiRenderWindow } from './vtkClasses';

import Scene from './Scene';
import Viewport from './Viewport';
import { uuidv4 } from '../utils/';

/**
 * @type ViewportInputOptions
 * This type defines the shape of viewport input options, so we can throw when it is incorrect.
 */
export type ViewportInputOptions = {
  background?: Array<number>;
  orientation: {
    sliceNormal: Array<number>;
    viewUp: Array<number>;
  };
};

/**
 * @type ViewportInput
 * This type defines the shape of input, so we can throw when it is incorrect.
 */
type ViewportInput = {
  canvas: HTMLCanvasElement;
  sceneUID: string;
  viewportUID: string;
  type: string;
  defaultOptions: ViewportInputOptions;
};

/**
 * @class RenderingEngine
 *
 * A RenderingEngine takes care of the full pipeline of creating viewports and rendering
 * them on a large offscreen canvas and transmitting this data back to the screen. This allows us
 * to leverage the power of vtk.js whilst only using one WebGL context for the processing, and allowing
 * us to share texture memory across on-screen viewports that show the same data.
 */
class RenderingEngine {
  readonly uid: string;
  public hasBeenDestroyed: boolean;
  offscreenMultiRenderWindow: any;
  readonly webGLCanvasContainer: any;
  private _scenes: Array<Scene>;

  constructor(uid) {
    this.uid = uid ? uid : uuidv4();
    renderingEngineCache.set(this);

    this.offscreenMultiRenderWindow = vtkOffscreenMultiRenderWindow.newInstance();

    const webGLCanvasContainer = document.createElement('div');

    this.webGLCanvasContainer = webGLCanvasContainer;
    this.offscreenMultiRenderWindow.setContainer(this.webGLCanvasContainer);
    this._scenes = [];

    this.hasBeenDestroyed = false;
  }

  /**
   * @method setViewports Creates `Scene`s containing `Viewport`s and sets up the offscreen
   * render window to allow offscreen rendering and transmission back to the target canvas in each viewport.
   * @param {Array<ViewportInput>} viewports An array of viewport definitons to construct the rendering engine
   *
   */
  public setViewports(viewports: Array<ViewportInput>) {
    this._throwIfDestroyed();
    this._reset();

    const { webGLCanvasContainer, offscreenMultiRenderWindow } = this;

    // Set canvas size based on height and sum of widths
    const webglCanvasHeight = Math.max(
      ...viewports.map(vp => vp.canvas.clientHeight)
    );

    let webglCanvasWidth = 0;

    viewports.forEach(vp => {
      webglCanvasWidth += vp.canvas.clientWidth;
    });

    webGLCanvasContainer.width = webglCanvasWidth;
    webGLCanvasContainer.height = webglCanvasHeight;

    offscreenMultiRenderWindow.resize();

    let xOffset = 0;

    for (let i = 0; i < viewports.length; i++) {
      const { canvas, sceneUID, viewportUID, type, defaultOptions } = viewports[
        i
      ];

      const { clientWidth, clientHeight } = canvas;

      // Set the canvas to be same resolution as the client.
      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
      }

      const { width, height } = canvas;

      let scene = this.getScene(sceneUID);

      if (!scene) {
        scene = new Scene(sceneUID, this.uid);

        this._scenes.push(scene);
      }

      // viewport location on source (offscreen) canvas
      const sx = xOffset;
      const sy = 0;
      const sWidth = width;
      const sHeight = height;

      // Calculate the position of the renderer in viewport coordinates
      const sxDisplayCoords = sx / webglCanvasWidth;

      // Need to offset y if it not max height
      const syDisplayCoords =
        sy + (webglCanvasHeight - height) / webglCanvasHeight;

      const sWidthDisplayCoords = sWidth / webglCanvasWidth;
      const sHeightDisplayCoords = sHeight / webglCanvasHeight;

      offscreenMultiRenderWindow.addRenderer({
        viewport: [
          sxDisplayCoords,
          syDisplayCoords,
          sxDisplayCoords + sWidthDisplayCoords,
          syDisplayCoords + sHeightDisplayCoords,
        ],
        uid: viewportUID,
        background: defaultOptions.background
          ? defaultOptions.background
          : [0, 0, 0],
      });

      scene.addViewport({
        uid: viewportUID,
        type,
        canvas,
        sx,
        sy,
        sWidth,
        sHeight,
        defaultOptions: defaultOptions || {},
      });

      xOffset += width;

      const eventData = {
        canvas,
        viewportUID,
        sceneUID,
        renderingEngineUID: this.uid,
      };

      triggerEvent(renderingEventTarget, EVENTS.ELEMENT_ENABLED, eventData);
    }
  }

  /**
   * @method resize Resizes the offscreen viewport and recalculates translations to on screen canvases.
   * It is up to the parent app to call the size of the on-screen canvas changes.
   * This is left as an app level concern as one might want to debounce the changes, or the like.
   */
  public resize() {
    this._throwIfDestroyed();

    const { webGLCanvasContainer, offscreenMultiRenderWindow } = this;

    const viewports = [];
    const scenes = this._scenes;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneViewports = scene.getViewports();

      viewports.push(...sceneViewports);
    }

    // Set canvas size based on height and sum of widths
    const webglCanvasHeight = Math.max(
      ...viewports.map(vp => vp.canvas.clientHeight)
    );

    let webglCanvasWidth = 0;

    viewports.forEach(vp => {
      webglCanvasWidth += vp.canvas.clientWidth;
    });

    webGLCanvasContainer.width = webglCanvasWidth;
    webGLCanvasContainer.height = webglCanvasHeight;

    offscreenMultiRenderWindow.resize();

    // Redefine viewport properties
    let xOffset = 0;

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      const { canvas, uid: viewportUID } = viewport;
      const { clientWidth, clientHeight } = canvas;

      // Set the canvas to be same resolution as the client.
      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
      }

      // Update the canvas drawImage offsets.
      const sx = xOffset;
      const sy = 0;
      const sWidth = clientWidth;
      const sHeight = clientHeight;

      viewport.sx = sx;
      viewport.sy = sy;
      viewport.sWidth = sWidth;
      viewport.sHeight = sHeight;

      // Set the viewport of the vtkRenderer
      const renderer = offscreenMultiRenderWindow.getRenderer(viewportUID);

      const sxDisplayCoords = sx / webglCanvasWidth;

      // Need to offset y if it not max height
      const syDisplayCoords =
        sy + (webglCanvasHeight - clientHeight) / webglCanvasHeight;

      const sWidthDisplayCoords = sWidth / webglCanvasWidth;
      const sHeightDisplayCoords = sHeight / webglCanvasHeight;

      renderer.setViewport([
        sxDisplayCoords,
        syDisplayCoords,
        sxDisplayCoords + sWidthDisplayCoords,
        syDisplayCoords + sHeightDisplayCoords,
      ]);

      xOffset += clientWidth;
    }

    this.render();
  }

  /**
   * @method getScene Returns the scene.
   * @param {string} uid The UID of the scene to fetch.
   *
   * @returns {Scene} The scene object.
   */
  public getScene(uid: string): Scene {
    this._throwIfDestroyed();

    return this._scenes.find(scene => scene.uid === uid);
  }

  /**
   * @method getScenes Returns an array of all `Scene`s on the `RenderingEngine` instance.
   *
   * @returns {Scene} The scene object.
   */
  public getScenes(): Array<Scene> {
    this._throwIfDestroyed();

    return this._scenes;
  }

  /**
   * @method getViewports Returns an array of all `Viewport`s on the `RenderingEngine` instance.
   *
   * @returns {Viewport} The scene object.
   */
  public getViewports() {
    this._throwIfDestroyed();

    const scenes = this._scenes;
    const numScenes = scenes.length;
    const viewports = [];

    for (let s = 0; s < numScenes; s++) {
      const scene = scenes[s];
      const sceneViewports = scene.getViewports();

      viewports.push(...sceneViewports);
    }

    return viewports;
  }

  /**
   * @method render Renders all viewports on the next animation frame.
   */
  public render() {
    window.requestAnimationFrame(this._render);
  }

  /**
   * @method _render Renders all viewports.
   */
  private _render = () => {
    this._throwIfDestroyed();

    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const renderers = offscreenMultiRenderWindow.getRenderers();

    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(true);
    }

    renderWindow.render();

    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const context = openGLRenderWindow.get3DContext();

    const offScreenCanvas = context.canvas;
    const scenes = this._scenes;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const viewports = scene.getViewports();

      viewports.forEach(viewport => {
        this._renderViewportToCanvas(viewport, offScreenCanvas);
      });
    }
  };

  /**
   * @method renderScene Renders only a specific `Scene` on the next animation frame.
   *
   * @param {string} sceneUID The UID of the scene to render.
   */
  public renderScene(sceneUID: string) {
    const renderParticularScene = () => this._renderScene(sceneUID);

    window.requestAnimationFrame(renderParticularScene);
  }

  public renderFrameOfReference = FrameOfReferenceUID => {
    const scenes = this._scenes;

    const scenesWithFrameOfReferenceUID = scenes.filter(
      s => s.getFrameOfReferenceUID() === FrameOfReferenceUID
    );

    const renderSetOfScenes = () =>
      this._renderScenes(scenesWithFrameOfReferenceUID);

    window.requestAnimationFrame(renderSetOfScenes);
  };

  public renderScenes(sceneUIDs: Array<string>) {
    const scenes = sceneUIDs.map(sUid => this.getScene(sUid));
    const renderSetOfScenes = () => this._renderScenes(scenes);

    window.requestAnimationFrame(renderSetOfScenes);
  }

  public renderViewports(viewportUIDs: Array<string>) {
    const scenes = this._scenes;

    const viewportToRender = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const viewports = scene.getViewports();

      viewports.forEach(vp => {
        if (viewportUIDs.includes(vp.uid)) {
          viewportToRender.push(vp);
        }
      });
    }

    const renderSetOfViewports = () => this._renderViewports(viewportToRender);

    window.requestAnimationFrame(renderSetOfViewports);
  }

  private _renderViewports(viewports: Array<Viewport>) {
    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const viewportUIDs = viewports.map(vp => vp.uid);
    const renderers = offscreenMultiRenderWindow.getRenderers();

    for (let i = 0; i < renderers.length; i++) {
      const { renderer, uid } = renderers[i];
      renderer.setDraw(viewportUIDs.includes(uid));
    }

    renderWindow.render();

    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const context = openGLRenderWindow.get3DContext();

    const offScreenCanvas = context.canvas;

    viewports.forEach(viewport => {
      this._renderViewportToCanvas(viewport, offScreenCanvas);
    });
  }

  private _renderScenes(scenes: Array<Scene>) {
    this._throwIfDestroyed();

    const viewportsToRender = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const viewports = scene.getViewports();
      viewportsToRender.push(...viewports);
    }

    this._renderViewports(viewportsToRender);
  }

  /**
   * @method _renderScene Renders only a specific `Scene`.
   *
   * @param {string} sceneUID The UID of the scene to render.
   */
  private _renderScene = (sceneUID: string) => {
    this._throwIfDestroyed();

    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const scene = this.getScene(sceneUID);
    const viewports = scene.getViewports();
    const viewportUIDs = viewports.map(vp => vp.uid);

    const renderers = offscreenMultiRenderWindow.getRenderers();

    for (let i = 0; i < renderers.length; i++) {
      const { renderer, uid } = renderers[i];
      renderer.setDraw(viewportUIDs.includes(uid));
    }

    renderWindow.render();

    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const context = openGLRenderWindow.get3DContext();

    const offScreenCanvas = context.canvas;

    viewports.forEach(viewport => {
      this._renderViewportToCanvas(viewport, offScreenCanvas);
    });
  };

  /**
   * @method renderViewport Renders only a specific `Viewport` on the next animation frame.
   *
   * @param {string} sceneUID The UID of the scene the viewport belongs to.
   * @param {string} viewportUID The UID of the viewport.
   */
  public renderViewport(sceneUID: string, viewportUID: string) {
    const renderParticularViewport = () =>
      this._renderViewport(sceneUID, viewportUID);

    window.requestAnimationFrame(renderParticularViewport);
  }

  /**
   * @method _renderViewport Renders only a specific `Viewport`.
   *
   * @param {string} sceneUID The UID of the scene the viewport belongs to.
   * @param {string} viewportUID The UID of the viewport.
   */
  private _renderViewport = (sceneUID: string, viewportUID: string) => {
    this._throwIfDestroyed();

    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const scene = this.getScene(sceneUID);
    const viewport = scene.getViewport(viewportUID);

    const renderers = offscreenMultiRenderWindow.getRenderers();

    for (let i = 0; i < renderers.length; i++) {
      const { renderer, uid } = renderers[i];
      renderer.setDraw(viewportUID === uid);
    }

    renderWindow.render();

    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const context = openGLRenderWindow.get3DContext();

    const offScreenCanvas = context.canvas;

    this._renderViewportToCanvas(viewport, offScreenCanvas);
  };

  /**
   * @method _renderViewportToCanvas Renders a particular `Viewport`'s on screen canvas.
   * @param {Viewport} viewport The `Viewport` to rendfer.
   * @param {object} offScreenCanvas The offscreen canvas to render from.
   */
  private _renderViewportToCanvas(viewport: Viewport, offScreenCanvas) {
    const {
      sx,
      sy,
      sWidth,
      sHeight,
      uid,
      sceneUID,
      renderingEngineUID,
    } = viewport;

    const canvas = <HTMLCanvasElement>viewport.canvas;
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

    const eventData = {
      canvas,
      viewportUID: uid,
      sceneUID,
      renderingEngineUID,
    };

    triggerEvent(canvas, EVENTS.IMAGE_RENDERED, eventData);
  }

  /**
   * @method _reset Resets the `RenderingEngine`
   */
  private _reset() {
    const scenes = this.getScenes();
    const renderingEngineUID = this.uid;

    scenes.forEach(scene => {
      const viewports = scene.getViewports();

      const sceneUID = scene.uid;

      viewports.forEach(viewport => {
        const { canvas, uid: viewportUID } = viewport;

        const eventData = {
          canvas,
          viewportUID,
          sceneUID,
          renderingEngineUID,
        };

        canvas.removeAttribute('data-viewport-uid');
        canvas.removeAttribute('data-scene-uid');
        canvas.removeAttribute('data-rendering-engine-uid');

        triggerEvent(renderingEventTarget, EVENTS.ELEMENT_DISABLED, eventData);
      });
    });

    this._scenes = [];
  }

  /**
   * @method destory
   */
  public destroy() {
    if (this.hasBeenDestroyed) {
      return;
    }

    this._reset();

    // Free up WebGL resources
    this.offscreenMultiRenderWindow.delete();

    renderingEngineCache.delete(this.uid);

    // Make sure all references go stale and are garbage collected.
    delete this.offscreenMultiRenderWindow;

    this.hasBeenDestroyed = true;
  }

  /**
   * @method _throwIfDestroyed Throws an error if trying to interact with the `RenderingEngine`
   * instance after its `destroy` method has been called.
   */
  private _throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      );
    }
  }

  _debugRender() {
    // Renders all scenes
    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const renderers = offscreenMultiRenderWindow.getRenderers();

    for (let i = 0; i < renderers.length; i++) {
      renderers[i].renderer.setDraw(true);
    }

    renderWindow.render();
    const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const context = openGLRenderWindow.get3DContext();

    const offScreenCanvas = context.canvas;
    const dataURL = offScreenCanvas.toDataURL();
    const scenes = this._scenes;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const viewports = scene.getViewports();

      viewports.forEach(viewport => {
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
    }

    _TEMPDownloadURI(dataURL);
  }
}

export default RenderingEngine;

function _TEMPDownloadURI(uri) {
  const link = document.createElement('a');

  link.download = 'viewport.png';
  link.href = uri;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
