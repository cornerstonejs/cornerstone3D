function decodeRLE(imageFrame, pixelData) {
  if (imageFrame.bitsAllocated === 8) {
    if (imageFrame.planarConfiguration) {
      return decode8Planar(imageFrame, pixelData);
    }

    return decode8(imageFrame, pixelData);
  } else if (imageFrame.bitsAllocated === 16) {
    return decode16(imageFrame, pixelData);
  }

  throw new Error('unsupported pixel format for RLE');
}

function decode8(imageFrame, pixelData) {
  const frameData = pixelData;
  const frameSize = imageFrame.rows * imageFrame.columns;
  const outFrame = new ArrayBuffer(frameSize * imageFrame.samplesPerPixel);
  const header = new DataView(frameData.buffer, frameData.byteOffset);
  const data = new Int8Array(frameData.buffer, frameData.byteOffset);
  const out = new Int8Array(outFrame);

  let outIndex = 0;
  const numSegments = header.getInt32(0, true);

  for (let s = 0; s < numSegments; ++s) {
    outIndex = s;

    let inIndex = header.getInt32((s + 1) * 4, true);

    let maxIndex = header.getInt32((s + 2) * 4, true);

    if (maxIndex === 0) {
      maxIndex = frameData.length;
    }

    const endOfSegment = frameSize * numSegments;

    while (inIndex < maxIndex) {
      const n = data[inIndex++];

      if (n >= 0 && n <= 127) {
        // copy n bytes
        for (let i = 0; i < n + 1 && outIndex < endOfSegment; ++i) {
          out[outIndex] = data[inIndex++];
          outIndex += imageFrame.samplesPerPixel;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];
        // run of n bytes

        for (let j = 0; j < -n + 1 && outIndex < endOfSegment; ++j) {
          out[outIndex] = value;
          outIndex += imageFrame.samplesPerPixel;
        }
      } /* else if (n === -128) {

      } // do nothing */
    }
  }
  imageFrame.pixelData = new Uint8Array(outFrame);

  return imageFrame;
}

function decode8Planar(imageFrame, pixelData) {
  const frameData = pixelData;
  const frameSize = imageFrame.rows * imageFrame.columns;
  const outFrame = new ArrayBuffer(frameSize * imageFrame.samplesPerPixel);
  const header = new DataView(frameData.buffer, frameData.byteOffset);
  const data = new Int8Array(frameData.buffer, frameData.byteOffset);
  const out = new Int8Array(outFrame);

  let outIndex = 0;
  const numSegments = header.getInt32(0, true);

  for (let s = 0; s < numSegments; ++s) {
    outIndex = s * frameSize;

    let inIndex = header.getInt32((s + 1) * 4, true);

    let maxIndex = header.getInt32((s + 2) * 4, true);

    if (maxIndex === 0) {
      maxIndex = frameData.length;
    }

    const endOfSegment = frameSize * numSegments;

    while (inIndex < maxIndex) {
      const n = data[inIndex++];

      if (n >= 0 && n <= 127) {
        // copy n bytes
        for (let i = 0; i < n + 1 && outIndex < endOfSegment; ++i) {
          out[outIndex] = data[inIndex++];
          outIndex++;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];
        // run of n bytes

        for (let j = 0; j < -n + 1 && outIndex < endOfSegment; ++j) {
          out[outIndex] = value;
          outIndex++;
        }
      } /* else if (n === -128) {

      } // do nothing */
    }
  }
  imageFrame.pixelData = new Uint8Array(outFrame);

  return imageFrame;
}

function decode16(imageFrame, pixelData) {
  const frameData = pixelData;
  const frameSize = imageFrame.rows * imageFrame.columns;
  const outFrame = new ArrayBuffer(frameSize * imageFrame.samplesPerPixel * 2);

  const header = new DataView(frameData.buffer, frameData.byteOffset);
  const data = new Int8Array(frameData.buffer, frameData.byteOffset);
  const out = new Int8Array(outFrame);

  const numSegments = header.getInt32(0, true);

  for (let s = 0; s < numSegments; ++s) {
    let outIndex = 0;
    const highByte = s === 0 ? 1 : 0;

    let inIndex = header.getInt32((s + 1) * 4, true);

    let maxIndex = header.getInt32((s + 2) * 4, true);

    if (maxIndex === 0) {
      maxIndex = frameData.length;
    }

    while (inIndex < maxIndex) {
      const n = data[inIndex++];

      if (n >= 0 && n <= 127) {
        for (let i = 0; i < n + 1 && outIndex < frameSize; ++i) {
          out[outIndex * 2 + highByte] = data[inIndex++];
          outIndex++;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];

        for (let j = 0; j < -n + 1 && outIndex < frameSize; ++j) {
          out[outIndex * 2 + highByte] = value;
          outIndex++;
        }
      } /* else if (n === -128) {

      } // do nothing */
    }
  }
  if (imageFrame.pixelRepresentation === 0) {
    imageFrame.pixelData = new Uint16Array(outFrame);
  } else {
    imageFrame.pixelData = new Int16Array(outFrame);
  }

  return imageFrame;
}

export default decodeRLE;
