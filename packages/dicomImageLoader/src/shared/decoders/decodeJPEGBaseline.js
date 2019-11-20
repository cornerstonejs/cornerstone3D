import JpegImage from '../../../codecs/jpeg.js';

function decodeJPEGBaseline(imageFrame, pixelData) {
  // check to make sure codec is loaded
  if (typeof JpegImage === 'undefined') {
    throw new Error('No JPEG Baseline decoder loaded');
  }
  const jpeg = new JpegImage();

  jpeg.parse(pixelData);

  // Do not use the internal jpeg.js color transformation,
  // since we will handle this afterwards
  jpeg.colorTransform = false;

  if (imageFrame.bitsAllocated === 8) {
    imageFrame.pixelData = jpeg.getData(imageFrame.columns, imageFrame.rows);

    return imageFrame;
  } else if (imageFrame.bitsAllocated === 16) {
    imageFrame.pixelData = jpeg.getData16(imageFrame.columns, imageFrame.rows);

    return imageFrame;
  }
}

export default decodeJPEGBaseline;
