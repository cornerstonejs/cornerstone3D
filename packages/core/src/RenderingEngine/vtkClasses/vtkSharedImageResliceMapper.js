import macro from '@kitware/vtk.js/macros';
import vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';

/**
 * vtkSharedImageResliceMapper - A derived class of vtkImageResliceMapper that
 * carries a scalar texture reference. This allows sharing a streaming
 * OpenGL texture across multiple reslice mappers without duplicating memory.
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkSharedImageResliceMapper(publicAPI, model) {
  model.classHierarchy.push('vtkSharedImageResliceMapper');

  const superDelete = publicAPI.delete;
  publicAPI.delete = () => {
    model.scalarTexture = null;
    superDelete();
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  scalarTexture: null,
};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkImageResliceMapper.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, ['scalarTexture']);

  vtkSharedImageResliceMapper(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkSharedImageResliceMapper'
);

export default { newInstance, extend };
