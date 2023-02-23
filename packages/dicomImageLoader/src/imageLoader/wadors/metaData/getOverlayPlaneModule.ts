import getValue from './getValue';
import getNumberValue from './getNumberValue';
import { WADORSMetaData } from '../../../types';

export default function getOverlayPlaneModule(metaData: WADORSMetaData) {
  const overlays = [];

  for (let overlayGroup = 0x00; overlayGroup <= 0x1e; overlayGroup += 0x02) {
    let groupStr = `x60${overlayGroup.toString(16)}`;

    if (groupStr.length === 4) {
      groupStr = `x600${overlayGroup.toString(16)}`;
    }

    /**
     * @todo there is a type issue with WADORSMetaData. Currently WADORSMetaData
     * on includes  string[] | number[] | boolean. from the look of this, data
     * is a more complex type
     */
    const data = getValue<any>(metaData[`${groupStr}3000`]);

    if (!data) {
      continue;
    }

    const pixelData = [];

    for (let i = 0; i < data.length; i++) {
      for (let k = 0; k < 8; k++) {
        const byte_as_int = metaData.Value[data.dataOffset + i];

        pixelData[i * 8 + k] = (byte_as_int >> k) & 0b1; // eslint-disable-line no-bitwise
      }
    }

    overlays.push({
      rows: getNumberValue(metaData[`${groupStr}0010`]),
      columns: getNumberValue(metaData[`${groupStr}0011`]),
      type: getValue(metaData[`${groupStr}0040`]),
      x: getNumberValue(metaData[`${groupStr}0050`], 1) - 1,
      y: getNumberValue(metaData[`${groupStr}0050`], 0) - 1,
      pixelData,
      description: getValue(metaData[`${groupStr}0022`]),
      label: getValue(metaData[`${groupStr}1500`]),
      roiArea: getValue(metaData[`${groupStr}1301`]),
      roiMean: getValue(metaData[`${groupStr}1302`]),
      roiStandardDeviation: getValue(metaData[`${groupStr}1303`]),
    });
  }

  return {
    overlays,
  };
}
