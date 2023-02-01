const local = {
  JpegImage: undefined,
  decodeConfig: {},
};

export function initialize(decodeConfig) {
  local.decodeConfig = decodeConfig;

  if (local.JpegImage) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    import('../../../codecs/jpeg.js').then(({ JpegImage }) => {
      local.JpegImage = JpegImage;
      resolve();
    }, reject);
  });
}

async function decodeJPEGBaseline12BitAsync(imageFrame, pixelData) {
  // check to make sure codec is loaded
  await initialize();
  if (typeof local.JpegImage === 'undefined') {
    throw new Error('No JPEG Baseline decoder loaded');
  }
  const jpeg = new local.JpegImage();

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

export default decodeJPEGBaseline12BitAsync;
