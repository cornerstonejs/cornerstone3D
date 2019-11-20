/* eslint no-bitwise: 0 */
function swap16(val) {
  return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}

function decodeBigEndian(imageFrame, pixelData) {
  if (imageFrame.bitsAllocated === 16) {
    let arrayBuffer = pixelData.buffer;

    let offset = pixelData.byteOffset;
    const length = pixelData.length;
    // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
    // buffers on it

    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
    } else {
      imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
    }
    // Do the byte swap
    for (let i = 0; i < imageFrame.pixelData.length; i++) {
      imageFrame.pixelData[i] = swap16(imageFrame.pixelData[i]);
    }
  } else if (imageFrame.bitsAllocated === 8) {
    imageFrame.pixelData = pixelData;
  }

  return imageFrame;
}

export default decodeBigEndian;
