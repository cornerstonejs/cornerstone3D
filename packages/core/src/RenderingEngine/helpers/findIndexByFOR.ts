import * as metaData from '../../metaData';

const findIndexByFOR = ({
  imageIds,
  FrameOfReferenceUID,
  cameraFocalPoint,
}) => {
  let foundIndex = -1;
  for (let i = 0; i < imageIds.length; ++i) {
    const imageMetadata = metaData.get('instance', imageIds[i]);
    if (imageMetadata.FrameOfReferenceUID !== FrameOfReferenceUID) {
      continue;
    }

    const sliceNormal = [0, 0, 0];
    const orientation = imageMetadata.ImageOrientationPatient;
    sliceNormal[0] =
      orientation[1] * orientation[5] - orientation[2] * orientation[4];
    sliceNormal[1] =
      orientation[2] * orientation[3] - orientation[0] * orientation[5];
    sliceNormal[2] =
      orientation[0] * orientation[4] - orientation[1] * orientation[3];

    let distanceAlongNormal = 0;
    for (let j = 0; j < 3; ++j) {
      distanceAlongNormal +=
        sliceNormal[j] * imageMetadata.ImagePositionPatient[j];
    }

    /** Assuming 2 mm tolerance */
    if (Math.abs(distanceAlongNormal - cameraFocalPoint[2]) > 2) {
      continue;
    }
    foundIndex = i;
    break;
  }
  return foundIndex;
};

export default findIndexByFOR;
