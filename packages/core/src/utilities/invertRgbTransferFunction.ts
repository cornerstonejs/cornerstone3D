/**
 * A utility that can be used to invert (in place) an RgbTransferFunction.
 *
 * @example
 * Grabbing a reference to the RGB Transfer function from the viewport:
 * ```
 * const rgbTransferFunction = viewport
 *   .getActor()
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
export default function invertRgbTransferFunction(
  rgbTransferFunction: any
): void {
  // cut in case there is no function at all
  if (!rgbTransferFunction) {
    return;
  }

  const size = rgbTransferFunction.getSize();

  for (let index = 0; index < size; index++) {
    const nodeValue1 = [];

    rgbTransferFunction.getNodeValue(index, nodeValue1);

    nodeValue1[1] = 1 - nodeValue1[1];
    nodeValue1[2] = 1 - nodeValue1[2];
    nodeValue1[3] = 1 - nodeValue1[3];

    rgbTransferFunction.setNodeValue(index, nodeValue1);
  }
}
