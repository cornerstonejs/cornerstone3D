import macro from 'vtk.js/Sources/macro';
import vtkOpenGLRenderWindow from 'vtk.js/Sources/Rendering/OpenGL/RenderWindow';
import vtkStreamingOpenGLViewNodeFactory from './vtkStreamingOpenGLViewNodeFactory';

// ----------------------------------------------------------------------------
// vtkVolumeMapper methods
// ----------------------------------------------------------------------------

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
  /* eslint-disable no-use-before-define */
  model.myFactory.registerOverride('vtkRenderWindow', newInstance);
  /* eslint-enable no-use-before-define */

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
