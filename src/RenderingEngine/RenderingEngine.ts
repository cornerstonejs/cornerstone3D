import vtkGenericRenderWindow from 'vtk.js/Sources/Rendering/Misc/GenericRenderWindow';

// @ts-ignore
import Scene from './Scene.ts';
import { uuidv4 } from '../utils/';

class RenderingEngine {
  uid: string;
  genericRenderWindow: any;
  webGLCanvasContainer: any;
  scenes: Array<Scene>;

  constructor(uid) {
    this.uid = uid ? uid : uuidv4();

    this.genericRenderWindow = vtkGenericRenderWindow.newInstance({
      background: [0, 0, 0],
    });

    const webGLCanvasContainer = document.createElement('div');

    // Emulate this component being on screen, as vtk.js checks this everywhere.
    // We could eventually change this upstream.
    //@ts-ignore // We are making this into not a strict div element with the hack.
    webGLCanvasContainer.getBoundingClientRect = () => {
      //@ts-ignore // We are making this into not a strict div element with the hack.
      const { width, height } = webGLCanvasContainer;

      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: width,
        right: height,
        width: width,
        height: height,
      };
    };

    this.webGLCanvasContainer = webGLCanvasContainer;
    this.genericRenderWindow.setContainer(this.webGLCanvasContainer);
    this.scenes = [];
  }

  setViewports(viewports) {
    const { webGLCanvasContainer, genericRenderWindow } = this;

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

    genericRenderWindow.resize();

    const size = genericRenderWindow.getOpenGLRenderWindow().getContainerSize();

    // Awesome!
    const context = genericRenderWindow.getOpenGLRenderWindow().get3DContext();

    let xOffset = 0;

    for (let i = 0; i < viewports.length; i++) {
      const { canvas, sceneUID, viewportUID, type, defaultOptions } = viewports[
        i
      ];
      const { clientWidth, clientHeight } = canvas;

      let scene = this.getScene(sceneUID);

      if (!scene) {
        scene = new Scene(sceneUID);

        this.scenes.push(scene);
      }

      scene._addViewport({
        uid: viewportUID,
        type,
        canvas,
        sx: xOffset,
        sy: 0,
        sWidth: clientWidth,
        sHeight: clientHeight,
        defaultOptions: defaultOptions || {},
      });

      xOffset += clientWidth;
    }

    // Make renderers.
    // Add renderers to render window.
    // Place renderers and store offset and width height in the render window.
  }

  getScene(uid) {
    return this.scenes.find(scene => scene.uid === uid);
  }

  render() {
    const renderWindow = this.genericRenderWindow.getRenderWindow();

    renderWindow.render();
  }

  destroy() {
    // TODO -> go through and destroy all volumes.
    // clean up genericRenderWindow
    // Remove all renderers
    // Remove all data from renderers
    // removeAllActors
    // removeAllVolumes
    // Remove resize handlers from canvases.
  }
}

export default RenderingEngine;
