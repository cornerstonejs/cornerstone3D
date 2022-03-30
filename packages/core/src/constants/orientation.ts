import { Orientation, Point3 } from '../types';

/**
 * Convenient reference values often used to set a specific orientation
 * when using RenderingEngine's setViewports method.
 *
 * @remarks
 * Each constant is an object with two properties.
 * - `viewUp` - An array of three floating point numbers describing a vector
 *  that represents the up direction for the view.
 * - `sliceNormal` - The direction of the projection
 *
 * These values may make slightly more sense when we peel back the curtains of
 * our solution and look at the camera that's leveraging these values.
 *
 * see [Axial vs Sagittal vs Coronal](https://faculty.washington.edu/chudler/slice.html)
 * see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_Camera.html | VTK.js: Rendering_Core_Camera}
 *
 * @example
 * Using ORIENTATION constant to set a viewport to use an Axial orientation
 *
 * ```javascript
 * renderingEngine.setViewports([
 *  {
 *    viewportId: 'a-viewport-uid',
 *    type: ViewportType.ORTHOGRAPHIC,
 *    element: document.querySelector('div'),
 *    defaultOptions: {
 *      // 👇 Leveraging our reference constant
 *      orientation: ORIENTATION.AXIAL,
 *      background: [1, 0, 0],
 *    },
 *  }]);
 * ```
 */
const ORIENTATION: Record<string, Orientation> = {
  AXIAL: {
    sliceNormal: <Point3>[0, 0, -1],
    viewUp: <Point3>[0, -1, 0],
  },
  SAGITTAL: {
    sliceNormal: <Point3>[1, 0, 0],
    viewUp: <Point3>[0, 0, 1],
  },
  CORONAL: {
    sliceNormal: <Point3>[0, 1, 0],
    viewUp: <Point3>[0, 0, 1],
  },
};

Object.freeze(ORIENTATION);

export default ORIENTATION;
