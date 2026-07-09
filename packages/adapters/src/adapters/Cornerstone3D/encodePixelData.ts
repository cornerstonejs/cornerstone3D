import { constants } from 'dcmjs';

// dcmjs has no named constant for RLE Lossless, so keep it declared here.
const RLE_LOSSLESS_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.5';
const EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID =
  constants.EXPLICIT_LITTLE_ENDIAN;

function getTransferSyntaxUid(multiframe: Record<string, unknown>): string {
  const meta = multiframe._meta as
    | { TransferSyntaxUID?: { Value?: string[] } }
    | undefined;
  const fromMeta = meta?.TransferSyntaxUID?.Value?.[0];

  if (fromMeta) {
    return fromMeta;
  }

  if (typeof multiframe.TransferSyntaxUID === 'string') {
    return multiframe.TransferSyntaxUID;
  }

  return EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID;
}

function getSegNumberOfFramesFromDataset(
  multiframe: Record<string, unknown>
): number {
  const fromTag = Number(multiframe.NumberOfFrames);
  if (fromTag > 0) {
    return fromTag;
  }

  const perFrame = multiframe.PerFrameFunctionalGroupsSequence;
  if (Array.isArray(perFrame) && perFrame.length > 0) {
    return perFrame.length;
  }

  return 1;
}

/**
 * Decodes a single PackBits/RLE byte segment (PS3.5 Annex G) into `outLength`
 * bytes. `start`/`end` bound the segment's byte range within `data`.
 */
function decodeRlePackBitsSegment(
  data: Int8Array,
  start: number,
  end: number,
  outLength: number
): Uint8Array {
  const out = new Uint8Array(outLength);
  let outIndex = 0;
  let inIndex = start;

  while (inIndex < end && outIndex < outLength) {
    const n = data[inIndex++];

    if (n >= 0 && n <= 127) {
      for (let i = 0; i < n + 1 && outIndex < outLength; ++i) {
        out[outIndex++] = data[inIndex++] & 0xff;
      }
    } else if (n <= -1 && n >= -127) {
      const value = data[inIndex++] & 0xff;
      for (let j = 0; j < -n + 1 && outIndex < outLength; ++j) {
        out[outIndex++] = value;
      }
    }
  }

  return out;
}

/**
 * Decodes one DICOM RLE-lossless fragment into packed bytes (one sample plane).
 * Used for the 1-bit binary path, which always carries exactly one segment.
 */
function decodeRleLosslessToPackedBytes(
  rleData: ArrayBuffer | Uint8Array,
  packedByteLength: number
): Uint8Array {
  const frameData =
    rleData instanceof Uint8Array ? rleData : new Uint8Array(rleData);
  const header = new DataView(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength
  );
  const data = new Int8Array(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength
  );
  const numSegments = header.getInt32(0, true);

  // Binary (1-bit) SEG RLE frames always carry exactly one segment. Reject
  // anything else rather than silently dropping the extra segments' data;
  // multi-byte (8/16-bit) frames are decoded by decodeRleMultiByteFrame.
  if (numSegments !== 1) {
    throw new Error(
      `Expected a single RLE segment for SEG re-encode, got ${numSegments}`
    );
  }

  const start = header.getInt32(4, true);
  let end = header.getInt32(8, true);

  if (end === 0) {
    end = frameData.length;
  }

  return decodeRlePackBitsSegment(data, start, end, packedByteLength);
}

/**
 * Decodes one RLE-lossless SEG frame carrying 8- or 16-bit samples. Mirrors the
 * encoder in this file (getRleSegmentsForFrame): 8-bit = one byte segment;
 * 16-bit = segment 0 high byte, segment 1 low byte (PS3.5 Annex G, MSB-first).
 */
function decodeRleMultiByteFrame(
  rleData: ArrayBuffer | Uint8Array,
  samplesPerFrame: number,
  bitsAllocated: number
): Uint8Array | Uint16Array {
  const frameData =
    rleData instanceof Uint8Array ? rleData : new Uint8Array(rleData);
  const header = new DataView(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength
  );
  const data = new Int8Array(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength
  );
  const numSegments = header.getInt32(0, true);
  const bytesPerSample = Math.ceil(bitsAllocated / 8);

  if (numSegments !== bytesPerSample) {
    throw new Error(
      `Expected ${bytesPerSample} RLE segment(s) for ${bitsAllocated}-bit SEG, got ${numSegments}`
    );
  }

  const segmentStart = (index: number) => header.getInt32(4 + index * 4, true);

  if (bitsAllocated <= 8) {
    return decodeRlePackBitsSegment(
      data,
      segmentStart(0),
      frameData.length,
      samplesPerFrame
    );
  }

  // 16-bit: segment 0 = high byte, segment 1 = low byte.
  const highStart = segmentStart(0);
  const lowStart = segmentStart(1);
  const highBytes = decodeRlePackBitsSegment(
    data,
    highStart,
    lowStart,
    samplesPerFrame
  );
  const lowBytes = decodeRlePackBitsSegment(
    data,
    lowStart,
    frameData.length,
    samplesPerFrame
  );

  const frame = new Uint16Array(samplesPerFrame);
  for (let i = 0; i < samplesPerFrame; i++) {
    frame[i] = ((highBytes[i] << 8) | lowBytes[i]) & 0xffff;
  }

  return frame;
}

/**
 * Decodes all SEG frames from an in-memory naturalized multiframe (buffer / legacy path).
 */
function decodeSegFramesFromMultiframe(
  multiframe: Record<string, unknown>
): ArrayLike<number>[] {
  const rows = Number(multiframe.Rows);
  const columns = Number(multiframe.Columns);
  const samplesPerFrame = rows * columns;
  const bitsAllocated = Number(multiframe.BitsAllocated);
  const numberOfFrames = getSegNumberOfFramesFromDataset(multiframe);
  const transferSyntaxUid = getTransferSyntaxUid(multiframe);

  if (!multiframe.PixelData) {
    throw new Error('SEG dataset has no PixelData');
  }

  if (bitsAllocated === 1) {
    if (transferSyntaxUid === RLE_LOSSLESS_TRANSFER_SYNTAX_UID) {
      const encodedFrames = Array.isArray(multiframe.PixelData)
        ? multiframe.PixelData
        : [multiframe.PixelData];
      const bytesPerFrame = getBytesForBinaryFrame(samplesPerFrame);
      const frames: Uint8Array[] = [];

      for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
        const rleFrame = encodedFrames[frameIndex];

        if (!rleFrame) {
          frames.push(new Uint8Array(samplesPerFrame));
          continue;
        }

        const packed = decodeRleLosslessToPackedBytes(rleFrame, bytesPerFrame);
        frames.push(unpackBinaryFrameFromPacked(packed, samplesPerFrame));
      }

      return frames;
    }

    return getBitmapFramesFromDataset(multiframe).frames;
  }

  if (transferSyntaxUid === RLE_LOSSLESS_TRANSFER_SYNTAX_UID) {
    // 8/16-bit RLE. dcmjs' single-sample decoder rejects the 2-segment frames a
    // 16-bit SEG carries (returning all zeros), so decode per-frame here in a
    // way that mirrors this file's encoder for both 8- and 16-bit.
    const encodedFrames = Array.isArray(multiframe.PixelData)
      ? multiframe.PixelData
      : [multiframe.PixelData];
    const frames: (Uint8Array | Uint16Array)[] = [];

    for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
      const rleFrame = encodedFrames[frameIndex];

      if (!rleFrame) {
        frames.push(
          bitsAllocated <= 8
            ? new Uint8Array(samplesPerFrame)
            : new Uint16Array(samplesPerFrame)
        );
        continue;
      }

      frames.push(
        decodeRleMultiByteFrame(rleFrame, samplesPerFrame, bitsAllocated)
      );
    }

    return frames;
  }

  // Uncompressed (Explicit VR LE) 8- or 16-bit frames. getBitmapFramesFromDataset
  // reads 16-bit PixelData as Uint16Array (by value), avoiding the byte/sample
  // confusion that halved 16-bit frames when sliced from a Uint8 view.
  return getBitmapFramesFromDataset(multiframe).frames;
}

function createDecodeImageDataFromMultiframe(
  multiframe: Record<string, unknown>
) {
  let cachedFrames: ArrayLike<number>[] | null = null;

  return async (_frameImageId: string, frameNumber: number) => {
    if (!cachedFrames) {
      cachedFrames = decodeSegFramesFromMultiframe(multiframe);
    }

    const frame = cachedFrames[frameNumber - 1];

    if (!frame) {
      throw new Error(`No SEG frame at index ${frameNumber}`);
    }

    return frame;
  };
}

function getBytesForBinaryFrame(numPixels: number) {
  return Math.ceil(numPixels / 8);
}

function asUint8PixelData(pixelData: unknown): Uint8Array {
  if (pixelData instanceof Uint8Array) {
    return pixelData;
  }

  if (pixelData instanceof ArrayBuffer) {
    return new Uint8Array(pixelData);
  }

  if (Array.isArray(pixelData)) {
    if (pixelData.length === 1) {
      return new Uint8Array(pixelData[0] as ArrayBuffer);
    }

    throw new Error(
      'Multiframe encapsulated PixelData fragments cannot be converted to binary frames for re-encoding'
    );
  }

  return new Uint8Array(pixelData as ArrayLike<number>);
}

/** Normalizes 0/1 or 0/255 binary mask samples to 0/1. */
function normalizeBinaryFrameTo01(frame: ArrayLike<number>): Uint8Array {
  const normalized = new Uint8Array(frame.length);

  for (let i = 0; i < frame.length; i++) {
    normalized[i] = frame[i] ? 1 : 0;
  }

  return normalized;
}

/**
 * Unpacks one binary frame from packed bytes where the first pixel is bit 0 of byte 0
 * (DICOM / explicit LEI re-encode convention).
 */
function unpackBinaryFrameFromPacked(
  packed: Uint8Array,
  samplesPerFrame: number
): Uint8Array {
  const frame = new Uint8Array(samplesPerFrame);

  for (let i = 0; i < samplesPerFrame; i++) {
    const bytePos = i >> 3;
    const bitPos = i % 8;
    frame[i] = packed[bytePos] & (1 << bitPos) ? 1 : 0;
  }

  return frame;
}

/**
 * Unpacks one frame from a continuous bit stream (dcmjs BitArray.pack across all frames).
 */
function unpackBinaryFrameFromContinuousPack(
  packed: Uint8Array,
  samplesPerFrame: number,
  frameIndex: number
): Uint8Array {
  const frame = new Uint8Array(samplesPerFrame);
  const bitOffset = frameIndex * samplesPerFrame;

  for (let i = 0; i < samplesPerFrame; i++) {
    const bitIndex = bitOffset + i;
    const bytePos = bitIndex >> 3;
    const bitPos = bitIndex % 8;
    frame[i] = packed[bytePos] & (1 << bitPos) ? 1 : 0;
  }

  return frame;
}

/**
 * Extracts per-frame 0/1 binary masks from a bitmap SEG dataset's PixelData.
 * Supports byte-per-pixel (pre-bitPack), per-frame-aligned packed, or continuous packed layouts.
 */
function getBitmapFramesFromDataset(dataset: {
  NumberOfFrames?: number | string;
  Rows?: number | string;
  Columns?: number | string;
  BitsAllocated?: number | string;
  PixelData?: unknown;
}) {
  const numberOfFrames = Number(dataset.NumberOfFrames) || 1;
  const rows = Number(dataset.Rows);
  const columns = Number(dataset.Columns);
  const samplesPerFrame = rows * columns;
  const bitsAllocated = Number(dataset.BitsAllocated);

  if (!dataset.PixelData) {
    throw new Error('Bitmap SEG dataset has no PixelData');
  }

  if (bitsAllocated === 1) {
    const buffer = asUint8PixelData(dataset.PixelData);
    const bytesPerFrame = getBytesForBinaryFrame(samplesPerFrame);
    const unpackedFrameBytes = samplesPerFrame * numberOfFrames;
    const perFramePackedBytes = bytesPerFrame * numberOfFrames;
    const continuousPackedBytes = getBytesForBinaryFrame(
      samplesPerFrame * numberOfFrames
    );
    const frames: Uint8Array[] = [];

    if (buffer.length === unpackedFrameBytes) {
      for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
        const start = frameIndex * samplesPerFrame;
        frames.push(
          normalizeBinaryFrameTo01(
            buffer.subarray(start, start + samplesPerFrame)
          )
        );
      }
    } else if (buffer.length === perFramePackedBytes) {
      for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
        const framePacked = buffer.subarray(
          frameIndex * bytesPerFrame,
          (frameIndex + 1) * bytesPerFrame
        );
        frames.push(unpackBinaryFrameFromPacked(framePacked, samplesPerFrame));
      }
    } else if (buffer.length === continuousPackedBytes) {
      for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
        frames.push(
          unpackBinaryFrameFromContinuousPack(
            buffer,
            samplesPerFrame,
            frameIndex
          )
        );
      }
    } else {
      throw new Error(
        `Unexpected 1-bit SEG PixelData length ${buffer.length} for ${numberOfFrames} frame(s) of ${samplesPerFrame} pixels`
      );
    }

    return { frames, bitsAllocated };
  }

  if (bitsAllocated <= 8) {
    const buffer = asUint8PixelData(dataset.PixelData);
    const frames: Uint8Array[] = [];

    for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
      const start = frameIndex * samplesPerFrame;
      frames.push(buffer.slice(start, start + samplesPerFrame));
    }

    return { frames, bitsAllocated };
  }

  // 16-bit. A naturalized Part 10 dataset carries PixelData as a single-element
  // array of ArrayBuffer ([buffer]) — unwrap through asUint8PixelData (as the
  // 8-bit branch does) before reinterpreting the raw little-endian bytes as
  // Uint16 samples. `new Uint16Array([ArrayBuffer])` would build a 1-element
  // array from the array-like instead.
  let buffer: Uint16Array;
  if (dataset.PixelData instanceof Uint16Array) {
    buffer = dataset.PixelData;
  } else {
    const bytes = asUint8PixelData(dataset.PixelData);
    buffer = new Uint16Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
  }
  const frames: Uint16Array[] = [];

  for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
    const start = frameIndex * samplesPerFrame;
    frames.push(buffer.slice(start, start + samplesPerFrame));
  }

  return { frames, bitsAllocated };
}

/**
 * PackBits (PS3.5 Annex G) encodes the samples in `[start, end)` into `output`.
 * Runs never cross the range boundary, which is how the per-row reset in
 * {@link packBits} keeps runs from spanning image rows.
 */
function packBitsRange(
  samples: ArrayLike<number>,
  start: number,
  end: number,
  output: number[]
) {
  let i = start;

  while (i < end) {
    let replicateRunLength = 1;
    while (
      i + replicateRunLength < end &&
      replicateRunLength < 128 &&
      samples[i + replicateRunLength] === samples[i]
    ) {
      replicateRunLength++;
    }

    if (replicateRunLength >= 2) {
      output.push(257 - replicateRunLength, samples[i] & 0xff);
      i += replicateRunLength;
      continue;
    }

    const literalStart = i;
    i++;
    while (i < end) {
      replicateRunLength = 1;
      while (
        i + replicateRunLength < end &&
        replicateRunLength < 128 &&
        samples[i + replicateRunLength] === samples[i]
      ) {
        replicateRunLength++;
      }

      if (replicateRunLength >= 2 || i - literalStart >= 128) {
        break;
      }

      i++;
    }

    const literalLength = i - literalStart;
    output.push(literalLength - 1);
    for (let j = literalStart; j < i; j++) {
      output.push(samples[j] & 0xff);
    }
  }
}

/**
 * PackBits-encodes a byte segment. When `rowLength` (bytes per image row) is
 * supplied and evenly divides the segment, each row is encoded independently so
 * no run — replicate or literal — spans a row boundary, as PS3.5 Annex G requires
 * and row-strict decoders/validators enforce. Without it, the whole segment is
 * encoded as one stream (legacy behavior).
 */
function packBits(samples: ArrayLike<number>, rowLength?: number) {
  const output: number[] = [];
  const total = samples.length;

  if (rowLength && rowLength > 0 && total % rowLength === 0) {
    for (let start = 0; start < total; start += rowLength) {
      packBitsRange(samples, start, start + rowLength, output);
    }
  } else {
    packBitsRange(samples, 0, total, output);
  }

  return Uint8Array.from(output);
}

function bitPackBinaryFrame(frame: ArrayLike<number>) {
  const packedLength = Math.ceil(frame.length / 8);
  const packed = new Uint8Array(packedLength);

  for (let i = 0; i < frame.length; i++) {
    if (frame[i]) {
      packed[i >> 3] |= 1 << i % 8;
    }
  }

  return packed;
}

function concatUint8Frames(frames: ArrayLike<number>[]) {
  const totalLength = frames.reduce((sum, frame) => sum + frame.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) {
      combined[offset + i] = frame[i] & 0xff;
    }
    offset += frame.length;
  }
  return combined;
}

function concatUint16Frames(frames: ArrayLike<number>[]) {
  const totalLength = frames.reduce((sum, frame) => sum + frame.length, 0);
  const combined = new Uint16Array(totalLength);
  let offset = 0;
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i++) {
      combined[offset + i] = frame[i] & 0xffff;
    }
    offset += frame.length;
  }
  return combined;
}

function getRleSegmentsForFrame(
  frame: ArrayLike<number>,
  bitsAllocated: number
) {
  if (bitsAllocated === 1) {
    return [bitPackBinaryFrame(frame)];
  }

  if (bitsAllocated === 8) {
    const segment = new Uint8Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      segment[i] = frame[i] & 0xff;
    }
    return [segment];
  }

  if (bitsAllocated === 16) {
    const highByteSegment = new Uint8Array(frame.length);
    const lowByteSegment = new Uint8Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      const sample = frame[i] & 0xffff;
      highByteSegment[i] = (sample >> 8) & 0xff;
      lowByteSegment[i] = sample & 0xff;
    }
    // DICOM PS3.5 Annex G orders RLE byte segments most-significant-byte first
    // (segment 0 = high byte), matching the dicomImageLoader decode16 reader.
    return [highByteSegment, lowByteSegment];
  }

  throw new Error(
    `Unsupported bitsAllocated for RLE encoding: ${bitsAllocated}. Expected 1, 8, or 16.`
  );
}

function encodeFrameToRle(
  frame: ArrayLike<number>,
  bitsAllocated: number,
  columns?: number
) {
  const segmentPlanes = getRleSegmentsForFrame(frame, bitsAllocated);
  if (segmentPlanes.length > 15) {
    throw new Error(
      `RLE segment count ${segmentPlanes.length} exceeds DICOM maximum of 15 segments`
    );
  }

  // Row length within each byte plane. 8/16-bit planes hold one byte per sample,
  // so a row is `columns` bytes. 1-bit planes are bit-packed, so a row is only
  // byte-aligned (and thus per-row encodable) when columns is a multiple of 8.
  const rowLength =
    columns && columns > 0
      ? bitsAllocated === 1
        ? columns % 8 === 0
          ? columns / 8
          : undefined
        : columns
      : undefined;

  const encodedSegments = segmentPlanes.map((segment) => {
    const encoded = packBits(segment, rowLength);
    if (encoded.length % 2 === 0) {
      return encoded;
    }

    const padded = new Uint8Array(encoded.length + 1);
    padded.set(encoded, 0);
    return padded;
  });

  const header = new DataView(new ArrayBuffer(64));
  header.setUint32(0, encodedSegments.length, true);
  let offset = 64;
  for (let i = 0; i < encodedSegments.length; i++) {
    header.setUint32((i + 1) * 4, offset, true);
    offset += encodedSegments[i].length;
  }

  const frameBytes = new Uint8Array(offset);
  frameBytes.set(new Uint8Array(header.buffer), 0);

  let writeOffset = 64;
  for (let i = 0; i < encodedSegments.length; i++) {
    frameBytes.set(encodedSegments[i], writeOffset);
    writeOffset += encodedSegments[i].length;
  }

  return frameBytes.buffer;
}

export function encodeFramesToTransferSyntax({
  transferSyntaxUID,
  frames,
  bitsAllocated,
  columns,
}: {
  transferSyntaxUID: string;
  frames: ArrayLike<number>[];
  bitsAllocated: number;
  // Image width (samples per row). Enables per-row RLE encoding so runs do not
  // cross row boundaries (PS3.5 Annex G). Optional for backward compatibility.
  columns?: number;
}) {
  if (transferSyntaxUID === RLE_LOSSLESS_TRANSFER_SYNTAX_UID) {
    return {
      transferSyntaxUID,
      pixelDataVR: 'OB',
      pixelData: frames.map((frame) =>
        encodeFrameToRle(frame, bitsAllocated, columns)
      ),
    };
  }

  if (transferSyntaxUID === EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID) {
    if (bitsAllocated === 1) {
      const packedFrames = frames.map((frame) => bitPackBinaryFrame(frame));
      const combinedPacked = concatUint8Frames(packedFrames);
      return {
        transferSyntaxUID,
        pixelDataVR: 'OW',
        pixelData: combinedPacked,
      };
    }

    return {
      transferSyntaxUID,
      pixelDataVR: bitsAllocated <= 8 ? 'OB' : 'OW',
      pixelData:
        bitsAllocated <= 8
          ? concatUint8Frames(frames)
          : concatUint16Frames(frames),
    };
  }

  throw new Error(
    `Unsupported transfer syntax for SEG encoding: ${transferSyntaxUID}. ` +
      `Supported: ${RLE_LOSSLESS_TRANSFER_SYNTAX_UID}, ${EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID}`
  );
}

export {
  RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
  EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
  getBitmapFramesFromDataset,
  bitPackBinaryFrame,
  unpackBinaryFrameFromPacked,
  decodeSegFramesFromMultiframe,
  createDecodeImageDataFromMultiframe,
  getSegNumberOfFramesFromDataset,
  packBits,
  encodeFrameToRle,
};
