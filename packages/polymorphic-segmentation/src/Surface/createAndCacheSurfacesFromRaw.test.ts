import { geometryLoader } from '@cornerstonejs/core';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';
import { computeSurfaceData } from './surfaceComputationStrategies';

/** The segmentation that the conversion reads. */
let mockSegmentation;

/** The volumes of the cache, by volume id. */
const mockVolumes = {
  labelmapVolume: { metadata: { FrameOfReferenceUID: 'labelmapFrame' } },
};

/** The image plane of each image, by image id. */
const mockImagePlanes = {
  labelmapImage: { frameOfReferenceUID: 'stackFrame' },
};

/** The annotations of the contours, by annotation UID. */
const mockAnnotations = {
  contour: { metadata: { FrameOfReferenceUID: 'contourFrame' } },
};

/** The raw surface that each conversion gives. */
const mockRawSurface = { points: [0, 0, 0], polys: [1, 0] };

jest.mock('@cornerstonejs/core', () => ({
  cache: { getVolume: (volumeId) => mockVolumes[volumeId] },
  metaData: {
    get: (type, imageId) =>
      type === 'imagePlaneModule' ? mockImagePlanes[imageId] : undefined,
  },
  geometryLoader: { createAndCacheGeometry: jest.fn() },
  Enums: { GeometryType: { SURFACE: 'Surface' } },
  utilities: {
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
    state: { getSegmentation: () => mockSegmentation },
    config: { color: { getSegmentIndexColor: () => [10, 20, 30, 255] } },
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
});
