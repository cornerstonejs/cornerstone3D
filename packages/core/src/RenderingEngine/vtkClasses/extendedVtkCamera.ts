import macro from '@kitware/vtk.js/macros';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import { getProjectionScaleMatrix } from '../helpers/getProjectionScaleMatrix';
import { getNormalizedAspectRatio } from '../../utilities/getNormalizedAspectRatio';
import { mat4 } from 'gl-matrix';

interface ICameraInitialValues {
  position?: number[];
  focalPoint?: number[];
  viewUp?: number[];
  directionOfProjection?: number[];
  parallelProjection?: boolean;
  useHorizontalViewAngle?: boolean;
  viewAngle?: number;
  parallelScale?: number;
  clippingRange?: number[];
  windowCenter?: number[];
  viewPlaneNormal?: number[];
  useOffAxisProjection?: boolean;
  screenBottomLeft?: number[];
  screenBottomRight?: number[];
  screenTopRight?: number[];
  freezeFocalPoint?: boolean;
  physicalTranslation?: number[];
  physicalScale?: number;
  physicalViewUp?: number[];
  physicalViewNorth?: number[];
  aspectRatio?: number[];
}

declare module '@kitware/vtk.js/Rendering/Core/Camera' {
  export interface vtkCamera {
    /**
     * Get the aspectRatio of the viewport
     *  @defaultValue [1, 1]
     */
    getAspectRatio(): [x: number, y: number];

    /**
     * Set the aspectRatio of the viewport
     * @param aspectRatio - aspectRatio of the viewport in x and y axis
     */
    setAspectRatio(aspectRatio: [x: number, y: number]): boolean;
  }
}

export type extendedVtkCamera = vtkCamera;

/**
 * extendedVtkCamera - A derived class of the core vtkCamera class
 *
 * This customization is necessary because when need to handle stretched viewport
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function extendedVtkCamera(publicAPI, model) {
  model.classHierarchy.push('extendedVtkCamera');

  // Keep original
  const superGetProjectionMatrix = publicAPI.getProjectionMatrix;

  /**
   * getProjectionMatrix - A fork of vtkCamera's getProjectionMatrix method.
   * This fork performs most of the same actions, but added handling for stretched viewport.
   */
  publicAPI.getProjectionMatrix = (aspect, nearZ, farZ) => {
    const matrix = superGetProjectionMatrix(aspect, nearZ, farZ);

    const [sx, sy] = getNormalizedAspectRatio(model.aspectRatio);

    if (sx !== 1.0 || sy !== 1.0) {
      const viewUp = publicAPI.getViewUp();
      const viewPlaneNormal = publicAPI.getViewPlaneNormal();
      const scaleMatrix = getProjectionScaleMatrix(viewUp, viewPlaneNormal, [
        sx,
        sy,
      ]);
      mat4.multiply(matrix, scaleMatrix, matrix);
    }

    return matrix;
  };

  publicAPI.getAspectRatio = () => {
    return model.aspectRatio;
  };

  publicAPI.setAspectRatio = (aspectRatio) => {
    model.aspectRatio = aspectRatio;
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  aspectRatio: [1, 1],
};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkCamera.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, ['aspectRatio']);

  // Object methods
  extendedVtkCamera(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance: (
  initialValues?: ICameraInitialValues
) => extendedVtkCamera = macro.newInstance(extend, 'extendedVtkCamera');
// ----------------------------------------------------------------------------

export default { newInstance, extend };
