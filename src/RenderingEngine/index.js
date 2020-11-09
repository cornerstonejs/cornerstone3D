import vtkGenericRenderWindow from 'vtk.js/Sources/Rendering/Misc/GenericRenderWindow';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import imageCache from '../imageCache';
import { uuidv4 } from '../utils/';

class RenderingEngine {
  constructor(uid) {
    this.uid = uid ? uid : uuidv4();

    this.genericRenderWindow = vtkGenericRenderWindow.newInstance({
      background: [0, 0, 0],
    });

    const webGLCanvasContainer = document.createElement('div');

    // Emulate this component being on screen, as vtk.js checks this everywhere.
    // We could eventually change this upstream.
    webGLCanvasContainer.getBoundingClientRect = () => {
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

    webGLCanvasContainer.width = 256; // Some placeholder
    webGLCanvasContainer.height = 256;

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

class Scene {
  constructor(uid) {
    this.uid = uid;
    this._viewports = [];
    this._volumeActors = [];
  }

  render() {
    // TODO -> Render only this scene's viewports.
    // traverseAllPasses but only for the relevant views.
  }

  getViewports() {
    return {
      viewports: this._viewports,
      setToolGroup: toolGroupUID => {
        // TODO Set the toolGroup of all viewports in the scene.
        this._viewports.forEach(viewport => {
          viewport.setToolGroup(toolGroupUID);
        });
      },
      setSyncGroups: (syncGroupUIDs = []) => {
        this._viewports.forEach(viewport => {
          viewport.setSyncGroups(syncGroupUIDs);
        });
      },
    };
  }

  getViewport(uid) {
    return this._viewports.find(vp => vp.uid === uid);
  }

  setVolumes(volumeData, immediate = false) {
    // TODO: -> make actors and add reference to actor to viewport.

    this._volumeActors = [];

    for (let i = 0; i < volumeData.length; i++) {
      const { volumeUID, callback } = volumeData[i];

      const imageVolume = imageCache.getImageVolume(volumeUID);

      if (!imageVolume) {
        throw new error(
          `imageVolume with uid: ${imageVolume.uid} does not exist`
        );
      }

      const { vtkImageData } = imageVolume;

      const volumeActor = vtkVolume.newInstance();
      const volumeMapper = vtkVolumeMapper.newInstance();

      volumeActor.setMapper(volumeMapper);
      volumeMapper.setInputData(vtkImageData);

      const spacing = vtkImageData.getSpacing();
      // Set the sample distance to half the mean length of one side. This is where the divide by 6 comes from.
      // https://github.com/Kitware/VTK/blob/6b559c65bb90614fb02eb6d1b9e3f0fca3fe4b0b/Rendering/VolumeOpenGL2/vtkSmartVolumeMapper.cxx#L344
      const sampleDistance = (spacing[0] + spacing[1] + spacing[2]) / 6;

      volumeMapper.setSampleDistance(sampleDistance);

      callback({ volumeActor, volumeUID });

      this._volumeActors.push({ volumeActor, uid: volumeUID });
    }

    this._viewports.forEach(viewport => {
      viewport._setVolumeActors(this._volumeActors);
    });

    if (immediate) {
      // TODO Render
    }
  }

  _addViewport(viewportProps) {
    const viewport = new Viewport(viewportProps);

    this._viewports.push(viewport);
  }
}

class Viewport {
  constructor({
    uid,
    type,
    canvas,
    sx,
    sy,
    sWidth,
    sHeight,
    defaultOptions,
    renderWindow,
  }) {
    this.uid = uid;
    this.tyep = type;
    this.canvas = canvas;
    this.sx = sx;
    this.sy = sy;
    this.sWidth = sWidth;
    this.sHeight = sHeight;
    this.defaultOptions = defaultOptions;
    this.options = Object.assign({}, defaultOptions);
    this.renderWindow = renderWindow;

    // TODO Make new renderer and add it to renderWindow
  }

  setOptions(options, immediate = false) {
    this.options = Object.assign({}, options);

    if (immediate) {
      // TODO Render
    }
  }

  reset(immediate = false) {
    this.options = Object.assign({}, defaultOptions);

    if (immediate) {
      // TODO Render
    }
  }

  setToolGroup(toolGropUID) {}

  setSyncGroups(syncGroupUIDs) {}

  _setVolumeActors(volumeActors) {
    // TODO -> get renderer and set volume actors.
  }
}

export default RenderingEngine;
