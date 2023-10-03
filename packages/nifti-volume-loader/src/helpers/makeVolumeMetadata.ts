import { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

// everything here is LPS
export default function makeVolumeMetadata(
  niftiHeader,
  orientation,
  scalarData
): Types.Metadata {
  const { numBitsPerVoxel, littleEndian, pixDims, dims } = niftiHeader;

  const rowCosines = vec3.create();
  const columnCosines = vec3.create();

  vec3.set(rowCosines, orientation[0], orientation[1], orientation[2]);
  vec3.set(columnCosines, orientation[3], orientation[4], orientation[5]);

  let min = Infinity;
  let max = -Infinity;

  const xDim = dims[1];
  const yDim = dims[2];
  const zDim = dims[3];

  const frameLength = xDim * yDim;

  const middleFrameIndex = Math.floor(zDim / 2);

  const offset = frameLength * middleFrameIndex;

  for (
    let voxelIndex = offset;
    voxelIndex < offset + frameLength;
    voxelIndex++
  ) {
    const voxelValue = scalarData[voxelIndex];

    if (voxelValue > max) {
      max = voxelValue;
    }
    if (voxelValue < min) {
      min = voxelValue;
    }
  }

  const windowCenter = (max + min) / 2;
  const windowWidth = max - min;

  return {
    BitsAllocated: numBitsPerVoxel,
    BitsStored: numBitsPerVoxel,
    SamplesPerPixel: 1,
    HighBit: littleEndian ? numBitsPerVoxel - 1 : 1,
    PhotometricInterpretation: 'MONOCHROME2',
    PixelRepresentation: 1,
    ImageOrientationPatient: [
      rowCosines[0],
      rowCosines[1],
      rowCosines[2],
      columnCosines[0],
      columnCosines[1],
      columnCosines[2],
    ],
    PixelSpacing: [pixDims[1], pixDims[2]],
    Columns: xDim,
    Rows: yDim,
    // This is a reshaped object and not a dicom tag:
    voiLut: [{ windowCenter, windowWidth }],
    // Todo: we should grab this from somewhere but it doesn't really
    // prevent us from rendering the volume so we'll just hardcode it for now.
    FrameOfReferenceUID: '1.2.3',
    Modality: 'MR',
    VOILUTFunction: 'LINEAR',
  };
}
