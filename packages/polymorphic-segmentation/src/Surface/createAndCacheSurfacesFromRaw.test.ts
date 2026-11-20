import { geometryLoader } from '@cornerstonejs/core';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';

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

jest.mock('@cornerstonejs/core', () => ({
  cache: { getVolume: (volumeId) => mockVolumes[volumeId] },
  metaData: {
    get: (type, imageId) =>
      type === 'imagePlaneModule' ? mockImagePlanes[imageId] : undefined,
  },
  geometryLoader: { createAndCacheGeometry: jest.fn() },
  Enums: { GeometryType: { SURFACE: 'Surface' } },
}));
jest.mock('@cornerstonejs/tools', () => ({
  segmentation: {
    state: { getSegmentation: () => mockSegmentation },
    config: { color: { getSegmentIndexColor: () => [10, 20, 30, 255] } },
  },
  annotation: {
    state: { getAnnotation: (annotationUID) => mockAnnotations[annotationUID] },
  },
}));

/** The frame of reference of the surface that the conversion cached. */
async function frameOfReferenceOfConvertedSurface(representationData) {
  mockSegmentation = { segmentationId: 'seg', representationData };

  await createAndCacheSurfacesFromRaw(
    'seg',
    [{ segmentIndex: 1, data: { points: [0, 0, 0], polys: [1, 0] } }],
    {
      viewport: {
        id: 'viewport',
        getFrameOfReferenceUID: () => 'viewportFrame',
      },
    }
  );

  const [[, { geometryData }]] = (
    geometryLoader.createAndCacheGeometry as jest.Mock
  ).mock.calls;

  return geometryData.frameOfReferenceUID;
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
});
