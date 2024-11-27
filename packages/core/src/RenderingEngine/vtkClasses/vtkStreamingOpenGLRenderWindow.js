import macro from '@kitware/vtk.js/macros';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkStreamingOpenGLViewNodeFactory, {
  registerOverride,
} from './vtkStreamingOpenGLViewNodeFactory';

/**
 * vtkStreamingOpenGLRenderWindow - A derived class of the core vtkOpenGLRenderWindow class.
 * The main purpose for this class extension is to add in our own node factory, so we can use
 * our extended "streaming" classes for progressive texture loading.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLRenderWindow');
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, initialValues);

  vtkOpenGLRenderWindow.extend(publicAPI, model, initialValues);

  model.myFactory = vtkStreamingOpenGLViewNodeFactory.newInstance();

  registerOverride('vtkRenderWindow', newInstance);

  // Object methods
  vtkStreamingOpenGLRenderWindow(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLRenderWindow'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
