import { Point3 } from '../types';

/**
 * - `viewUp` - An array of three floating point numbers describing a vector
 *  that represents the up direction for the view.
 * - `viewPlaneNormal` - The direction of the projection
 *
 * see [Axial vs Sagittal vs Coronal](https://faculty.washington.edu/chudler/slice.html)
 * see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_Camera.html | VTK.js: Rendering_Core_Camera}
 *
 * @example
 *
 * ```javascript
 * renderingEngine.setViewports([
 *  {
 *    viewportId: 'a-viewport-uid',
 *    type: ViewportType.ORTHOGRAPHIC,
 *    element: document.querySelector('div'),
 *    defaultOptions: {
 *      orientation: {
 *       viewUp: [0, 0, 1],
 *      viewPlaneNormal: [1, 0, 0],
 *     },
 *      background: [1, 0, 0],
 *    },
 *  }]);
 * ```
 */
type OrientationVectors = {
  /** Slice Normal for the viewport - the normal that points in the opposite direction of the slice normal out of screen and is negative of direction of projection */
  viewPlaneNormal: Point3;
  /** viewUp direction for the viewport - the vector that points from bottom to top of the viewport */
  viewUp: Point3;
};

export default OrientationVectors;
