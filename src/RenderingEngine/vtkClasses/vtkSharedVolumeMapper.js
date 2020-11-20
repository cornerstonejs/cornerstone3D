import macro from 'vtk.js/Sources/macro';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';

// ----------------------------------------------------------------------------
// vtkVolumeMapper methods
// ----------------------------------------------------------------------------

function vtkSharedVolumeMapper(publicAPI, model) {
  model.classHierarchy.push('vtkSharedVolumeMapper');
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
