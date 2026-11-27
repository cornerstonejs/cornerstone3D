import getValue from './getValue';
import getNumberValue from './getNumberValue';
import type { WADORSMetaData, WADORSMetaDataElement } from '../../../types';

/**
 * Returns the raw bytes of a DICOMweb JSON Overlay Data (60xx,3000) element,
 * or undefined when they are not available in the metadata (for example when
 * the server only sent a BulkDataURI).
 */
function getOverlayDataBytes(element: {
  InlineBinary?: string;
  Value?: unknown;
}): Uint8Array | undefined {
  if (typeof element.InlineBinary === 'string') {
    const binaryString = atob(element.InlineBinary);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Overlay data that was already retrieved (e.g. from the BulkDataURI),
  // stored either as Value itself or as Value[0]
  const value =
    element.Value instanceof ArrayBuffer || ArrayBuffer.isView(element.Value)
      ? element.Value
      : getValue(element as WADORSMetaDataElement);
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
}

export default function getOverlayPlaneModule(metaData: WADORSMetaData) {
  const overlays = [];

  for (let overlayGroup = 0x00; overlayGroup <= 0x1e; overlayGroup += 0x02) {
    // DICOMweb JSON keys are 8 uppercase hex digits, e.g. '60003000'
    const groupStr = `60${overlayGroup
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()}`;

    const data = metaData[`${groupStr}3000`];

    if (!data) {
      continue;
    }

    const pixelData = [];
    const bytes = getOverlayDataBytes(data);

    if (bytes) {
      for (let i = 0; i < bytes.length; i++) {
        for (let k = 0; k < 8; k++) {
          pixelData[i * 8 + k] = (bytes[i] >> k) & 0b1; // eslint-disable-line no-bitwise
        }
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
