import { constants, utilities as dcmjsUtilities } from 'dcmjs';

const { decode: decodeDcmjsRleRows } = dcmjsUtilities.compression;

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
 * Decodes one DICOM RLE-lossless fragment into packed bytes (one sample plane).
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
  const out = new Uint8Array(packedByteLength);
  const numSegments = header.getInt32(0, true);

  // This decoder produces a single packed sample plane (see the function's
  // docstring) and only sizes `out` for one segment. Binary (1-bit) SEG RLE
  // frames always carry exactly one segment; multi-byte planes are decoded
  // elsewhere via dcmjs. Reject anything else rather than silently dropping
  // the extra segments' data.
  if (numSegments !== 1) {
    throw new Error(
      `Expected a single RLE segment for SEG re-encode, got ${numSegments}`
    );
  }

  let outIndex = 0;
  let inIndex = header.getInt32(4, true);
  let maxIndex = header.getInt32(8, true);

  if (maxIndex === 0) {
    maxIndex = frameData.length;
  }

  while (inIndex < maxIndex && outIndex < packedByteLength) {
    const n = data[inIndex++];

    if (n >= 0 && n <= 127) {
      for (let i = 0; i < n + 1 && outIndex < packedByteLength; ++i) {
        out[outIndex++] = data[inIndex++] & 0xff;
      }
    } else if (n <= -1 && n >= -127) {
      const value = data[inIndex++] & 0xff;
      for (let j = 0; j < -n + 1 && outIndex < packedByteLength; ++j) {
        out[outIndex++] = value;
      }
    }
  }

  return out;
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
    const encodedFrames = Array.isArray(multiframe.PixelData)
      ? multiframe.PixelData
      : [multiframe.PixelData];
    const decoded = decodeDcmjsRleRows(
      encodedFrames,
      rows,
      columns
    ) as Uint8Array;
    const frames: Uint8Array[] = [];

    for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
      const start = frameIndex * samplesPerFrame;
      frames.push(decoded.subarray(start, start + samplesPerFrame));
    }

    return frames;
  }

  const buffer = asUint8PixelData(multiframe.PixelData);
  const frames: Uint8Array[] = [];

  for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
    const start = frameIndex * samplesPerFrame;
    frames.push(buffer.subarray(start, start + samplesPerFrame));
  }

  return frames;
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

  const buffer =
    dataset.PixelData instanceof Uint16Array
      ? dataset.PixelData
      : new Uint16Array(dataset.PixelData as ArrayBuffer);
  const frames: Uint16Array[] = [];

  for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
    const start = frameIndex * samplesPerFrame;
    frames.push(buffer.slice(start, start + samplesPerFrame));
  }

  return { frames, bitsAllocated };
}

function packBits(samples: ArrayLike<number>) {
  const output: number[] = [];
  let i = 0;

  while (i < samples.length) {
    let replicateRunLength = 1;
    while (
      i + replicateRunLength < samples.length &&
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
    while (i < samples.length) {
      replicateRunLength = 1;
      while (
        i + replicateRunLength < samples.length &&
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

function encodeFrameToRle(frame: ArrayLike<number>, bitsAllocated: number) {
  const segmentPlanes = getRleSegmentsForFrame(frame, bitsAllocated);
  if (segmentPlanes.length > 15) {
    throw new Error(
      `RLE segment count ${segmentPlanes.length} exceeds DICOM maximum of 15 segments`
    );
  }

  const encodedSegments = segmentPlanes.map((segment) => {
    const encoded = packBits(segment);
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
}: {
  transferSyntaxUID: string;
  frames: ArrayLike<number>[];
  bitsAllocated: number;
}) {
  if (transferSyntaxUID === RLE_LOSSLESS_TRANSFER_SYNTAX_UID) {
    return {
      transferSyntaxUID,
      pixelDataVR: 'OB',
      pixelData: frames.map((frame) => encodeFrameToRle(frame, bitsAllocated)),
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
};
