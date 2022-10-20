import macro from '@kitware/vtk.js/macros';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';

/**
 * vtkSharedVolumeMapper - A derived class of the core vtkVolumeMapper class
 * the scalar texture in as an argument. This is so we can share the same texture
 * memory across different mappers/actors, so we don't duplicate memory usage.
 *
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 * @hidden
 */
function vtkSharedVolumeMapper(publicAPI, model) {
  model.classHierarchy.push('vtkSharedVolumeMapper');

  const superDelete = publicAPI.delete;
  publicAPI.delete = () => {
    model.scalarTexture = null;
    superDelete();
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  scalarTexture: null,
};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkVolumeMapper.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, ['scalarTexture']);

  // Object methods
  vtkSharedVolumeMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkSharedVolumeMapper');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
