import { utilities, cache, Types } from '@cornerstonejs/core';
import getDataInTime from './getDataInTime';

function generateImageFromTime(
  dynamicVolume: Types.IDynamicImageVolume,
  options: {
    frameNumbers?;
    maskVolumeId?;
    imageCoordinate?;
  }
): number[] | number[][] {
  let dataInTime;
  const frames = options.frameNumbers || [
    ...Array(dynamicVolume.numTimePoints).keys(),
  ];

  if (!options.maskVolumeId && !options.imageCoordinate) {
    throw new Error('No ROI provided');
  }

  if (options.maskVolumeId && options.imageCoordinate) {
    throw new Error('Please provide only one ROI');
  }

  if (options.maskVolumeId) {
    dataInTime = getDataInTime(dynamicVolume, {
      frameNumbers: frames,
      maskVolumeId: options.maskVolumeId,
    });
  }

  if (options.imageCoordinate) {
    dataInTime = getDataInTime(dynamicVolume, {
      frameNumbers: frames,
      imageCoordinate: options.imageCoordinate,
    });
  }

  return dataInTime;
}

export default generateImageFromTime;
