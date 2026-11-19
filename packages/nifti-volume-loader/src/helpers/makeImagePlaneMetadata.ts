import type { Types } from '@cornerstonejs/core';

const PRECISION = 6;

/**
 * Builds the image plane metadata for one slice of a NIfTI volume.
 *
 * `dimensions` is [columns, rows, slices] and `spacing` is
 * [column spacing, row spacing, slice spacing], both in LPS.
 */
export default function makeImagePlaneMetadata({
  dimensions,
  direction,
  spacing,
  origin,
  imageIdIndex,
}: {
  dimensions: number[];
  direction: Types.Mat3;
  spacing: number[];
  origin: number[];
  imageIdIndex: number;
}): Types.ImagePlaneModule {
  const rowCosines: Types.Point3 = [direction[0], direction[1], direction[2]];
  const columnCosines: Types.Point3 = [
    direction[3],
    direction[4],
    direction[5],
  ];

  const imagePositionPatient: Types.Point3 = [
    parseFloat(
      (origin[0] + imageIdIndex * direction[6] * spacing[0]).toFixed(PRECISION)
    ),
    parseFloat(
      (origin[1] + imageIdIndex * direction[7] * spacing[1]).toFixed(PRECISION)
    ),
    parseFloat(
      (origin[2] + imageIdIndex * direction[8] * spacing[2]).toFixed(PRECISION)
    ),
  ];

  return {
    frameOfReferenceUID: '1.2.840.10008.1.4',
    rows: dimensions[1],
    columns: dimensions[0],
    imageOrientationPatient: [
      rowCosines[0],
      rowCosines[1],
      rowCosines[2],
      columnCosines[0],
      columnCosines[1],
      columnCosines[2],
    ],
    rowCosines,
    columnCosines,
    imagePositionPatient,
    sliceThickness: spacing[2],
    sliceLocation: origin[2] + imageIdIndex * spacing[2],
    // DICOM PixelSpacing is [row spacing, column spacing].
    pixelSpacing: [spacing[1], spacing[0]] as Types.Point2,
    rowPixelSpacing: spacing[1],
    columnPixelSpacing: spacing[0],
  };
}
