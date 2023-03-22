import { utilities, cache, Types } from '@cornerstonejs/core';
import getDataInTime from './getDataInTime';

function generateImageFromTime(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: string,
  options: {
    frameNumbers?;
    maskVolumeId?;
    imageCoordinate?;
  }
) {
  let dataInTime;
  let operationData;
  let indexArray;
  const frames = options.frameNumbers || [
    ...Array(dynamicVolume.numTimePoints).keys(),
  ];

  if (frames.length <= 1) {
    throw new Error('Please provide two or more time points');
  }

  if (options.maskVolumeId) {
    dataInTime = getDataInTime(dynamicVolume, {
      frameNumbers: frames,
      maskVolumeId: options.maskVolumeId,
    });
    const segmentationVolume = cache.getVolume(options.maskVolumeId);
    indexArray = segmentationVolume
      .getScalarData()
      .map((_, i) => i)
      .filter((i) => segmentationVolume.getScalarData()[i] !== 0);
  }

  if (options.imageCoordinate) {
    dataInTime = getDataInTime(dynamicVolume, {
      frameNumbers: frames,
      imageCoordinate: options.imageCoordinate,
    });
  }

  if (operation === 'SUM') {
    operationData = _sumData(dataInTime, frames);
  }

  if (operation === 'AVERAGE') {
    operationData = _avgData(dataInTime, frames);
  }

  if (operation === 'SUBTRACT') {
    operationData = _subData(dataInTime, frames);
  }

  return { data: operationData, index: indexArray };
}

function _sumData(timeData, frames) {
  const sumData = [];
  if (Array.isArray(timeData[0])) {
    for (let i = 0; i < timeData.length; i++) {
      let voxelSum = 0;
      for (let j = 0; j < frames.length; j++) {
        voxelSum = voxelSum + timeData[i][j];
      }
      sumData.push(voxelSum);
    }
  } else {
    let voxelSum = 0;
    for (let j = 0; j < frames.length; j++) {
      voxelSum = voxelSum + timeData[j];
    }
    sumData.push(voxelSum);
  }
  return sumData;
}

function _avgData(timeData, frames) {
  const avgData = [];
  if (Array.isArray(timeData[0])) {
    for (let i = 0; i < timeData.length; i++) {
      let voxelSum = 0;
      for (let j = 0; j < frames.length; j++) {
        voxelSum = voxelSum + timeData[i][j];
      }
      avgData.push(voxelSum / frames.length);
    }
  } else {
    let voxelSum = 0;
    for (let j = 0; j < frames.length; j++) {
      voxelSum = voxelSum + timeData[j];
    }
    avgData.push(voxelSum / frames.length);
  }
  return avgData;
}

function _subData(timeData, frames) {
  if (frames.length > 2) {
    throw new Error('Please provide only 2 time points for subtraction.');
  }
  const subData = [];

  if (Array.isArray(timeData[0])) {
    for (let i = 0; i < timeData.length; i++) {
      subData.push(timeData[i][0] - timeData[i][1]);
    }
  } else {
    subData.push(timeData[0] - timeData[1]);
  }
  return subData;
}

export default generateImageFromTime;
