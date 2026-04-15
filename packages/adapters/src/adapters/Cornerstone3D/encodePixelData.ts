const RLE_LOSSLESS_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.5';
const EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.1';

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
    const lowByteSegment = new Uint8Array(frame.length);
    const highByteSegment = new Uint8Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      const sample = frame[i] & 0xffff;
      lowByteSegment[i] = sample & 0xff;
      highByteSegment[i] = (sample >> 8) & 0xff;
    }
    return [lowByteSegment, highByteSegment];
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
};
