import { describe, it, expect, jest } from '@jest/globals';

// As in segRealDerivationRoundTrip: only the derived labelmap image factory is
// stubbed, so the export and the import run for real.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        const pixelData = new Uint16Array(16);
        return {
          referencedImageId,
          getPixelData: () => pixelData,
          voxelManager: {
            setAtIndex: (index, value) => (pixelData[index] = value),
            getAtIndex: (index) => pixelData[index],
            getWritableScalarData: () => pixelData,
          },
        };
      },
    },
  };
});

const {
  generateSegmentation,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');
const {
  createFromDICOMSegBuffer,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateToolState');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  sopInstanceUidForSlice,
  makeReferencedStack,
  buildLabelmap3D,
  datasetToPart10Buffer,
  firstItem,
} = require('./helpers/segRoundTrip');
const { metaData } = require('@cornerstonejs/metadata');

const SLICE_COUNT = 8;
const STACK_ID_TAG = 0x00209056;
const IN_STACK_POSITION_NUMBER_TAG = 0x00209057;

// prettier-ignore
const SHAPE_A = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];
// prettier-ignore
const TWO_LABELS = [
    0, 0, 0, 0,
    0, 0, 1, 0,
    2, 2, 0, 0,
    0, 0, 0, 0
];

const asList = (sequence) =>
  Array.isArray(sequence) ? sequence : sequence ? [sequence] : [];

function exportStack(stackOptions, exportOptions) {
  const stack = makeReferencedStack(SLICE_COUNT, stackOptions);
  const { dataset } = generateSegmentation(
    stack.images,
    buildLabelmap3D(SLICE_COUNT, { 2: SHAPE_A, 5: TWO_LABELS }),
    stack.metadataProvider,
    { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID, ...exportOptions }
  );
  return { stack, dataset };
}

/**
 * Exports a time series of SLICE_COUNT images in two time points, with the
 * position of each slice from `positionForSlice`. The 4D split reads the
 * TemporalPositionIdentifier from the global metadata provider.
 */
function exportTimeSeries(positionForSlice) {
  const temporalPosition = (type, imageId) =>
    type === 'TemporalPositionIdentifier'
      ? Math.floor(Number(imageId.split('-').pop()) / 4) + 1
      : undefined;
  metaData.addProvider(temporalPosition, 10000);
  const stackOptions = {
    positionForSlice,
    instanceAttributes: { NumberOfTemporalPositions: 2 },
  };
  const stack = makeReferencedStack(SLICE_COUNT, stackOptions);
  const planeProvider = (type, imageId) =>
    type === 'imagePlaneModule'
      ? stack.metadataProvider.get(type, imageId)
      : undefined;
  metaData.addProvider(planeProvider, 10000);
  try {
    return exportStack(stackOptions);
  } finally {
    metaData.removeProvider(temporalPosition);
    metaData.removeProvider(planeProvider);
  }
}

/** The stack rules of a LABELMAP SEG, for frames on slices 2 and 5. */
function expectStack(
  dataset,
  frameContents = [
    ['1', 1, [1, 1]],
    ['1', 2, [1, 2]],
  ]
) {
  const perFrame = asList(dataset.PerFrameFunctionalGroupsSequence);
  const groups = [
    firstItem(dataset.SharedFunctionalGroupsSequence),
    ...perFrame,
  ];

  expect(dataset.FrameOfReferenceUID).toBeUndefined();
  groups.forEach((group) => {
    expect(group.PlanePositionSequence).toBeUndefined();
    expect(group.PlaneOrientationSequence).toBeUndefined();
  });
  expect(
    asList(dataset.DimensionIndexSequence).map(
      ({ DimensionIndexPointer }) => DimensionIndexPointer
    )
  ).toEqual([STACK_ID_TAG, IN_STACK_POSITION_NUMBER_TAG]);
  expect(
    perFrame.map((group) => {
      const { StackID, InStackPositionNumber, DimensionIndexValues } =
        firstItem(group.FrameContentSequence);
      return [StackID, InStackPositionNumber, DimensionIndexValues];
    })
  ).toEqual(frameContents);
  expect(
    perFrame.map(
      (group) =>
        firstItem(firstItem(group.DerivationImageSequence).SourceImageSequence)
          .ReferencedSOPInstanceUID
    )
  ).toEqual([sopInstanceUidForSlice(2), sopInstanceUidForSlice(5)]);
}

describe('LABELMAP SEG export as a stack', () => {
  it('writes a stack for a source that is not a volume', () => {
    expectStack(exportStack({}, { isVolumetric: false }).dataset);
  });

  it('writes one stack for each time point of a 4D series', () => {
    // Two time points of four positions; slice 2 is on time point 1, slice 5
    // on time point 2. The positions repeat, so only the source references
    // identify the time point.
    const { dataset } = exportTimeSeries((slice) => [0, 0, slice % 4]);
    expectStack(dataset, [
      ['1', 1, [1, 1]],
      ['2', 1, [2, 1]],
    ]);
  });

  it('writes one stack for a time series of one position', () => {
    const { dataset } = exportTimeSeries(() => [0, 0, 0]);
    expectStack(dataset);
  });

  it('writes a stack, and no made-up geometry, for a source without a Frame of Reference', () => {
    // A multiframe without positions gets [0, 0, frameNumber] from OHIF.
    const { dataset } = exportStack({
      frameOfReference: false,
      pixelSpacingForSlice: () => undefined,
    });
    expectStack(dataset);
    const pixelMeasures = firstItem(
      firstItem(dataset.SharedFunctionalGroupsSequence).PixelMeasuresSequence
    );
    expect(pixelMeasures?.PixelSpacing).toBeUndefined();
  });

  it('reads a stack back onto the referenced slices', async () => {
    const { stack, dataset } = exportStack({}, { isVolumetric: false });
    const result = await createFromDICOMSegBuffer(
      stack.imageIds,
      datasetToPart10Buffer(dataset),
      { metadataProvider: stack.metadataProvider }
    );
    const pixelsBySource = new Map(
      result.labelMapImages
        .flat()
        .map((image) => [
          image.referencedImageId,
          Array.from(image.getPixelData()),
        ])
    );

    expect(pixelsBySource.get(stack.imageIds[2])).toEqual(SHAPE_A);
    expect(pixelsBySource.get(stack.imageIds[5])).toEqual(TWO_LABELS);
  });
});
