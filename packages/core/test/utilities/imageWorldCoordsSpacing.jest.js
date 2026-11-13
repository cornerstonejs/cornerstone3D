import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as metaData from '../../src/metaData';
import imageToWorldCoords from '../../src/utilities/imageToWorldCoords';
import worldToImageCoords from '../../src/utilities/worldToImageCoords';
import { getImageDataMetadata } from '../../src/utilities/getImageDataMetadata';

// Anisotropic in-plane spacing, as in the ultrasound frame of #2758:
// PixelSpacing = [0.073, 0.2], so rowPixelSpacing (between rows, along the
// column cosines) is 0.073 and columnPixelSpacing (between columns, along the
// row cosines) is 0.2.
const rows = 546;
const columns = 843;
const rowPixelSpacing = 0.073;
const columnPixelSpacing = 0.2;

const planes = {
  'test:axis-aligned': {
    rowCosines: [1, 0, 0],
    columnCosines: [0, 1, 0],
    imagePositionPatient: [0, 0, 0],
  },
  'test:oblique': {
    rowCosines: [Math.SQRT1_2, Math.SQRT1_2, 0],
    columnCosines: [0, 0, -1],
    imagePositionPatient: [-12.5, 40, 7.25],
  },
};

function provider(type, imageId) {
  const plane = planes[imageId];
  if (!plane) {
    return;
  }
  if (type === 'imagePlaneModule') {
    return {
      ...plane,
      rows,
      columns,
      rowPixelSpacing,
      columnPixelSpacing,
    };
  }
  if (type === 'imagePixelModule') {
    return {
      bitsAllocated: 16,
      bitsStored: 16,
      samplesPerPixel: 1,
      highBit: 15,
      pixelRepresentation: 0,
      photometricInterpretation: 'MONOCHROME2',
    };
  }
  if (type === 'generalSeriesModule') {
    return { modality: 'US' };
  }
}

/** The DICOM pixel centre equation, PS3.3 C.7.6.2.1.1. */
function dicomPixelCentre(imageId, column, row) {
  const { rowCosines, columnCosines, imagePositionPatient } = planes[imageId];

  return [0, 1, 2].map(
    (axis) =>
      imagePositionPatient[axis] +
      rowCosines[axis] * columnPixelSpacing * column +
      columnCosines[axis] * rowPixelSpacing * row
  );
}

/** The world position of a pixel centre in what a StackViewport renders. */
function renderedPixelCentre(imageId, column, row) {
  const { origin, direction, dimensions, spacing } = getImageDataMetadata({
    imageId,
    rows,
    columns,
    width: columns,
    height: rows,
    rowPixelSpacing,
    columnPixelSpacing,
    sizeInBytes: rows * columns * 2,
  });
  const imageData = vtkImageData.newInstance();
  imageData.setOrigin(origin);
  imageData.setDirection(direction);
  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);

  return imageData.indexToWorld([column, row, 0]);
}

const pixels = [
  [0, 0],
  [100, 0],
  [0, 100],
  [421, 273],
  [842, 545],
];

// gl-matrix computes in float32, so compare to a thousandth of a pixel or mm.
function expectClose(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], 3);
  });
}

describe('image and world coordinates with anisotropic in-plane spacing', () => {
  beforeAll(() => {
    metaData.addProvider(provider, 100000);
  });

  afterAll(() => {
    metaData.removeProvider(provider);
  });

  Object.keys(planes).forEach((imageId) => {
    describe(imageId, () => {
      it.each(pixels)(
        'imageToWorldCoords puts the centre of pixel (%i, %i) at the DICOM and rendered position',
        (column, row) => {
          const world = imageToWorldCoords(imageId, [column + 0.5, row + 0.5]);

          expectClose(world, dicomPixelCentre(imageId, column, row));
          expectClose(world, renderedPixelCentre(imageId, column, row));
        }
      );

      it.each(pixels)(
        'worldToImageCoords maps the rendered centre of pixel (%i, %i) to that pixel',
        (column, row) => {
          const imageCoords = worldToImageCoords(
            imageId,
            renderedPixelCentre(imageId, column, row)
          );

          expectClose(imageCoords, [column + 0.5, row + 0.5]);
        }
      );

      it('maps the corners of the image to [0, 0] and [columns, rows]', () => {
        const { rowCosines, columnCosines, imagePositionPatient } =
          planes[imageId];
        // The top left corner of the top left pixel is half a pixel before its
        // centre on each axis.
        const topLeft = [0, 1, 2].map(
          (axis) =>
            imagePositionPatient[axis] -
            (rowCosines[axis] * columnPixelSpacing) / 2 -
            (columnCosines[axis] * rowPixelSpacing) / 2
        );

        expectClose(worldToImageCoords(imageId, topLeft), [0, 0]);
        expectClose(imageToWorldCoords(imageId, [0, 0]), topLeft);
        expectClose(
          worldToImageCoords(
            imageId,
            imageToWorldCoords(imageId, [columns, rows])
          ),
          [columns, rows]
        );
      });
    });
  });

  it('reproduces the numbers of the report', () => {
    expect(
      imageToWorldCoords('test:axis-aligned', [100.5, 0.5])[0]
    ).toBeCloseTo(20, 3);
    expect(worldToImageCoords('test:axis-aligned', [20, 0, 0])[0]).toBeCloseTo(
      100.5,
      3
    );
  });
});
