import macro from '@kitware/vtk.js/macros';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { vec3, mat4 } from 'gl-matrix';
import type { vtkObject } from '@kitware/vtk.js/interfaces';

// Copied from VTKCamera

/**
 *
 */
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
}

export interface vtkSlabCamera extends vtkObject {
  /**
   * Apply a transform to the camera.
   * The camera position, focal-point, and view-up are re-calculated
   * using the transform's matrix to multiply the old points by the new transform.
   * @param transformMat4 -
   */
  applyTransform(transformMat4: mat4): void;

  /**
   * Rotate the camera about the view up vector centered at the focal point.
   * @param angle -
   */
  azimuth(angle: number): void;

  /**
   *
   * @param bounds -
   */
  computeClippingRange(bounds: number[]): number[];

  /**
   * This method must be called when the focal point or camera position changes
   */
  computeDistance(): void;

  /**
   * the provided matrix should include
   * translation and orientation only
   * mat is physical to view
   * @param mat -
   */
  computeViewParametersFromPhysicalMatrix(mat: mat4): void;

  /**
   *
   * @param vmat -
   */
  computeViewParametersFromViewMatrix(vmat: mat4): void;

  /**
   * Not implemented yet
   * @param sourceCamera -
   */
  deepCopy(sourceCamera: vtkSlabCamera): void;

  /**
   * Move the position of the camera along the view plane normal. Moving
   * towards the focal point (e.g., greater than 1) is a dolly-in, moving away
   * from the focal point (e.g., less than 1) is a dolly-out.
   * @param amount -
   */
  dolly(amount: number): void;

  /**
   * Rotate the camera about the cross product of the negative of the direction of projection and the view up vector, using the focal point as the center of rotation.
   * @param angle  -
   */
  elevation(angle: number): void;

  /**
   * Not implemented yet
   */
  getCameraLightTransformMatrix(): void;

  /**
   *
   * @defaultValue [0.01, 1000.01],
   */
  getClippingRange(): number[];

  /**
   *
   * @defaultValue [0.01, 1000.01],
   */
  getClippingRangeByReference(): number[];

  /**
   *
   * @param aspect - Camera frustum aspect ratio.
   * @param nearz - Camera frustum near plane.
   * @param farz - Camera frustum far plane.
   */
  getCompositeProjectionMatrix(
    aspect: number,
    nearz: number,
    farz: number
  ): mat4;

  /**
   * Get the vector in the direction from the camera position to the focal point.
   * @defaultValue [0, 0, -1],
   */
  getDirectionOfProjection(): number[];

  /**
   *
   * @defaultValue [0, 0, -1],
   */
  getDirectionOfProjectionByReference(): number[];

  /**
   * Get the distance from the camera position to the focal point.
   */
  getDistance(): number;

  /**
   *
   * @defaultValue [0, 0, 0]
   */
  getFocalPoint(): number[];

  /**
   *
   */
  getFocalPointByReference(): number[];

  /**
   *
   * @defaultValue false
   */
  getFreezeFocalPoint(): boolean;

  setFreezeFocalPoint(freeze: boolean): void;

  /**
   * Not implemented yet
   * @param aspect - Camera frustum aspect ratio.
   */
  getFrustumPlanes(aspect: number): void;

  /**
   * Not implemented yet
   */
  getOrientation(): void;

  /**
   * Not implemented yet
   */
  getOrientationWXYZ(): void;

  /**
   *
   * @defaultValue false
   */
  getParallelProjection(): boolean;

  /**
   *
   * @defaultValue 1
   */
  getParallelScale(): number;

  /**
   *
   * @defaultValue 1.0
   */
  getPhysicalScale(): number;

  /**
   *
   * @param result -
   */
  getPhysicalToWorldMatrix(result: mat4): void;

  /**
   *
   */
  getPhysicalTranslation(): number[];

  /**
   *
   */
  getPhysicalTranslationByReference(): number[];

  /**
   *
   * @defaultValue [0, 0, -1],
   */
  getPhysicalViewNorth(): number[];

  /**
   *
   */
  getPhysicalViewNorthByReference(): number[];

  /**
   *
   * @defaultValue [0, 1, 0]
   */
  getPhysicalViewUp(): number[];

  /**
   *
   */
  getPhysicalViewUpByReference(): number[];

  /**
   * Get the position of the camera in world coordinates.
   * @defaultValue [0, 0, 1]
   */
  getPosition(): number[];

  /**
   *
   */
  getPositionByReference(): number[];

  /**
   *
   * @param aspect - Camera frustum aspect ratio.
   * @param nearz - Camera frustum near plane.
   * @param farz - Camera frustum far plane.
   * @defaultValue null
   */
  getProjectionMatrix(aspect: number, nearz: number, farz: number): null | mat4;

  /**
   * Not implemented yet
   * Get the roll angle of the camera about the direction of projection.
   */
  getRoll(): void;

  /**
   * Get top left corner point of the screen.
   * @defaultValue [-0.5, -0.5, -0.5]
   */
  getScreenBottomLeft(): number[];

  /**
   *
   * @defaultValue [-0.5, -0.5, -0.5]
   */
  getScreenBottomLeftByReference(): number[];

  /**
   * Get bottom left corner point of the screen
   * @defaultValue [0.5, -0.5, -0.5]
   */
  getScreenBottomRight(): number[];

  /**
   *
   * @defaultValue [0.5, -0.5, -0.5]
   */
  getScreenBottomRightByReference(): number[];

  /**
   *
   * @defaultValue [0.5, 0.5, -0.5]
   */
  getScreenTopRight(): number[];

  /**
   *
   * @defaultValue [0.5, 0.5, -0.5]
   */
  getScreenTopRightByReference(): number[];

  /**
   * Get the center of the window in viewport coordinates.
   */
  getThickness(): number;

  /**
   * Get the value of the UseHorizontalViewAngle instance variable.
   * @defaultValue false
   */
  getUseHorizontalViewAngle(): boolean;

  /**
   * Get use offaxis frustum.
   * @defaultValue false
   */
  getUseOffAxisProjection(): boolean;

  /**
   * Get the camera view angle.
   * @defaultValue 30
   */
  getViewAngle(): number;

  /**
   *
   * @defaultValue null
   */
  getViewMatrix(): null | mat4;

  /**
   * Get the ViewPlaneNormal.
   * This vector will point opposite to the direction of projection,
   * unless you have created a sheared output view using SetViewShear/SetObliqueAngles.
   * @defaultValue [0, 0, 1]
   */
  getViewPlaneNormal(): number[];

  /**
   * Get the ViewPlaneNormal by reference.
   */
  getViewPlaneNormalByReference(): number[];

  /**
   * Get ViewUp vector.
   * @defaultValue [0, 1, 0]
   */
  getViewUp(): number[];

  /**
   * Get ViewUp vector by reference.
   * @defaultValue [0, 1, 0]
   */
  getViewUpByReference(): number[];

  /**
   * Get the center of the window in viewport coordinates.
   * The viewport coordinate range is ([-1,+1],[-1,+1]).
   * @defaultValue [0, 0]
   */
  getWindowCenter(): number[];

  /**
   *
   * @defaultValue [0, 0]
   */
  getWindowCenterByReference(): number[];

  /**
   *
   * @param result -
   */
  getWorldToPhysicalMatrix(result: mat4): void;

  /**
   *
   * @defaultValue false
   */
  getIsPerformingCoordinateTransformation(status: boolean): void;

  /**
   * Recompute the ViewUp vector to force it to be perpendicular to the camera's focalpoint vector.
   */
  orthogonalizeViewUp(): void;

  /**
   *
   * @param ori -
   */
  physicalOrientationToWorldDirection(ori: number[]): any;

  /**
   * Rotate the focal point about the cross product of the view up vector and the direction of projection, using the camera's position as the center of rotation.
   * @param angle -
   */
  pitch(angle: number): void;

  /**
   * Rotate the camera about the direction of projection.
   * @param angle -
   */
  roll(angle: number): void;

  /**
   * Set the location of the near and far clipping planes along the direction
   * of projection.
   * @param near -
   * @param far -
   */
  setClippingRange(near: number, far: number): boolean;

  /**
   * Set the location of the near and far clipping planes along the direction
   * of projection.
   * @param clippingRange -
   */
  setClippingRange(clippingRange: number[]): boolean;

  /**
   *
   * @param clippingRange -
   */
  setClippingRangeFrom(clippingRange: number[]): boolean;

  /**
   * used to handle convert js device orientation angles
   * when you use this method the camera will adjust to the
   * device orientation such that the physicalViewUp you set
   * in world coordinates looks up, and the physicalViewNorth
   * you set in world coorindates will (maybe) point north
   *
   * NOTE WARNING - much of the documentation out there on how
   * orientation works is seriously wrong. Even worse the Chrome
   * device orientation simulator is completely wrong and should
   * never be used. OMG it is so messed up.
   *
   * how it seems to work on iOS is that the device orientation
   * is specified in extrinsic angles with a alpha, beta, gamma
   * convention with axes of Z, X, Y (the code below substitutes
   * the physical coordinate system for these axes to get the right
   * modified coordinate system.
   * @param alpha -
   * @param beta -
   * @param gamma -
   * @param screen -
   */
  setDeviceAngles(
    alpha: number,
    beta: number,
    gamma: number,
    screen: number
  ): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setDirectionOfProjection(x: number, y: number, z: number): boolean;

  /**
   *
   * @param distance -
   */
  setDistance(distance: number): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setFocalPoint(x: number, y: number, z: number): boolean;

  /**
   *
   * @param focalPoint -
   */
  setFocalPointFrom(focalPoint: number[]): boolean;

  /**
   * Not implement yet
   * Set the oblique viewing angles.
   * The first angle, alpha, is the angle (measured from the horizontal) that rays along
   * the direction of projection will follow once projected onto the 2D screen.
   * The second angle, beta, is the angle between the view plane and the direction of projection.
   * This creates a shear transform x' = x + dz*cos(alpha)/tan(beta), y' = dz*sin(alpha)/tan(beta) where dz is the distance of the point from the focal plane.
   * The angles are (45,90) by default. Oblique projections commonly use (30,63.435).
   *
   * @param alpha -
   * @param beta -
   */
  setObliqueAngles(alpha: number, beta: number): boolean;

  /**
   *
   * @param degrees -
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setOrientationWXYZ(degrees: number, x: number, y: number, z: number): boolean;

  /**
   *
   * @param parallelProjection -
   */
  setParallelProjection(parallelProjection: boolean): boolean;

  /**
   *
   * @param parallelScale -
   */
  setParallelScale(parallelScale: number): boolean;

  /**
   *
   * @param physicalScale -
   */
  setPhysicalScale(physicalScale: number): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setPhysicalTranslation(x: number, y: number, z: number): boolean;

  /**
   *
   * @param physicalTranslation -
   */
  setPhysicalTranslationFrom(physicalTranslation: number[]): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setPhysicalViewNorth(x: number, y: number, z: number): boolean;

  /**
   *
   * @param physicalViewNorth -
   */
  setPhysicalViewNorthFrom(physicalViewNorth: number[]): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setPhysicalViewUp(x: number, y: number, z: number): boolean;

  /**
   *
   * @param physicalViewUp -
   */
  setPhysicalViewUpFrom(physicalViewUp: number[]): boolean;

  /**
   * Set the position of the camera in world coordinates.
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setPosition(x: number, y: number, z: number): boolean;

  /**
   *
   * @param mat -
   */
  setProjectionMatrix(mat: mat4): boolean;

  /**
   * Set the roll angle of the camera about the direction of projection.
   * todo Not implemented yet
   * @param angle -
   */
  setRoll(angle: number): boolean;

  /**
   * Set top left corner point of the screen.
   *
   * This will be used only for offaxis frustum calculation.
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setScreenBottomLeft(x: number, y: number, z: number): boolean;

  /**
   * Set top left corner point of the screen.
   *
   * This will be used only for offaxis frustum calculation.
   * @param screenBottomLeft -
   */
  setScreenBottomLeft(screenBottomLeft: number[]): boolean;

  /**
   *
   * @param screenBottomLeft -
   */
  setScreenBottomLeftFrom(screenBottomLeft: number[]): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setScreenBottomRight(x: number, y: number, z: number): boolean;

  /**
   *
   * @param screenBottomRight -
   */
  setScreenBottomRight(screenBottomRight: number[]): boolean;

  /**
   *
   * @param screenBottomRight -
   */
  setScreenBottomRightFrom(screenBottomRight: number[]): boolean;

  /**
   * Set top right corner point of the screen.
   *
   * This will be used only for offaxis frustum calculation.
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setScreenTopRight(x: number, y: number, z: number): boolean;

  /**
   * Set top right corner point of the screen.
   *
   * This will be used only for offaxis frustum calculation.
   * @param screenTopRight -
   */
  setScreenTopRight(screenTopRight: number[]): boolean;

  /**
   *
   * @param screenTopRight -
   */
  setScreenTopRightFrom(screenTopRight: number[]): boolean;

  /**
   * Set the distance between clipping planes.
   *
   * This method adjusts the far clipping plane to be set a distance 'thickness' beyond the near clipping plane.
   * @param thickness -
   */
  setThickness(thickness: number): boolean;

  /**
   *
   * @param thickness -
   */
  setThicknessFromFocalPoint(thickness: number): boolean;

  /**
   *
   * @param useHorizontalViewAngle -
   */
  setUseHorizontalViewAngle(useHorizontalViewAngle: boolean): boolean;

  /**
   * Set use offaxis frustum.
   *
   * OffAxis frustum is used for off-axis frustum calculations specifically for
   * stereo rendering. For reference see "High Resolution Virtual Reality", in
   * Proc. SIGGRAPH '92, Computer Graphics, pages 195-202, 1992.
   * @param useOffAxisProjection -
   */
  setUseOffAxisProjection(useOffAxisProjection: boolean): boolean;

  /**
   * Set the camera view angle, which is the angular height of the camera view measured in degrees.
   * @param viewAngle -
   */
  setViewAngle(viewAngle: number): boolean;

  /**
   *
   * @param mat -
   */
  setViewMatrix(mat: mat4): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  setViewUp(x: number, y: number, z: number): boolean;

  /**
   *
   * @param viewUp -
   */
  setViewUp(viewUp: number[]): boolean;

  /**
   *
   * @param viewUp -
   */
  setViewUpFrom(viewUp: number[]): boolean;

  /**
   * Set the center of the window in viewport coordinates.
   * The viewport coordinate range is ([-1,+1],[-1,+1]).
   * This method is for if you have one window which consists of several viewports, or if you have several screens which you want to act together as one large screen
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   */
  setWindowCenter(x: number, y: number): boolean;

  /**
   * Set the center of the window in viewport coordinates from an array.
   * @param windowCenter -
   */
  setWindowCenterFrom(windowCenter: number[]): boolean;

  /**
   *
   * @param x - The x coordinate.
   * @param y - The y coordinate.
   * @param z - The z coordinate.
   */
  translate(x: number, y: number, z: number): void;

  /**
   * Rotate the focal point about the view up vector, using the camera's position as the center of rotation.
   * @param angle -
   */
  yaw(angle: number): void;

  /**
   * In perspective mode, decrease the view angle by the specified factor.
   * @param factor -
   */
  zoom(factor: number): void;

  /**
   * Activate camera clipping customization necessary when doing coordinate transformations
   * @param status -
   */
  setIsPerformingCoordinateTransformation(status: boolean): void;
}

const DEFAULT_VALUES = {
  isPerformingCoordinateTransformation: false,
};

/**
 * Method use to decorate a given object (publicAPI+model) with vtkRenderer characteristics.
 *
 * @param publicAPI - object on which methods will be bounds (public)
 * @param model - object on which data structure will be bounds (protected)
 * @param initialValues -
 */
function extend(
  publicAPI: any,
  model: any,
  initialValues: ICameraInitialValues = {}
): void {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkCamera.extend(publicAPI, model, initialValues);

  macro.setGet(publicAPI, model, ['isPerformingCoordinateTransformation']);

  // Object methods
  vtkSlabCamera(publicAPI, model);
}

/**
 * Method use to create a new instance of vtkCamera with its focal point at the origin,
 * and position=(0,0,1). The view up is along the y-axis, view angle is 30 degrees,
 * and the clipping range is (.1,1000).
 * @param initialValues - for pre-setting some of its content
 */
const newInstance: (initialValues?: ICameraInitialValues) => vtkSlabCamera =
  macro.newInstance(extend, 'vtkSlabCamera');

/**
 * vtkCamera is a virtual camera for 3D rendering. It provides methods
 * to position and orient the view point and focal point. Convenience
 * methods for moving about the focal point also are provided. More
 * complex methods allow the manipulation of the computer graphics model
 * including view up vector, clipping planes, and camera perspective.
 */

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
  const tmpMatrix = mat4.identity(new Float64Array(16) as unknown as mat4);
  const tmpvec1 = new Float64Array(3) as unknown as vec3;

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

export default { newInstance, extend };
export { newInstance, extend };
