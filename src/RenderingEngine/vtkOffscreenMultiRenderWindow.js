import macro from 'vtk.js/Sources/macro';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkRenderer from 'vtk.js/Sources/Rendering/Core/Renderer';
import vtkRenderWindow from 'vtk.js/Sources/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from 'vtk.js/Sources/Rendering/Core/RenderWindowInteractor';
import vtkInteractorStyleTrackballCamera from 'vtk.js/Sources/Interaction/Style/InteractorStyleTrackballCamera';

// Load basic classes for vtk() factory
import 'vtk.js/Sources/Common/Core/Points';
import 'vtk.js/Sources/Common/Core/DataArray';
import 'vtk.js/Sources/Common/DataModel/PolyData';
import 'vtk.js/Sources/Rendering/Core/Actor';
import 'vtk.js/Sources/Rendering/Core/Mapper';

/**
 * vtkOffscreenMultiRenderWindow - A class to deal with offscreen renderering with multiple renderers.
 *
 * This class is based on the vtkGenericRenderWindow with two key differences:
 * - the vtkGenericRenderWindow had a renderer at the top level, with helpers to get it from the renderWindow.
 *   although you could add more renderers, this gave special status to the first viewport. Which was confusing.
 * - When checking the size of the container element we no longer check the client size, as the canvas is offscreen.
 *
 * Additionally this class has some new helpers to easily add/associate renderers to different viewportUIDs.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkOffscreenMultiRenderWindow(publicAPI, model) {
  // Capture resize trigger method to remove from publicAPI
  const invokeResize = publicAPI.invokeResize;
  delete publicAPI.invokeResize;

  // VTK renderWindow. No renderers set by default
  model.renderWindow = vtkRenderWindow.newInstance();

  model.rendererMap = {};

  // OpenGLRenderWindow
  model.openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
  model.renderWindow.addView(model.openGLRenderWindow);

  // Interactor
  model.interactor = vtkRenderWindowInteractor.newInstance();
  model.interactor.setInteractorStyle(
    vtkInteractorStyleTrackballCamera.newInstance()
  );
  model.interactor.setView(model.openGLRenderWindow);
  model.interactor.initialize();

  publicAPI.addRenderer = ({ viewport, uid, background }) => {
    const renderer = vtkRenderer.newInstance({
      viewport,
      background: background || model.background,
    });

    model.renderWindow.addRenderer(renderer);
    model.rendererMap[uid] = renderer;
  };

  publicAPI.getRenderer = uid => {
    return model.rendererMap[uid];
  };

  publicAPI.getRenderers = () => {
    const { rendererMap } = model;

    const renderers = Object.keys(rendererMap).map(uid => {
      return { uid, renderer: rendererMap[uid] };
    });

    return renderers;
  };

  // Handle window resize
  publicAPI.resize = () => {
    if (model.container) {
      // Don't use getBoundingClientRect() as in vtkGenericRenderWindow as is an offscreen canvas.
      const { width, height } = model.container;

      // TODO -> I think we still need this. As window is the window of the canvas we are drawing to here,
      // We still need to make a WebGL viewport that will make images as large as the canvas elements
      // So devicePixelRatio is still likely needed. Will verify.

      const devicePixelRatio = 1; //window.devicePixelRatio || 1;
      model.openGLRenderWindow.setSize(
        Math.floor(width * devicePixelRatio),
        Math.floor(height * devicePixelRatio)
      );
      invokeResize();
      model.renderWindow.render();
    }
  };

  // Handle DOM container relocation
  publicAPI.setContainer = el => {
    if (model.container) {
      model.interactor.unbindEvents(model.container);
    }

    // Switch container
    model.container = el;
    model.openGLRenderWindow.setContainer(model.container);

    // Bind to new container
    if (model.container) {
      model.interactor.bindEvents(model.container);
    }
  };

  // Properly release GL context
  publicAPI.delete = macro.chain(
    publicAPI.setContainer,
    model.openGLRenderWindow.delete,
    publicAPI.delete
  );

  // Handle size
  if (model.listenWindowResize) {
    window.addEventListener('resize', publicAPI.resize);
  }
  publicAPI.resize();
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  background: [0.0, 0.0, 0.0],
  listenWindowResize: true,
  container: null,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Object methods
  macro.obj(publicAPI, model);
  macro.get(publicAPI, model, [
    'renderWindow',
    'openGLRenderWindow',
    'interactor',
    'container',
  ]);
  macro.event(publicAPI, model, 'resize');

  // Object specific methods
  vtkOffscreenMultiRenderWindow(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
