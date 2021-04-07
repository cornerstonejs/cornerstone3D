import { Orientation } from '../types'

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
 * @see {@link https://faculty.washington.edu/chudler/slice.html|Axial vs Sagittal vs Coronal}
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_Camera.html|VTK.js: Rendering_Core_Camera}
 * @example
 * Using ORIENTATION constant to set a viewport to use an Axial orientation
 * ```
 * renderingEngine.setViewports([
 *  {
 *    sceneUID: 'a-scene-uid',
 *    viewportUID: 'a-viewport-uid',
 *    type: VIEWPORT_TYPE.ORTHOGRAPHIC,
 *    canvas: document.querySelector('div.canvas-container'),
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
    sliceNormal: [0, 0, -1],
    viewUp: [0, -1, 0],
  },
  SAGITTAL: {
    sliceNormal: [1, 0, 0],
    viewUp: [0, 0, 1],
  },
  CORONAL: {
    sliceNormal: [0, 1, 0],
    viewUp: [0, 0, 1],
  },
}

Object.freeze(ORIENTATION)

export default ORIENTATION
