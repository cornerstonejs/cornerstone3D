import { describe, it, expect, jest } from '@jest/globals';

// A SEG of images that have no Frame of Reference (2D ultrasound, endoscopy,
// photographs) carries no plane geometry. PS3.3 A.51.5 (Segmentation
// Functional Groups): Pixel Measures, Plane Position (Patient) and Plane
// Orientation (Patient) may only be present when the Frame of Reference is
// defined in the patient-relative coordinate system. Without one, "each pixel
// of the segmentation shall correspond to a pixel in a referenced image, using
// the Derivation Image Functional Group". Such a SEG is in-plane with its
// source by definition, so it must import through the Derivation Image
// references instead of failing on the missing ImageOrientationPatient.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        const pixelData = new Uint8Array(6);
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

const { imageLoader } = require('@cornerstonejs/core');
const {
  createFromDicomSegImageId,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateToolState');
const checkOrientation =
  require('../src/adapters/helpers/checkOrientation').default;
const {
  BINARY_SEG_SOP_CLASS_UID,
  SERIES_INSTANCE_UID,
  sopInstanceUidForSlice,
  makeReferencedStack,
} = require('./helpers/segRoundTrip');

const US_IMAGE_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.6.1';
const US_MULTIFRAME_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.3.1';
const CINE_SOP_INSTANCE_UID = '1.2.826.0.1.3680043.8.498.200.1';

// Non-square, so a row/column mix-up would not go unnoticed.
const ROWS = 2;
const COLUMNS = 3;
const EMPTY = new Array(ROWS * COLUMNS).fill(0);

// prettier-ignore
const NODULE_1 = [
  1, 1, 0,
  0, 0, 0,
];
// prettier-ignore
const NODULE_2 = [
  0, 0, 0,
  0, 1, 1,
];

/**
 * A stack of single-frame ultrasound images: no Frame of Reference and no
 * ImageOrientationPatient, so the image plane module falls back to its
 * default cosines.
 */
function makeUltrasoundStack(sliceCount) {
  const stack = makeReferencedStack(sliceCount, {
    rows: ROWS,
    columns: COLUMNS,
    orientationForSlice: () => undefined,
  });

  const metadataProvider = {
    get(type, imageId) {
      const value = stack.metadataProvider.get(type, imageId);
      if (type === 'instance' && value) {
        // Ultrasound images have neither attribute.
        const {
          FrameOfReferenceUID: _frameOfReferenceUid,
          ImagePositionPatient: _imagePositionPatient,
          ...rest
        } = value;
        return { ...rest, SOPClassUID: US_IMAGE_SOP_CLASS_UID, Modality: 'US' };
      }
      if (type === 'imagePlaneModule' && value) {
        return { ...value, frameOfReferenceUID: undefined };
      }
      return value;
    },
  };

  return { imageIds: stack.imageIds, metadataProvider };
}

/**
 * One ultrasound cine instance; each frame is its own imageId, as OHIF and
 * the WADO-RS image loader address them.
 */
function makeUltrasoundCine(frameCount) {
  const base = `wadors:https://pacs.example/studies/1/series/2/instances/${CINE_SOP_INSTANCE_UID}`;
  const imageIds = Array.from(
    { length: frameCount },
    (_, frame) => `${base}/frames/${frame + 1}`
  );

  const metadataProvider = {
    get(type, imageId) {
      if (!imageIds.includes(imageId)) {
        return undefined;
      }
      switch (type) {
        case 'instance':
          return {
            SOPClassUID: US_MULTIFRAME_SOP_CLASS_UID,
            SOPInstanceUID: CINE_SOP_INSTANCE_UID,
            SeriesInstanceUID: SERIES_INSTANCE_UID,
            Modality: 'US',
            Rows: ROWS,
            Columns: COLUMNS,
            NumberOfFrames: frameCount,
          };
        case 'imagePlaneModule':
          return {
            rowCosines: [1, 0, 0],
            columnCosines: [0, 1, 0],
            imagePositionPatient: [0, 0, 0],
            rowPixelSpacing: 1,
            columnPixelSpacing: 1,
            rows: ROWS,
            columns: COLUMNS,
          };
        case 'generalSeriesModule':
          return { seriesInstanceUID: SERIES_INSTANCE_UID, modality: 'US' };
        case 'generalImageModule':
          return { sopInstanceUID: CINE_SOP_INSTANCE_UID };
        default:
          return undefined;
      }
    },
  };

  return { imageIds, metadataProvider };
}

/**
 * A BINARY SEG with no Frame of Reference and no plane geometry: an empty
 * shared functional group and per-frame Derivation Image references only.
 * `frames` lists { segmentNumber, sopInstanceUid, frameNumber?, pixels }.
 */
function buildSegWithoutFrameOfReference(frames) {
  const multiframe = {
    SOPClassUID: BINARY_SEG_SOP_CLASS_UID,
    SOPInstanceUID: '1.2.826.0.1.3680043.8.498.999',
    Modality: 'SEG',
    SegmentationType: 'BINARY',
    Rows: ROWS,
    Columns: COLUMNS,
    NumberOfFrames: frames.length,
    BitsAllocated: 1,
    BitsStored: 1,
    HighBit: 0,
    ReferencedSeriesSequence: { SeriesInstanceUID: SERIES_INSTANCE_UID },
    SharedFunctionalGroupsSequence: {},
    PerFrameFunctionalGroupsSequence: frames.map((frame) => ({
      DerivationImageSequence: {
        SourceImageSequence: {
          ReferencedSOPInstanceUID: frame.sopInstanceUid,
          ...(frame.frameNumber
            ? { ReferencedFrameNumber: frame.frameNumber }
            : {}),
        },
      },
      FrameContentSequence: { DimensionIndexValues: [frame.segmentNumber] },
      SegmentIdentificationSequence: {
        ReferencedSegmentNumber: frame.segmentNumber,
      },
    })),
    SegmentSequence: [1, 2].map((segmentNumber) => ({
      SegmentNumber: segmentNumber,
      SegmentLabel: `Nodule ${segmentNumber}`,
      SegmentAlgorithmType: 'SEMIAUTOMATIC',
    })),
  };

  return {
    multiframe,
    framePixels: frames.map((frame) => Uint8Array.from(frame.pixels)),
  };
}

let schemeCount = 0;

async function importSeg(source, frames) {
  const { multiframe, framePixels } = buildSegWithoutFrameOfReference(frames);

  // A fresh scheme per import keeps frame imageIds out of each other's cache.
  const scheme = `segnoforref${++schemeCount}`;
  const segImageId = `${scheme}:seg-instance`;
  const frameImageIds = framePixels.map(
    (_, frameIndex) => `${scheme}:frame-${frameIndex + 1}`
  );
  imageLoader.registerImageLoader(scheme, (imageId) => ({
    promise: Promise.resolve({
      imageId,
      getPixelData: () => framePixels[frameImageIds.indexOf(imageId)],
    }),
    cancelFn: undefined,
  }));

  const metadataProvider = {
    get: (type, imageId) =>
      type === 'instance' && imageId === segImageId
        ? multiframe
        : source.metadataProvider.get(type, imageId),
  };

  const result = await createFromDicomSegImageId(source.imageIds, segImageId, {
    metadataProvider,
    frameImageIds,
  });

  // Overlapping segments come back as one labelmap layer per group.
  return result.labelMapImages.map((layer) => {
    const bySource = new Map(
      layer.map((image) => [image.referencedImageId, image])
    );
    return (imageIndex) => {
      const image = bySource.get(source.imageIds[imageIndex]);
      return image ? Array.from(image.getPixelData()) : EMPTY;
    };
  });
}

describe('checkOrientation for a SEG without plane orientation', () => {
  it('treats a SEG with no ImageOrientationPatient as in-plane with its source', () => {
    const multiframe = {
      Rows: ROWS,
      Columns: COLUMNS,
      SharedFunctionalGroupsSequence: {},
      PerFrameFunctionalGroupsSequence: [{}],
    };

    expect(
      checkOrientation(
        multiframe,
        [[1, 0, 0, 0, 1, 0]],
        [ROWS, COLUMNS, 1],
        1e-3
      )
    ).toBe('Planar');
  });
});

describe('importing a BINARY SEG without a Frame of Reference', () => {
  it('places each segment on the single-frame source image it references', async () => {
    const source = makeUltrasoundStack(3);

    const [pixelsForImage] = await importSeg(source, [
      {
        segmentNumber: 1,
        sopInstanceUid: sopInstanceUidForSlice(2),
        pixels: NODULE_1,
      },
      {
        segmentNumber: 2,
        sopInstanceUid: sopInstanceUidForSlice(1),
        pixels: NODULE_2,
      },
    ]);

    expect(pixelsForImage(2)).toEqual(NODULE_1);
    expect(pixelsForImage(1)).toEqual(NODULE_2.map((v) => v * 2));
    expect(pixelsForImage(0)).toEqual(EMPTY);
  });

  it('places overlapping segments on separate labelmap layers', async () => {
    const source = makeUltrasoundStack(2);
    // prettier-ignore
    const overlappingNodule2 = [
      0, 1, 1,
      0, 0, 0,
    ];

    const layers = await importSeg(source, [
      {
        segmentNumber: 1,
        sopInstanceUid: sopInstanceUidForSlice(1),
        pixels: NODULE_1,
      },
      {
        segmentNumber: 2,
        sopInstanceUid: sopInstanceUidForSlice(1),
        pixels: overlappingNodule2,
      },
    ]);

    const labels = layers.map((pixelsForImage) => pixelsForImage(1));
    expect(labels).toContainEqual(NODULE_1);
    expect(labels).toContainEqual(overlappingNodule2.map((v) => v * 2));
    expect(
      layers.every((pixelsForImage) => pixelsForImage(0).every((v) => v === 0))
    ).toBe(true);
  });

  it('places cine segments on the referenced frames of a multi-frame source', async () => {
    const source = makeUltrasoundCine(5);

    const [pixelsForFrame] = await importSeg(source, [
      {
        segmentNumber: 1,
        sopInstanceUid: CINE_SOP_INSTANCE_UID,
        frameNumber: 2,
        pixels: NODULE_1,
      },
      {
        segmentNumber: 1,
        sopInstanceUid: CINE_SOP_INSTANCE_UID,
        frameNumber: 4,
        pixels: NODULE_1,
      },
      {
        segmentNumber: 2,
        sopInstanceUid: CINE_SOP_INSTANCE_UID,
        frameNumber: 3,
        pixels: NODULE_2,
      },
    ]);

    // Frame numbers are 1-based; imageIds index from 0.
    expect(pixelsForFrame(1)).toEqual(NODULE_1);
    expect(pixelsForFrame(3)).toEqual(NODULE_1);
    expect(pixelsForFrame(2)).toEqual(NODULE_2.map((v) => v * 2));
    expect(pixelsForFrame(0)).toEqual(EMPTY);
    expect(pixelsForFrame(4)).toEqual(EMPTY);
  });
});
