import macro from '@kitware/vtk.js/macros';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkStreamingOpenGLViewNodeFactory, {
  registerOverride,
} from './vtkStreamingOpenGLViewNodeFactory';
import { applyNorm16ExtensionGate } from './norm16ExtensionGate';

/**
 * vtkStreamingOpenGLRenderWindow - A derived class of the core vtkOpenGLRenderWindow class.
 * The main purpose for this class extension is to add in our own node factory, so we can use
 * our extended "streaming" classes for progressive texture loading.
 *
 * Its WebGL context follows the texture probe: when the probe says norm16
 * textures are not usable, the context reports no `EXT_texture_norm16`, so the
 * stock vtk.js image mapper, which turns norm16 on by itself, agrees with the
 * probe (see `norm16ExtensionGate`).
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLRenderWindow(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLRenderWindow');

  const superGet3DContext = publicAPI.get3DContext;

  publicAPI.get3DContext = (options) =>
    applyNorm16ExtensionGate(superGet3DContext(options));
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
