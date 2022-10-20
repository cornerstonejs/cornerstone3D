import macro from '@kitware/vtk.js/macros';
import vtkStreamingOpenGLRenderWindow from './vtkStreamingOpenGLRenderWindow';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';

// Load basic classes for vtk() factory
import '@kitware/vtk.js/Common/Core/Points';
import '@kitware/vtk.js/Common/Core/DataArray';
import '@kitware/vtk.js/Common/DataModel/PolyData';
import '@kitware/vtk.js/Rendering/Core/Actor';
import '@kitware/vtk.js/Rendering/Core/Mapper';

/**
 * vtkOffscreenMultiRenderWindow - A class to deal with offscreen rendering with multiple renderers.
 *
 * This class is based on the vtkGenericRenderWindow with two key differences:
 * - the vtkGenericRenderWindow had a renderer at the top level, with helpers to get it from the renderWindow.
 *   although you could add more renderers, this gave special status to the first viewport. Which was confusing.
 * - When checking the size of the container element we no longer check the client size, as the canvas is offscreen.
 * - We aren't using interactor styles, so don't set one up.
 *
 * Additionally this class has some new helpers to easily add/associate renderers to different viewportIds.
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
  model.openGLRenderWindow = vtkStreamingOpenGLRenderWindow.newInstance();
  model.renderWindow.addView(model.openGLRenderWindow);

  // Interactor
  model.interactor = vtkRenderWindowInteractor.newInstance();
  model.interactor.setView(model.openGLRenderWindow);
  model.interactor.initialize();

  publicAPI.addRenderer = ({ viewport, id, background }) => {
    const renderer = vtkRenderer.newInstance({
      viewport,
      background: background || model.background,
    });

    model.renderWindow.addRenderer(renderer);
    model.rendererMap[id] = renderer;
  };

  publicAPI.destroy = () => {
    const rwi = model.renderWindow.getInteractor();
    rwi.delete();
  };

  publicAPI.removeRenderer = (id) => {
    const renderer = publicAPI.getRenderer(id);
    model.renderWindow.removeRenderer(renderer);
    renderer.delete();
    delete model.rendererMap[id];
  };

  publicAPI.getRenderer = (id) => {
    return model.rendererMap[id];
  };

  publicAPI.getRenderers = () => {
    const { rendererMap } = model;

    const renderers = Object.keys(rendererMap).map((id) => {
      return { id, renderer: rendererMap[id] };
    });

    return renderers;
  };

  // Handle window resize
  publicAPI.resize = () => {
    if (model.container) {
      // Don't use getBoundingClientRect() as in vtkGenericRenderWindow as is an offscreen canvas.
      const { width, height } = model.container;

      // Note: we do not scale by devicePixelRatio here because it has already
      // been done when adding the offscreenCanvas viewport representations
      model.openGLRenderWindow.setSize(Math.floor(width), Math.floor(height));
      invokeResize();
      model.renderWindow.render();
    }
  };

  // Handle DOM container relocation
  publicAPI.setContainer = (el) => {
    // Switch container
    model.container = el;
    model.openGLRenderWindow.setContainer(model.container);
  };

  // Properly release GL context
  publicAPI.delete = macro.chain(
    publicAPI.setContainer,
    publicAPI.destroy,
    model.openGLRenderWindow.delete,
    publicAPI.delete
  );

  publicAPI.resize();
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  background: [0.0, 0.0, 0.0],
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
