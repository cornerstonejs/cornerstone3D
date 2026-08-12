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
type RawLUTItem = Record<string, unknown>;

/**
 * Decodes a buffer of LUT Data. Entries are 16 bits (LUT Data is US/OW) unless
 * LUT Descriptor declares 8 bits per entry, in which case they are packed one
 * per byte and reading them as 16 bit words gives half a LUT of nonsense.
 */
function fromBuffer(buffer: ArrayBufferLike, bitsPerEntry?: number): number[] {
  if (bitsPerEntry === 8) {
    return Array.from(new Uint8Array(buffer));
  }

  return Array.from(
    new Uint16Array(buffer, 0, Math.floor(buffer.byteLength / 2))
  );
}

function toNumberArray(
  data: unknown,
  bitsPerEntry?: number
): number[] | undefined {
  if (!data) {
    return undefined;
  }

  if (Array.isArray(data)) {
    // A single element array holding the buffer, as bulkdata sometimes arrives
    if (data.length === 1 && isBinary(data[0])) {
      return toNumberArray(data[0], bitsPerEntry);
    }

    return data.every((value) => typeof value === 'number')
      ? (data as number[])
      : undefined;
  }

  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    const view = data as ArrayBufferView & { BYTES_PER_ELEMENT?: number };

    // A byte view of a 16 bit LUT is a buffer that has not been reinterpreted
    // yet, rather than one entry per element
    if (view.BYTES_PER_ELEMENT === 1 && bitsPerEntry > 8) {
      return fromBuffer(
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
        bitsPerEntry
      );
    }

    return Array.from(view as unknown as ArrayLike<number>);
  }

  if (data instanceof ArrayBuffer) {
    return fromBuffer(data, bitsPerEntry);
  }

  return undefined;
}

function isBinary(value: unknown): boolean {
  return (
    value instanceof ArrayBuffer ||
    (ArrayBuffer.isView(value) && !(value instanceof DataView))
  );
}

function fromInlineBinary(
  inlineBinary: unknown,
  bitsPerEntry?: number
): number[] | undefined {
  if (typeof inlineBinary !== 'string' || typeof atob !== 'function') {
    return undefined;
  }

  const binary = atob(inlineBinary);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // DICOM JSON InlineBinary is little endian
  return fromBuffer(bytes.buffer, bitsPerEntry);
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
      firstValueMapped: Number(item.firstValueMapped) || 0,
      numBitsPerEntry: Number(item.numBitsPerEntry) || undefined,
    };
  }

  const descriptor =
    toNumberArray(item.LUTDescriptor) ??
    toNumberArray((item['00283002'] as RawLUTItem)?.Value);

  if (!descriptor || descriptor.length < 3) {
    return undefined;
  }

  // Value 3 of LUT Descriptor is how wide an entry is, so it has to be known
  // before the LUT Data can be decoded
  const bitsPerEntry = descriptor[2];
  const data =
    toNumberArray(item.LUTData, bitsPerEntry) ??
    toNumberArray((item['00283006'] as RawLUTItem)?.Value, bitsPerEntry) ??
    fromInlineBinary(
      (item['00283006'] as RawLUTItem)?.InlineBinary,
      bitsPerEntry
    );

  if (!data?.length) {
    return undefined;
  }

  // LUT Descriptor value 1 of 0 means 65536 entries (it is a US that cannot
  // hold 65536), and cannot be trusted beyond the data we actually received.
  const declaredEntries = descriptor[0] === 0 ? 65536 : descriptor[0];
  const numEntries = Math.min(declaredEntries, data.length);

  return {
    lut: data.length === numEntries ? data : data.slice(0, numEntries),
    firstValueMapped: descriptor[1] ?? 0,
    numBitsPerEntry: descriptor[2],
  };
}
