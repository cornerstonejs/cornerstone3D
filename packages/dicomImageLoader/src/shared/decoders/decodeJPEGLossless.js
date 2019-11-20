import jpeg from '../../../codecs/jpegLossless.js';

function decodeJPEGLossless(imageFrame, pixelData) {
  // check to make sure codec is loaded
  if (
    typeof jpeg === 'undefined' ||
    typeof jpeg.lossless === 'undefined' ||
    typeof jpeg.lossless.Decoder === 'undefined'
  ) {
    throw new Error('No JPEG Lossless decoder loaded');
  }

  const byteOutput = imageFrame.bitsAllocated <= 8 ? 1 : 2;
  // console.time('jpeglossless');
  const buffer = pixelData.buffer;
  const decoder = new jpeg.lossless.Decoder();
  const decompressedData = decoder.decode(
    buffer,
    pixelData.byteOffset,
    pixelData.length,
    byteOutput
  );
  // console.timeEnd('jpeglossless');

  if (imageFrame.pixelRepresentation === 0) {
    if (imageFrame.bitsAllocated === 16) {
      imageFrame.pixelData = new Uint16Array(decompressedData.buffer);

      return imageFrame;
    }
    // untested!
    imageFrame.pixelData = new Uint8Array(decompressedData.buffer);

    return imageFrame;
  }
  imageFrame.pixelData = new Int16Array(decompressedData.buffer);

  return imageFrame;
}

export default decodeJPEGLossless;
