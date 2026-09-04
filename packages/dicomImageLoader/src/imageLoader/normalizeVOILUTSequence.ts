import type { Types } from '@cornerstonejs/core';

type LUTLike = Types.CPUFallbackLUT;

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
function copyElements(source: ArrayLike<number>): number[] {
  const entries = new Array<number>(source.length);

  for (let i = 0; i < entries.length; i++) {
    entries[i] = source[i];
  }

  return entries;
}

/**
 * Decodes the bytes of LUT Data. An entry is 16 bits (LUT Data is US or OW)
 * unless LUT Descriptor declares 8 bits for each entry, in which case the
 * entries are packed one to a byte and reading them as 16 bit words gives half
 * a LUT of nonsense.
 *
 * The pairs are combined by hand rather than through a `Uint16Array`, because
 * that needs an even offset into the buffer, which a view of a larger buffer
 * does not promise, and because DICOM writes LUT Data little endian whatever
 * the endianness of the host is.
 */
function fromBytes(bytes: Uint8Array, bitsPerEntry?: number): number[] {
  if (bitsPerEntry === 8) {
    return copyElements(bytes);
  }

  const numEntries = bytes.length >> 1;
  const entries = new Array<number>(numEntries);

  for (let i = 0; i < numEntries; i++) {
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
  bitsPerEntry?: number
): number[] | undefined {
  if (Array.isArray(data)) {
    // A single element array holding the buffer, as bulkdata sometimes arrives
    if (data.length === 1 && isBinary(data[0])) {
      return toNumberArray(data[0], bitsPerEntry);
    }

    if (data.every((value) => typeof value === 'number')) {
      return data as number[];
    }

    return undefined;
  }

  if (data instanceof ArrayBuffer) {
    return fromBytes(new Uint8Array(data), bitsPerEntry);
  }

  if (ArrayBuffer.isView(data)) {
    const elementSize = (data as { BYTES_PER_ELEMENT?: number })
      .BYTES_PER_ELEMENT;

    // A byte view of a 16 bit LUT is a buffer that nobody reinterpreted yet,
    // rather than one entry for each element. A DataView has no element size at
    // all, so it holds bytes as well.
    const holdsBytes = !elementSize || (elementSize === 1 && bitsPerEntry > 8);

    if (holdsBytes) {
      return fromBytes(toBytes(data), bitsPerEntry);
    }

    return copyElements(data as unknown as ArrayLike<number>);
  }

  return undefined;
}

function fromInlineBinary(
  inlineBinary: unknown,
  bitsPerEntry?: number
): number[] | undefined {
  if (typeof inlineBinary !== 'string') {
    return undefined;
  }

  const binary = atob(inlineBinary);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return fromBytes(bytes, bitsPerEntry);
}

/**
 * Normalizes a VOI LUT Sequence into the `{ firstValueMapped, numBitsPerEntry,
 * lut }` shape the renderers consume, accepting any of the provider shapes
 * described above.
 *
 * @param voiLUTSequence - the VOI LUT Sequence, or a single item of it
 * @returns the first usable LUT of the sequence, or undefined
 */
export default function normalizeVOILUTSequence(
  voiLUTSequence: unknown
): LUTLike | undefined {
  const items = Array.isArray(voiLUTSequence)
    ? voiLUTSequence
    : [voiLUTSequence];

  for (const item of items) {
    const lut = normalizeItem(item as RawLUTItem);

    if (lut) {
      return lut;
    }
  }

  return undefined;
}

function normalizeItem(item: RawLUTItem): LUTLike | undefined {
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
  const data =
    toNumberArray(item.LUTData, bitsPerEntry) ??
    toNumberArray(item['00283006']?.Value, bitsPerEntry) ??
    fromInlineBinary(item['00283006']?.InlineBinary, bitsPerEntry);

  if (!data?.length) {
    return undefined;
  }

  // LUT Descriptor value 1 of 0 means 65536 entries (it is a US that cannot
  // hold 65536), and cannot be trusted beyond the data we actually received.
  const numEntries = Math.min(descriptor[0] || 65536, data.length);

  return {
    lut: numEntries === data.length ? data : data.slice(0, numEntries),
    firstValueMapped: descriptor[1],
    numBitsPerEntry: bitsPerEntry,
  };
}
