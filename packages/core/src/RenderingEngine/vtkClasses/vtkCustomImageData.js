import macro from '@kitware/vtk.js/macros';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

// ----------------------------------------------------------------------------
// vtkCustomImageData methods
// ----------------------------------------------------------------------------

function vtkCustomImageData(publicAPI, model) {
  // Set our class name
  model.classHierarchy.push('vtkCustomImageData');

  // Add custom properties to the model
  model.dataType = null;
  model.voxelManager = null;
  model.id = null;
  model.numberOfComponents = 1;

  // Add custom methods to the public API
  publicAPI.getDataType = () => model.dataType;
  publicAPI.setDataType = (dataType) => {
    if (model.dataType !== dataType) {
      model.dataType = dataType;
      publicAPI.modified();
    }
  };
  publicAPI.setId = (id) => {
    model.id = id;
  };

  publicAPI.getId = () => model.id;

  publicAPI.setNumberOfComponents = (numberOfComponents) => {
    if (model.numberOfComponents !== numberOfComponents) {
      model.numberOfComponents = numberOfComponents;
      publicAPI.modified();
    }
  };

  publicAPI.getNumberOfComponents = () => model.numberOfComponents;

  publicAPI.getVoxelManager = () => model.voxelManager;
  publicAPI.setVoxelManager = (voxelManager) => {
    if (model.voxelManager !== voxelManager) {
      model.voxelManager = voxelManager;
      publicAPI.modified();
    }
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  dataType: null,
  voxelManager: null,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Inherit from vtkImageData
  vtkImageData.extend(publicAPI, model, initialValues);

  // Object methods
  vtkCustomImageData(publicAPI, model);

  // Object specific methods
  macro.setGet(publicAPI, model, ['dataType', 'voxelManager']);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkCustomImageData');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
