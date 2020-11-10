import vtkOffscreenMultiRenderWindow from './vtkOffscreenMultiRenderWindow';

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

// export interface ImageVolumeInterface {
//   uid: string;
//   metadata: object;
//   dimensions: Array<number>;
//   spacing: Array<number>;
//   origin: Array<number>;
//   direction: Array<number>;
//   vtkImageData: object;
//   scalarData: Float32Array | Uint8Array;
// }

// Need to have multiple canvases to viewport

class RenderingEngine {
  uid: string;
  offscreenMultiRenderWindow: any;
  webGLCanvasContainer: any;
  private _scenes: Array<Scene>;

  constructor(uid) {
    this.uid = uid ? uid : uuidv4();

    this.offscreenMultiRenderWindow = vtkOffscreenMultiRenderWindow.newInstance();

    const webGLCanvasContainer = document.createElement('div');

    // TODO -> Keeping this here for now incase we need it. For vtkGenericRenderWindow it was necessary,
    // But I don't think it is now, but might be hit further down the chain.
    // In any case if its an issue we should make new versions of those vtk classes instead.

    // Emulate this component being on screen, as vtk.js checks this everywhere.
    // We could eventually change this upstream.
    //@ts-ignore // We are making this into not a strict div element with the hack.
    // webGLCanvasContainer.getBoundingClientRect = () => {
    //   //@ts-ignore // We are making this into not a strict div element with the hack.
    //   const { width, height } = webGLCanvasContainer;

    //   return {
    //     x: 0,
    //     y: 0,
    //     top: 0,
    //     left: 0,
    //     bottom: width,
    //     right: height,
    //     width: width,
    //     height: height,
    //   };
    // };

    this.webGLCanvasContainer = webGLCanvasContainer;
    this.offscreenMultiRenderWindow.setContainer(this.webGLCanvasContainer);
    this._scenes = [];
  }

  setViewports(viewports: Array<ViewportInterface>) {
    this.reset();

    const { webGLCanvasContainer, offscreenMultiRenderWindow } = this;

    // Set canvas size based on height
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

    // const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();

    // const size = openGLRenderWindow.getContainerSize();

    // // Awesome!
    // const context = openGLRenderWindow.get3DContext();

    console.log('offscreenMultiRenderWindow:');
    console.log(offscreenMultiRenderWindow);

    let xOffset = 0;

    // debug

    const colors = [
      [1.0, 0.0, 0.0],
      [0.0, 1.0, 0.0],
      [0.0, 0.0, 1.0],
    ];

    for (let i = 0; i < viewports.length; i++) {
      const { canvas, sceneUID, viewportUID, type, defaultOptions } = viewports[
        i
      ];
      //@ts-ignore
      const { width, height, clientWidth, clientHeight } = canvas;

      // Set the canvas to be same resolution as the client.
      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
      }

      let scene = this.getScene(sceneUID);

      if (!scene) {
        const renderScene = () => {
          this.renderScene(sceneUID);
        };

        scene = new Scene(sceneUID, renderScene);

        this._scenes.push(scene);
      }

      const sx = xOffset;
      const sy = 0;
      const sWidth = width;
      const sHeight = height;

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

      const sxDisplayCoords = sx / webglCanvasWidth;
      const syDisplayCoords = sy / webglCanvasHeight;
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
        // TEMP
        background: colors[i],
        // TEMP
      });

      xOffset += width;
    }

    const renderers = offscreenMultiRenderWindow.getRenderers();

    console.log(renderers);

    // Make renderers.
    // Add renderers to render window.
    // Place renderers and store offset and width height in the render window.
  }

  resize(viewportSizes) {
    // viewportSizes === [{uid, width, height}]
    // TODO: resize the vtkOffscreenMultiRenderWindow and the each of its renderers.
    // TODO: Update sx,sy,sWidth and sHeight for these viewports.
  }

  getScene(uid) {
    return this._scenes.find(scene => scene.uid === uid);
  }

  // render all viewports
  render() {
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

  _renderViewportToCanvas(viewport, offScreenCanvas) {
    const { sx, sy, sWidth, sHeight } = viewport;

    const canvas = <HTMLCanvasElement>viewport.canvas;
    const { width: dWidth, height: dHeight } = canvas;

    // @ts-ignore // deal with in a sec
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
  }

  reset() {
    // TODO: In the future need actual VTK cleanup.

    this._scenes = [];

    // TODO -> go through and destroy all volumes.
    // clean up offscreenMultiRenderWindow
    // Remove all renderers
    // Remove all data from renderers
    // removeAllActors
    // removeAllVolumes
    // Remove resize handlers from canvases.
  }

  // debugRender() {
  //   // Renders all scenes
  //   const { offscreenMultiRenderWindow } = this;
  //   const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

  //   const renderers = offscreenMultiRenderWindow.getRenderers();

  //   // TEMP
  //   renderers[0].renderer.setDraw(false);

  //   debugger;

  //   renderWindow.render();
  //   const openGLRenderWindow = offscreenMultiRenderWindow.getOpenGLRenderWindow();
  //   const context = openGLRenderWindow.get3DContext();

  //   const offScreenCanvas = context.canvas;
  //   const dataURL = offScreenCanvas.toDataURL();
  //   const scenes = this._scenes;

  //   for (let i = 0; i < scenes.length; i++) {
  //     const scene = scenes[i];
  //     const { viewports } = scene.getViewports();

  //     viewports.forEach(viewport => {
  //       const { sx, sy, sWidth, sHeight } = viewport;

  //       const canvas = <HTMLCanvasElement>viewport.canvas;
  //       const { width: dWidth, height: dHeight } = canvas;

  //       // @ts-ignore // deal with in a sec
  //       const onScreenContext = canvas.getContext('2d');

  //       //sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight
  //       onScreenContext.drawImage(
  //         offScreenCanvas,
  //         sx,
  //         sy,
  //         sWidth,
  //         sHeight,
  //         0, //dx
  //         0, // dy
  //         dWidth,
  //         dHeight
  //       );
  //     });
  //   }

  //   //_TEMPDownloadURI(dataURL);
  // }
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
