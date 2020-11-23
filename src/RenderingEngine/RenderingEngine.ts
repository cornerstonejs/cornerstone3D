// @ts-ignore
import renderingEngineCache from './renderingEngineCache.ts';
import { vtkOffscreenMultiRenderWindow } from './vtkClasses';

// @ts-ignore
import Scene from './Scene.ts';
import { uuidv4 } from '../utils/';

interface ViewportInterface {
  canvas: HTMLCanvasElement;
  sceneUID: string;
  viewportUID: string;
  type: string;
  defaultOptions: any;
}

class RenderingEngine {
  uid: string;
  hasBeenDestroyed: boolean;
  offscreenMultiRenderWindow: any;
  webGLCanvasContainer: any;
  private _scenes: Array<Scene>;

  constructor(uid) {
    this.uid = uid ? uid : uuidv4();
    renderingEngineCache.set(uid, this);

    this.offscreenMultiRenderWindow = vtkOffscreenMultiRenderWindow.newInstance();

    const webGLCanvasContainer = document.createElement('div');

    this.webGLCanvasContainer = webGLCanvasContainer;
    this.offscreenMultiRenderWindow.setContainer(this.webGLCanvasContainer);
    this._scenes = [];

    this.hasBeenDestroyed = false;
  }

  setViewports(viewports: Array<ViewportInterface>) {
    this.throwIfDestroyed();
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
        const renderScene = () => {
          this.renderScene(sceneUID);
        };

        scene = new Scene(sceneUID, this.uid, renderScene);

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

      // vxmin, vymin, vxmax, vymax

      // TODO -> Why does this put the renders at the bottom of the canvas if they aren't max height:
      //
      // const sxDisplayCoords = sx / webglCanvasWidth;
      // const syDisplayCoords = sy / webglCanvasHeight;
      // const sWidthDisplayCoords = sWidth / webglCanvasWidth;
      // const sHeightDisplayCoords = sHeight / webglCanvasHeight;
      //
      // viewport: [
      //   sxDisplayCoords,
      //   // syDisplayCoords,
      //   syDisplayCoords,
      //   sxDisplayCoords + sWidthDisplayCoords,
      //   // syDisplayCoords + sHeightDisplayCoords,
      //   syDisplayCoords + sHeightDisplayCoords,
      // ],
      //
      // Having to add the y difference to the top feels really weird.

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

      xOffset += width;

      const renderViewport = () => {
        this.renderViewport(sceneUID, viewportUID);
      };

      scene._addViewport({
        uid: viewportUID,
        type,
        canvas,
        sx,
        sy,
        sWidth,
        sHeight,
        defaultOptions: defaultOptions || {},
        render: renderViewport,
      });
    }
  }

  resize() {
    this.throwIfDestroyed();

    const { webGLCanvasContainer, offscreenMultiRenderWindow } = this;

    const viewports = [];
    const scenes = this._scenes;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const { viewports: sceneViewports } = scene.getViewports();

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
  }

  getScene(uid) {
    this.throwIfDestroyed();

    return this._scenes.find(scene => scene.uid === uid);
  }

  // render all viewports
  render() {
    this.throwIfDestroyed();

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
      const { viewports } = scene.getViewports();

      viewports.forEach(viewport => {
        this._renderViewportToCanvas(viewport, offScreenCanvas);
      });
    }
  }

  // Render only a scene
  renderScene(sceneUID) {
    this.throwIfDestroyed();

    const { offscreenMultiRenderWindow } = this;
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    const scene = this.getScene(sceneUID);
    const { viewports } = scene.getViewports();
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

  // Render only a specific viewport
  renderViewport(sceneUID, viewportUID) {
    this.throwIfDestroyed();

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
  }

  private _renderViewportToCanvas(viewport, offScreenCanvas) {
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

    // Trigger events IMAGE_RENDERED

    // Viewport Object
  }

  private _reset() {
    this._scenes = [];
  }

  destroy() {
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

  throwIfDestroyed() {
    if (this.hasBeenDestroyed) {
      throw new Error(
        'this.destroy() has been manually called to free up memory, can not longer use this instance. Instead make a new one.'
      );
    }
  }

  debugRender() {
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
      const { viewports } = scene.getViewports();

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
