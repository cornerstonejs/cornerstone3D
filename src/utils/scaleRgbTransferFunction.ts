export default function scaleRGBTransferFunction(
  rgbTransferFunction: any,
  scalingFactor
) {
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
