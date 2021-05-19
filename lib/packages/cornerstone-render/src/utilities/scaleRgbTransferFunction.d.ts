/**
 * A utility that can be used to scale (in place) an RgbTransferFunction. We
 * often use this to scale the transfer function based on a PET calculation.
 *
 * @example
 * Grabbing a reference to the RGB Transfer function from the scene:
 * ```
 * const rgbTransferFunction = scene
 *   .getVolumeActor()
 *   .getProperty()
 *   .getRGBTransferFunction(0);
 *
 * scaleRgbTransferFunction(rgbTransferFunction, 2);
 * ```
 *
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_ColorTransferFunction.html|VTK.js: ColorTransferFunction}
 * @param rgbTransferFunction
 * @param scalingFactor
 */
export default function scaleRGBTransferFunction(rgbTransferFunction: any, scalingFactor: number): void;
