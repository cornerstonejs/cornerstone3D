/**
 * A utility that can be used to scale (in place) an RgbTransferFunction. We
 * often use this to scale the transfer function based on a PET calculation.
 *
 * @example
 * Grabbing a reference to the RGB Transfer function from the viewport:
 * ```
 * const rgbTransferFunction = viewport
 *   .getActor()
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
export default function scaleRGBTransferFunction(
  rgbTransferFunction: any,
  scalingFactor: number
): void {
  const size = rgbTransferFunction.getSize();

  for (let index = 0; index < size; index++) {
    const nodeValue1 = [];

    rgbTransferFunction.getNodeValue(index, nodeValue1);

    nodeValue1[1] = nodeValue1[1] * scalingFactor;
    nodeValue1[2] = nodeValue1[2] * scalingFactor;
    nodeValue1[3] = nodeValue1[3] * scalingFactor;

    rgbTransferFunction.setNodeValue(index, nodeValue1);
  }
}
