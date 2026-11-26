import { geometryLoader } from '@cornerstonejs/core';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';
import { computeSurfaceData } from './surfaceComputationStrategies';

/** The segmentation that the conversion reads. */
let mockSegmentation;

/** The volumes of the cache, by volume id. */
const mockVolumes = {
  labelmapVolume: { metadata: { FrameOfReferenceUID: 'labelmapFrame' } },
  maskWithoutFrame: { metadata: {}, imageIds: ['maskImage1', 'maskImage2'] },
  sourceWithoutFrame: {
    metadata: {},
    imageIds: ['sourceImage1', 'sourceImage2'],
  },
};

/** The images of the cache, by image id. */
const mockImages = {
  derivedFromFramed1: { referencedImageId: 'framedSource1' },
  derivedFromFramed2: { referencedImageId: 'framedSource2' },
  derivedFromPlain1: { referencedImageId: 'plainSource1' },
  derivedFromPlain2: { referencedImageId: 'plainSource2' },
};

/** The image plane of each image, by image id. */
const mockImagePlanes = {
  labelmapImage: { frameOfReferenceUID: 'stackFrame' },
  framedSource1: { frameOfReferenceUID: 'sourceFrame' },
  framedSource2: { frameOfReferenceUID: 'sourceFrame' },
};

/** The annotations of the contours, by annotation UID. */
const mockAnnotations = {
  contour: { metadata: { FrameOfReferenceUID: 'contourFrame' } },
  contourOfOtherFrame: {
    metadata: { FrameOfReferenceUID: 'otherContourFrame' },
  },
};

/** The color of segment 1 on each viewport that shows the segmentation. */
let mockColors = {};

/** The viewports that show the segmentation. */
let mockViewportIdsWithSegmentation = [];

/** The raw surface that each conversion gives. */
const mockRawSurface = { points: [0, 0, 0], polys: [1, 0] };

jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getVolume: (volumeId) => mockVolumes[volumeId],
    getImage: (imageId) => mockImages[imageId],
  },
  metaData: {
    get: (type, imageId) =>
      type === 'imagePlaneModule' ? mockImagePlanes[imageId] : undefined,
  },
  geometryLoader: { createAndCacheGeometry: jest.fn() },
  Enums: { GeometryType: { SURFACE: 'Surface' } },
  utilities: {
    getImagesFrameOfReferenceUID: (imageIds) =>
      `madeUpFrameOf:${imageIds.join(',')}`,
    logger: {
      polySegLog: { getLogger: () => ({ warn: jest.fn(), error: jest.fn() }) },
    },
  },
}));
jest.mock('@cornerstonejs/tools', () => ({
  utilities: {
    segmentation: { getUniqueSegmentIndices: () => [1] },
  },
  segmentation: {
    state: {
      getSegmentation: () => mockSegmentation,
      getViewportIdsWithSegmentation: () => mockViewportIdsWithSegmentation,
    },
    config: {
      color: {
        getSegmentIndexColor: (viewportId) => mockColors[viewportId] ?? null,
      },
    },
  },
  CONSTANTS: {
    COLOR_LUT: [
      [0, 0, 0, 0],
      [70, 80, 90, 255],
    ],
  },
  annotation: {
    state: { getAnnotation: (annotationUID) => mockAnnotations[annotationUID] },
  },
  Enums: {
    SegmentationRepresentations: {
      Labelmap: 'Labelmap',
      Contour: 'Contour',
      Surface: 'Surface',
    },
  },
}));
jest.mock('./convertContourToSurface', () => ({
  convertContourToSurface: async () => mockRawSurface,
}));
jest.mock('./convertLabelmapToSurface', () => ({
  convertLabelmapToSurfaces: async (labelmap, segmentIndices) =>
    segmentIndices.map(() => mockRawSurface),
}));

/** The viewport of the conversion. */
const viewport = {
  id: 'viewport',
  getFrameOfReferenceUID: () => 'viewportFrame',
};

/** The frame of reference of the surface that the conversion cached. */
function frameOfReferenceOfCachedSurface() {
  const [[, { geometryData }]] = (
    geometryLoader.createAndCacheGeometry as jest.Mock
  ).mock.calls;

  return geometryData.frameOfReferenceUID;
}

/**
 * The frame of reference of the surface that the conversion cached, for a
 * conversion from `source`: the one representation of `representationData`
 * when no source is given.
 */
async function frameOfReferenceOfConvertedSurface(
  representationData,
  source = Object.keys(representationData)[0]
) {
  mockSegmentation = { segmentationId: 'seg', representationData };

  await createAndCacheSurfacesFromRaw(
    'seg',
    [{ segmentIndex: 1, data: { points: [0, 0, 0], polys: [1, 0] } }],
    { viewport },
    source
  );

  return frameOfReferenceOfCachedSurface();
}

/** A segmentation with contours and a labelmap of other frames. */
function contoursAndLabelmap() {
  return {
    Labelmap: { volumeId: 'labelmapVolume' },
    Contour: { annotationUIDsMap: new Map([[1, new Set(['contour'])]]) },
  };
}

describe('createAndCacheSurfacesFromRaw', () => {
  beforeEach(() => {
    (geometryLoader.createAndCacheGeometry as jest.Mock).mockClear();
    mockColors = { viewport: [10, 20, 30, 255] };
    mockViewportIdsWithSegmentation = ['viewport'];
  });

  it('gives the surface the color of the segment on another viewport when the viewport of the conversion stopped showing the segmentation, else the color of the default color LUT', async () => {
    const colorOfCachedSurface = async () => {
      (geometryLoader.createAndCacheGeometry as jest.Mock).mockClear();
      await frameOfReferenceOfConvertedSurface({
        Contour: { annotationUIDsMap: new Map([[1, new Set(['contour'])]]) },
      });

      return (geometryLoader.createAndCacheGeometry as jest.Mock).mock
        .calls[0][1].geometryData.color;
    };

    await expect(colorOfCachedSurface()).resolves.toEqual([10, 20, 30]);

    mockColors = { otherViewport: [40, 50, 60, 255] };
    mockViewportIdsWithSegmentation = ['otherViewport'];
    await expect(colorOfCachedSurface()).resolves.toEqual([40, 50, 60]);

    mockColors = {};
    mockViewportIdsWithSegmentation = [];
    await expect(colorOfCachedSurface()).resolves.toEqual([70, 80, 90]);
  });

  it('gives the surface of a volume labelmap the frame of reference of the labelmap volume', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface({
        Labelmap: { volumeId: 'labelmapVolume' },
      })
    ).resolves.toBe('labelmapFrame');
  });

  it('gives the surface of a stack labelmap the frame of reference of its images', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface({
        Labelmap: { imageIds: ['labelmapImage'] },
      })
    ).resolves.toBe('stackFrame');
  });

  it('gives the surface of a contour segmentation the frame of reference of its annotations', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface({
        Contour: { annotationUIDsMap: new Map([[1, new Set(['contour'])]]) },
      })
    ).resolves.toBe('contourFrame');
  });

  it('gives the surface the frame of reference of the viewport of the conversion when its source has none', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface({
        Labelmap: { volumeId: 'volumeNotInCache' },
      })
    ).resolves.toBe('viewportFrame');
  });

  it('gives the surface converted from the labelmap of a segmentation that also has contours the frame of reference of the labelmap', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface(contoursAndLabelmap(), 'Labelmap')
    ).resolves.toBe('labelmapFrame');
  });

  it('gives the surface that computeSurfaceData converts from the contours of a segmentation that also has a labelmap the frame of reference of the contours', async () => {
    mockSegmentation = {
      segmentationId: 'seg',
      representationData: contoursAndLabelmap(),
    };

    await computeSurfaceData('seg', { segmentIndices: [1], viewport });

    expect(frameOfReferenceOfCachedSurface()).toBe('contourFrame');
  });

  it('gives the surface of a labelmap that names the volume it was made from, whose images have no frame of reference, the frame of reference that core makes up for those images', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface({
        Labelmap: {
          volumeId: 'maskWithoutFrame',
          referencedVolumeId: 'sourceWithoutFrame',
        },
      })
    ).resolves.toBe('madeUpFrameOf:sourceImage1,sourceImage2');
  });

  it('gives the surface of a stack labelmap whose images name the images they were made from the frame of reference of those images', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface({
        Labelmap: { imageIds: ['derivedFromFramed1', 'derivedFromFramed2'] },
      })
    ).resolves.toBe('sourceFrame');
  });

  it('gives the surface of a stack labelmap whose images name images without a frame of reference the frame of reference that core makes up for those images', async () => {
    await expect(
      frameOfReferenceOfConvertedSurface({
        Labelmap: { imageIds: ['derivedFromPlain1', 'derivedFromPlain2'] },
      })
    ).resolves.toBe('madeUpFrameOf:plainSource1,plainSource2');
  });

  it('gives the surface of each segment converted from contours the frame of reference of the contours of that segment', async () => {
    mockSegmentation = {
      segmentationId: 'seg',
      representationData: {
        Contour: {
          annotationUIDsMap: new Map([
            [1, new Set(['contour'])],
            [2, new Set(['contourOfOtherFrame'])],
          ]),
        },
      },
    };

    await computeSurfaceData('seg', { segmentIndices: [2], viewport });

    expect(frameOfReferenceOfCachedSurface()).toBe('otherContourFrame');

    (geometryLoader.createAndCacheGeometry as jest.Mock).mockClear();
    await computeSurfaceData('seg', { segmentIndices: [1, 2], viewport });

    const framesBySegment = Object.fromEntries(
      (geometryLoader.createAndCacheGeometry as jest.Mock).mock.calls.map(
        ([, { geometryData }]) => [
          geometryData.segmentIndex,
          geometryData.frameOfReferenceUID,
        ]
      )
    );

    expect(framesBySegment).toEqual({
      1: 'contourFrame',
      2: 'otherContourFrame',
    });
  });
});
