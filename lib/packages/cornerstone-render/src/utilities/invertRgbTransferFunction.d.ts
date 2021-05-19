/**
 * A utility that can be used to invert (in place) an RgbTransferFunction.
 *
 * @example
 * Grabbing a reference to the RGB Transfer function from the scene:
 * ```
 * const rgbTransferFunction = scene
 *   .getVolumeActor()
 *   .getProperty()
 *   .getRGBTransferFunction(0);
 *
 * rgbTransferFunction.setRange(0, 5);
 *
 * invertRgbTransferFunction(rgbTransferFunction);
 * ```
 *
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_ColorTransferFunction.html|VTK.js: ColorTransferFunction}
 * @param rgbTransferFunction
 */
export default function invertRgbTransferFunction(rgbTransferFunction: any): void;
