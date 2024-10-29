import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

const { windowLevel } = utilities;

// everything here is LPS
export default function makeVolumeMetadata(
  niftiHeader,
  orientation,
  pixelRepresentation
): {
  volumeMetadata: Types.Metadata;
  dimensions: Types.Point3;
  direction: Types.Mat3;
} {
  const { numBitsPerVoxel, littleEndian, pixDims, dims } = niftiHeader;
  const min = Infinity;
  const max = -Infinity;
  const frameLength = dims[1] * dims[2];
  const middleFrameIndex = Math.floor(dims[3] / 2);
  const offset = frameLength * middleFrameIndex;
  // for (
  //   let voxelIndex = offset;
  //   voxelIndex < offset + frameLength;
  //   voxelIndex++
  // ) {
  //   const voxelValue = scalarData[voxelIndex];
  //   if (voxelValue > max) {
  //     max = voxelValue;
  //   }
  //   if (voxelValue < min) {
  //     min = voxelValue;
  //   }
  // }
  // const { windowWidth, windowCenter } = windowLevel.toWindowLevel(min, max);
  const { windowWidth, windowCenter } = { windowWidth: 400, windowCenter: 40 };

  const rowCosines = vec3.create();
  const columnCosines = vec3.create();
  const scanAxisNormal = vec3.create();
  vec3.set(rowCosines, orientation[0], orientation[1], orientation[2]);
  vec3.set(columnCosines, orientation[3], orientation[4], orientation[5]);
  vec3.set(scanAxisNormal, orientation[6], orientation[7], orientation[8]);
  return {
    volumeMetadata: {
      BitsAllocated: numBitsPerVoxel,
      BitsStored: numBitsPerVoxel,
      SamplesPerPixel: 1,
      HighBit: littleEndian ? numBitsPerVoxel - 1 : 1,
      PhotometricInterpretation: 'MONOCHROME2',
      PixelRepresentation: pixelRepresentation,
      ImageOrientationPatient: [
        rowCosines[0],
        rowCosines[1],
        rowCosines[2],
        columnCosines[0],
        columnCosines[1],
        columnCosines[2],
      ],
      PixelSpacing: [pixDims[1], pixDims[2]],
      Columns: dims[1],
      Rows: dims[2],
      // This is a reshaped object and not a dicom tag:
      voiLut: [{ windowCenter, windowWidth }],
      // Todo: we should grab this from somewhere but it doesn't really
      // prevent us from rendering the volume so we'll just hardcode it for now.
      FrameOfReferenceUID: '1.2.3',
      Modality: 'MR',
      VOILUTFunction: 'LINEAR',
    },
    // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
    dimensions: [dims[1], dims[2], dims[3]],
    direction: new Float32Array([
      rowCosines[0],
      rowCosines[1],
      rowCosines[2],
      columnCosines[0],
      columnCosines[1],
      columnCosines[2],
      scanAxisNormal[0],
      scanAxisNormal[1],
      scanAxisNormal[2],
    ]) as Types.Mat3,
  };
}
