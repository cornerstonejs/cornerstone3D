import macro from '@kitware/vtk.js/macros';
import vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';

function vtkSharedImageResliceMapper(publicAPI, model) {
  model.classHierarchy.push('vtkSharedImageResliceMapper');

  const superDelete = publicAPI.delete;
  publicAPI.delete = () => {
    model.scalarTexture = null;
    superDelete();
  };
}

const DEFAULT_VALUES = {
  scalarTexture: null,
};

/**
 * The background colour is what the fragment shader of vtk.js writes where
 * the point it samples lies outside the volume, and vtk.js makes it opaque
 * black. The cut that the mapper draws ends on the faces of the volume, but
 * with multisampling a pixel on its edge that the cut covers only in part
 * runs the shader at the centre of the pixel, which lies outside the volume,
 * and the covered samples took that black: a row or a column of one constant
 * grey beside the picture on any background that is not black, and a dark
 * line over the layer below at the edge of an overlay. Transparent, the
 * outside of the volume adds nothing at any blend mode, slab or not, as on
 * the other render paths.
 */
export function extend(publicAPI, model, initialValues = {}) {
  const values = { backgroundColor: [0, 0, 0, 0], ...initialValues };

  Object.assign(model, DEFAULT_VALUES, values);

  vtkImageResliceMapper.extend(publicAPI, model, values);

  macro.setGet(publicAPI, model, ['scalarTexture']);

  vtkSharedImageResliceMapper(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkSharedImageResliceMapper'
);

export default { newInstance, extend };
