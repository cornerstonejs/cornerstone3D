import macro from '@kitware/vtk.js/macros';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import { vec3, mat4 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';

/**
 * vtkSlabCamera - A derived class of the core vtkCamera class
 *
 * This customization is necesssary because when we do coordinate transformations
 * we need to set the cRange between [d, d + 0.1],
 * where d is distance between the camera position and the focal point.
 * While when we render we set to the clippingRange [0.01, d * 2],
 * where d is the calculated from the bounds of all the actors.
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkSlabCamera(publicAPI, model) {
  model.classHierarchy.push('vtkSlabCamera');

  // Set up private variables and methods
  const tmpMatrix = mat4.identity(new Float64Array(16));
  const tmpvec1 = new Float64Array(3);

  /**
   * getProjectionMatrix - A fork of vtkCamera's getProjectionMatrix method.
   * This fork performs most of the same actions, but define crange around
   * model.distance when doing coordinate transformations.
   */
  publicAPI.getProjectionMatrix = (aspect, nearz, farz) => {
    const result = mat4.create();

    if (model.projectionMatrix) {
      const scale = 1 / model.physicalScale;
      vec3.set(tmpvec1, scale, scale, scale);

      mat4.copy(result, model.projectionMatrix);
      mat4.scale(result, result, tmpvec1);
      mat4.transpose(result, result);
      return result;
    }

    mat4.identity(tmpMatrix);

    let cRange0 = model.clippingRange[0];
    let cRange1 = model.clippingRange[1];
    if (model.isPerformingCoordinateTransformation) {
      /**
       * NOTE: this is necessary because we want the coordinate transformation
       * respect to the view plane (plane orthogonal to the camera and passing to
       * the focal point).
       *
       * When vtk.js computes the coordinate transformations, it simply uses the
       * camera matrix (no ray casting).
       *
       * However for the volume viewport the clipping range is set to be
       * (-RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE).
       * The clipping range is used in the camera method getProjectionMatrix().
       * The projection matrix is used then for viewToWorld/worldToView methods of
       * the renderer. This means that vkt.js will not return the coordinates of
       * the point on the view plane (i.e. the depth coordinate will corresponded
       * to the focal point).
       *
       * Therefore the clipping range has to be set to (distance, distance + 0.01),
       * where now distance is the distance between the camera position and focal
       * point. This is done internally, in our camera customization when the flag
       * isPerformingCoordinateTransformation is set to true.
       */
      cRange0 = model.distance;
      cRange1 = model.distance + 0.1;
    }

    const cWidth = cRange1 - cRange0;
    const cRange = [
      cRange0 + ((nearz + 1) * cWidth) / 2.0,
      cRange0 + ((farz + 1) * cWidth) / 2.0,
    ];

    if (model.parallelProjection) {
      // set up a rectangular parallelipiped
      const width = model.parallelScale * aspect;
      const height = model.parallelScale;

      const xmin = (model.windowCenter[0] - 1.0) * width;
      const xmax = (model.windowCenter[0] + 1.0) * width;
      const ymin = (model.windowCenter[1] - 1.0) * height;
      const ymax = (model.windowCenter[1] + 1.0) * height;

      mat4.ortho(tmpMatrix, xmin, xmax, ymin, ymax, cRange[0], cRange[1]);
      mat4.transpose(tmpMatrix, tmpMatrix);
    } else if (model.useOffAxisProjection) {
      throw new Error('Off-Axis projection is not supported at this time');
    } else {
      const tmp = Math.tan(vtkMath.radiansFromDegrees(model.viewAngle) / 2.0);
      let width;
      let height;
      if (model.useHorizontalViewAngle === true) {
        width = cRange0 * tmp;
        height = (cRange0 * tmp) / aspect;
      } else {
        width = cRange0 * tmp * aspect;
        height = cRange0 * tmp;
      }

      const xmin = (model.windowCenter[0] - 1.0) * width;
      const xmax = (model.windowCenter[0] + 1.0) * width;
      const ymin = (model.windowCenter[1] - 1.0) * height;
      const ymax = (model.windowCenter[1] + 1.0) * height;
      const znear = cRange[0];
      const zfar = cRange[1];

      tmpMatrix[0] = (2.0 * znear) / (xmax - xmin);
      tmpMatrix[5] = (2.0 * znear) / (ymax - ymin);
      tmpMatrix[2] = (xmin + xmax) / (xmax - xmin);
      tmpMatrix[6] = (ymin + ymax) / (ymax - ymin);
      tmpMatrix[10] = -(znear + zfar) / (zfar - znear);
      tmpMatrix[14] = -1.0;
      tmpMatrix[11] = (-2.0 * znear * zfar) / (zfar - znear);
      tmpMatrix[15] = 0.0;
    }

    mat4.copy(result, tmpMatrix);

    return result;
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  isPerformingCoordinateTransformation: false,
};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkCamera.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, ['isPerformingCoordinateTransformation']);

  // Object methods
  vtkSlabCamera(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkSlabCamera');

// ----------------------------------------------------------------------------

export default { newInstance, extend };
