import type { CPUFallbackLUT } from '../types';

/**
 * The shapes a VOI LUT Sequence (0028,3010) item can arrive in, depending on
 * which metadata provider produced it:
 *
 * - the wadouri provider already returns `{ firstValueMapped, numBitsPerEntry, lut }`
 * - the naturalized (dcmjs) providers return `{ LUTDescriptor, LUTData }`
 * - raw DICOMweb JSON returns `{ '00283002': { Value }, '00283006': { Value | InlineBinary } }`
 *
 * Rendering only cares about the first form, so everything is converted to it.
 */
type RawLUTItem = {
  lut?: unknown;
  firstValueMapped?: number;
  numBitsPerEntry?: number;
  LUTDescriptor?: unknown;
  LUTData?: unknown;
  '00283002'?: { Value?: unknown };
  '00283006'?: { Value?: unknown; InlineBinary?: unknown };
};

/**
 * Copies the elements of a typed array into a plain array. A LUT holds up to
 * 65536 entries, and an indexed loop is faster than `Array.from`, which walks
 * the iterator protocol.
 */
const toUint16 = (value: number) => (value < 0 ? value + 65536 : value);
const toInt16 = (value: number) => (value > 32767 ? value - 65536 : value);

function copyElements(source: ArrayLike<number>): number[] {
  const entries = new Array<number>(source.length);

  for (let i = 0; i < entries.length; i++) {
    entries[i] = source[i];
  }

  return entries;
}

/**
 * The width in bytes of one entry of LUT Data (0028,3006). An entry is 16 bits
 * (LUT Data is US or OW). A LUT that declares 8 bits for each entry can also
 * pack one entry in each byte, with one pad byte after an odd count (PS3.3
 * C.11.2.1). The length of the data tells the two apart: packed data has fewer
 * than two bytes for each entry. The wadouri getLUTs uses the same rule.
 *
 * @param numEntries - value 1 of LUT Descriptor (0 already read as 65536)
 * @param bitsPerEntry - value 3 of LUT Descriptor
 * @param byteLength - the length of LUT Data in bytes
 */
export function getVOILUTBytesPerEntry(
  numEntries: number,
  bitsPerEntry: number,
  byteLength: number
): 1 | 2 {
  return bitsPerEntry === 8 && byteLength < 2 * numEntries ? 1 : 2;
}

/**
 * Decodes the bytes of LUT Data, with one or two bytes for each entry (refer
 * to getVOILUTBytesPerEntry).
 *
 * The pairs are combined by hand rather than through a `Uint16Array`, because
 * that needs an even offset into the buffer, which a view of a larger buffer
 * does not promise, and because DICOM writes LUT Data little endian whatever
 * the endianness of the host is.
 */
function fromBytes(
  bytes: Uint8Array,
  bitsPerEntry?: number,
  numEntries = bytes.length
): number[] {
  if (getVOILUTBytesPerEntry(numEntries, bitsPerEntry, bytes.length) === 1) {
    return copyElements(bytes);
  }

  const numWords = bytes.length >> 1;
  const entries = new Array<number>(numWords);

  for (let i = 0; i < numWords; i++) {
    entries[i] = bytes[2 * i] | (bytes[2 * i + 1] << 8);
  }

  return entries;
}

function toBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function isBinary(value: unknown): boolean {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function toNumberArray(
  data: unknown,
  bitsPerEntry?: number,
  numEntries?: number
): number[] | undefined {
  if (Array.isArray(data)) {
    // A single element array holding the buffer, as bulkdata sometimes arrives
    if (data.length === 1 && isBinary(data[0])) {
      return toNumberArray(data[0], bitsPerEntry, numEntries);
    }

    if (data.every((value) => typeof value === 'number')) {
      return data as number[];
    }

    return undefined;
  }

  if (data instanceof ArrayBuffer) {
    return fromBytes(new Uint8Array(data), bitsPerEntry, numEntries);
  }

  if (ArrayBuffer.isView(data)) {
    const elementSize = (data as { BYTES_PER_ELEMENT?: number })
      .BYTES_PER_ELEMENT;

    // A byte view of LUT Data is a buffer that nobody reinterpreted yet, which
    // can hold 16 bit or word-allocated 8 bit entries. A DataView has no element
    // size at all, so it holds bytes as well.
    const holdsBytes = !elementSize || (elementSize === 1 && bitsPerEntry >= 8);

    if (holdsBytes) {
      return fromBytes(toBytes(data), bitsPerEntry, numEntries);
    }

    return copyElements(data as unknown as ArrayLike<number>);
  }

  return undefined;
}

function fromInlineBinary(
  inlineBinary: unknown,
  bitsPerEntry?: number,
  numEntries?: number
): number[] | undefined {
  if (typeof inlineBinary !== 'string') {
    return undefined;
  }

  const binary = atob(inlineBinary);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return fromBytes(bytes, bitsPerEntry, numEntries);
}

/**
 * Normalizes a VOI LUT Sequence into the `{ firstValueMapped, numBitsPerEntry,
 * lut }` shape the renderers consume, accepting any of the provider shapes
 * described above.
 *
 * The stack path normalizes in the image loader, and the volume path
 * normalizes in `setDefaultVolumeVOI`. Thus this function stays in the core
 * package, where both paths reach it.
 *
 * @param voiLUTSequence - the VOI LUT Sequence, or a single item of it
 * @param pixelRepresentation - (0028,0103) of the image. LUT Descriptor value 2
 *   (First Value Mapped) is signed when it is 1 (C.11.2.1.1), and a provider
 *   can give the descriptor as US or as SS.
 * @returns the first usable LUT of the sequence, or undefined
 */
export default function normalizeVOILUTSequence(
  voiLUTSequence: unknown,
  pixelRepresentation?: number
): CPUFallbackLUT | undefined {
  const items = Array.isArray(voiLUTSequence)
    ? voiLUTSequence
    : [voiLUTSequence];

  for (const item of items) {
    const lut = normalizeItem(item as RawLUTItem, pixelRepresentation);

    if (lut) {
      return lut;
    }
  }

  return undefined;
}

function normalizeItem(
  item: RawLUTItem,
  pixelRepresentation?: number
): CPUFallbackLUT | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }

  // Already normalized (wadouri)
  const existing = toNumberArray(item.lut);

  if (existing?.length) {
    return {
      lut: existing,
      firstValueMapped: item.firstValueMapped ?? 0,
      numBitsPerEntry: item.numBitsPerEntry,
    };
  }

  const descriptor =
    toNumberArray(item.LUTDescriptor) ?? toNumberArray(item['00283002']?.Value);

  if (!descriptor || descriptor.length < 3) {
    return undefined;
  }

  // Value 3 of LUT Descriptor is how wide an entry is, so it has to be known
  // before the LUT Data can be decoded
  const bitsPerEntry = descriptor[2];
  // LUT Descriptor value 1 of 0 means 65536 entries (it is a US that cannot
  // hold 65536), and cannot be trusted beyond the data we actually received.
  // Read as US also when the provider gave SS.
  const declaredEntries = toUint16(descriptor[0]) || 65536;
  const data =
    toNumberArray(item.LUTData, bitsPerEntry, declaredEntries) ??
    toNumberArray(item['00283006']?.Value, bitsPerEntry, declaredEntries) ??
    fromInlineBinary(
      item['00283006']?.InlineBinary,
      bitsPerEntry,
      declaredEntries
    );

  if (!data?.length) {
    return undefined;
  }

  const numEntries = Math.min(declaredEntries, data.length);

  return {
    lut: numEntries === data.length ? data : data.slice(0, numEntries),
    firstValueMapped:
      pixelRepresentation === 1
        ? toInt16(descriptor[1])
        : pixelRepresentation === 0
          ? toUint16(descriptor[1])
          : descriptor[1],
    numBitsPerEntry: bitsPerEntry,
  };
}
