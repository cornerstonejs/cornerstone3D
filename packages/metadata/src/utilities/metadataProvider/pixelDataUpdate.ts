/**
 * Converts the palette data information into
 * an array when it is present as an array buffer, typed array, array of buffers, or InlineBinary.
 */

import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';
import { getSingleBufferFromArray } from '../bulkDataFromArray';

function normalizePaletteLUT(raw: unknown): {
  view: Uint8Array | Uint16Array;
  byteLength: number;
} {
  if (raw instanceof ArrayBuffer) {
    const len = raw.byteLength;
    return {
      view: len <= 256 ? new Uint8Array(raw) : new Uint16Array(raw),
      byteLength: len,
    };
  }
  if (ArrayBuffer.isView(raw)) {
    const v = raw as Uint8Array | Uint16Array;
    return { view: v, byteLength: v.byteLength };
  }
  if (Array.isArray(raw)) {
    const view = getSingleBufferFromArray(raw);
    if (view) {
      return {
        view: view as Uint8Array | Uint16Array,
        byteLength: view.byteLength,
      };
    }
  }
  const inline =
    raw != null &&
    typeof raw === 'object' &&
    'InlineBinary' in (raw as Record<string, unknown>) &&
    typeof (raw as { InlineBinary?: string }).InlineBinary === 'string';
  if (inline) {
    const b64 = (raw as { InlineBinary: string }).InlineBinary;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return {
      view: bytes,
      byteLength: bytes.byteLength,
    };
  }
  const desc = describeValue(raw);
  throw new Error(
    'Palette color lookup table data could not be normalized: expected ArrayBuffer, ArrayBufferView, or object with InlineBinary string. ' +
      desc
  );
}

/**
 * Normalizes raw palette LUT data to the final typed array using the descriptor.
 * Handles validation and 8-bit vs 16-bit conversion in one place.
 * @param raw - Raw LUT data (ArrayBuffer, view, array of buffers, or InlineBinary)
 * @param descriptor - [numEntries, firstMappedValue, bitsPerEntry]
 * @param color - Channel name for error messages ('red' | 'green' | 'blue')
 * @returns Uint8Array or Uint16Array ready to assign to the module
 */
function normalizePaletteLUTToFinal(
  raw: unknown,
  descriptor: number[],
  color: 'red' | 'green' | 'blue'
): Uint8Array | Uint16Array {
  descriptor[0] ||= 65536;
  const tableLen = descriptor[0];
  const bits = descriptor[2] ?? 16;
  const { view, byteLength } = normalizePaletteLUT(raw);
  const expectedByteLengths = [tableLen, tableLen * 2];
  if (!expectedByteLengths.includes(byteLength)) {
    const actualEntries =
      byteLength === tableLen ? view.length : Math.floor(byteLength / 2);
    throw new Error(
      `Palette color lookup table length mismatch (${color}): descriptor has ${tableLen} entries (expected byteLength ${tableLen} or ${tableLen * 2}), but got ${byteLength} bytes (${actualEntries} effective entries). This may indicate duplicated or concatenated buffer data from the natural filter.`
    );
  }
  const use8 = tableLen === byteLength;
  if (use8) {
    return view instanceof Uint8Array ? view : new Uint8Array(view);
  }
  return view instanceof Uint16Array
    ? view
    : new Uint16Array(view.buffer, view.byteOffset, view.byteLength / 2);
}

function describeValue(raw: unknown): string {
  if (raw === null) return 'Got null.';
  if (raw === undefined) return 'Got undefined.';
  if (typeof raw !== 'object') return `Got primitive: ${typeof raw}.`;
  const obj = raw as Record<string, unknown>;
  const constructorName =
    obj.constructor != null && typeof obj.constructor === 'function'
      ? (obj.constructor as Function).name
      : 'unknown';
  const keys = Object.keys(obj);
  const preview: Record<string, string> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v === null) preview[k] = 'null';
    else if (v === undefined) preview[k] = 'undefined';
    else if (typeof v === 'string')
      preview[k] =
        v.length > 80
          ? `"${v.slice(0, 80)}..." (len=${v.length})`
          : JSON.stringify(v);
    else if (Array.isArray(v))
      preview[k] =
        `Array(${v.length})${v.length > 0 ? ` e.g. ${JSON.stringify(v[0])}` : ''}`;
    else if (v instanceof ArrayBuffer)
      preview[k] = `ArrayBuffer(${v.byteLength})`;
    else if (ArrayBuffer.isView(v))
      preview[k] =
        `${(v as object).constructor?.name ?? 'ArrayBufferView'}(${(v as ArrayBufferView).byteLength})`;
    else preview[k] = typeof v;
  }
  return `Got object: constructor=${constructorName}, keys=[${keys.join(', ')}], preview=${JSON.stringify(preview)}.`;
}

/**
 * Converts pixel data to the appropriate array type
 */
export function pixelDataUpdate(next, query, data, options) {
  const basePixelData = next(query, data, options);
  if (!basePixelData) {
    return basePixelData;
  }
  const result = { ...basePixelData };
  const {
    redPaletteColorLookupTableData,
    greenPaletteColorLookupTableData,
    bluePaletteColorLookupTableData,
    pixelPaddingValue,
    pixelPaddingRangeLimit,
    pixelRepresentation,
  } = basePixelData;

  if (
    redPaletteColorLookupTableData != null &&
    greenPaletteColorLookupTableData != null &&
    bluePaletteColorLookupTableData != null
  ) {
    result.redPaletteColorLookupTableData = normalizePaletteLUTToFinal(
      redPaletteColorLookupTableData,
      result.redPaletteColorLookupTableDescriptor,
      'red'
    );
    result.greenPaletteColorLookupTableData = normalizePaletteLUTToFinal(
      greenPaletteColorLookupTableData,
      result.greenPaletteColorLookupTableDescriptor,
      'green'
    );
    result.bluePaletteColorLookupTableData = normalizePaletteLUTToFinal(
      bluePaletteColorLookupTableData,
      result.bluePaletteColorLookupTableDescriptor,
      'blue'
    );
  }

  if (pixelRepresentation == 1) {
    if (pixelPaddingValue < 0) {
      result.pixelPaddingValue = pixelPaddingValue & 0xffff;
    }
    if (pixelPaddingRangeLimit < 0) {
      result.pixelPaddingValue = pixelPaddingRangeLimit & 0xffff;
    }
    const { smallestPixelValue, largestPixelValue } = result;
    if (smallestPixelValue < 0) {
      result.smallestPixelValue = smallestPixelValue & 0xffff;
    }
    if (largestPixelValue < 0) {
      result.largestPixelValue = largestPixelValue & 0xffff;
    }
  }

  return result;
}

export function registerPixelDataUpdate() {
  addTypedProvider(MetadataModules.IMAGE_PIXEL, pixelDataUpdate);
}
