export default function getOverlayPlaneModule(dataSet) {
  const overlays = [];

  for (let overlayGroup = 0x00; overlayGroup <= 0x1e; overlayGroup += 0x02) {
    let groupStr = `x60${overlayGroup.toString(16)}`;

    if (groupStr.length === 4) {
      groupStr = `x600${overlayGroup.toString(16)}`;
    }

    const data = dataSet.elements[`${groupStr}3000`];

    if (!data) {
      continue;
    }

    const pixelData = [];

    for (let i = 0; i < data.length; i++) {
      for (let k = 0; k < 8; k++) {
        const byte_as_int = dataSet.byteArray[data.dataOffset + i];

        pixelData[i * 8 + k] = (byte_as_int >> k) & 0b1; // eslint-disable-line no-bitwise
      }
    }

    overlays.push({
      rows: dataSet.uint16(`${groupStr}0010`),
      columns: dataSet.uint16(`${groupStr}0011`),
      type: dataSet.string(`${groupStr}0040`),
      x: dataSet.int16(`${groupStr}0050`, 1) - 1,
      y: dataSet.int16(`${groupStr}0050`, 0) - 1,
      pixelData,
      description: dataSet.string(`${groupStr}0022`),
      label: dataSet.string(`${groupStr}1500`),
      roiArea: dataSet.string(`${groupStr}1301`),
      roiMean: dataSet.string(`${groupStr}1302`),
      roiStandardDeviation: dataSet.string(`${groupStr}1303`),
    });
  }

  return {
    overlays,
  };
}
