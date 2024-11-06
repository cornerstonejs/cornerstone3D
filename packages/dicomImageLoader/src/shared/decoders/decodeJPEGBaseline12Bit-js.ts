import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import JpegImage from '../../codecs/jpeg';

async function decodeJPEGBaseline12BitAsync(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
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

export default decodeJPEGBaseline12BitAsync;
