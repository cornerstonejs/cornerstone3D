import cache from './cache';
import { vec3 } from 'gl-matrix';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';

import {
  makeVolumeMetadata,
  uuidv4,
  sortImageIdsAndGetSpacing,
} from './helpers';

export default function makeAndCacheImageVolume(imageIds, uid) {
  if (uid === undefined) {
    uid = uuidv4();
  }

  const cachedVolume = cache.get(uid);

  if (cachedVolume) {
    return cachedVolume;
  }

  const volumeMetadata = makeVolumeMetadata(imageIds);

  const {
    BitsAllocated,
    PixelRepresentation,
    ImageOrientationPatient,
    PixelSpacing,
    Columns,
    Rows,
  } = volumeMetadata;

  const rowCosineVec = vec3.fromValues(...ImageOrientationPatient.slice(0, 3));
  const colCosineVec = vec3.fromValues(...ImageOrientationPatient.slice(3, 6));
  const scanAxisNormal = vec3.cross([], rowCosineVec, colCosineVec);

  const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  );

  const numFrames = imageIds.length;

  // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
  const spacing = [PixelSpacing[1], PixelSpacing[0], zSpacing];
  const dimensions = [Columns, Rows, numFrames];
  const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal];
  const signed = PixelRepresentation === 1;

  let scalarData;
  switch (BitsAllocated) {
    case 8:
      if (signed) {
        throw new Error(
          '8 Bit signed images are not yet supported by this plugin.'
        );
      } else {
        scalarData = new Uint8Array(
          dimensions[0] * dimensions[1] * dimensions[2]
        );
      }

      break;

    case 16:
      scalarData = new Float32Array(
        dimensions[0] * dimensions[1] * dimensions[2]
      );

      break;
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  });

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(...dimensions);
  imageData.setSpacing(...spacing);
  imageData.setDirection(...direction);
  imageData.setOrigin(...origin);
  imageData.getPointData().setScalars(scalarArray);

  const imageVolume = {
    uid,
    imageIds: sortedImageIds,
    metadata: volumeMetadata,
    dimensions,
    spacing,
    origin,
    direction,
    vtkImageData: imageData,
    scalarData,
    loaded: false,
  };

  cache.set(uid, imageVolume);

  return imageVolume;
}
