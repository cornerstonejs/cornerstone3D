import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { computeSurfaceFromLabelmapSegmentation } from './surfaceComputationStrategies';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';
import { updateSurfaceData } from './updateSurfaceData';

/** The geometry map of the Surface representation of the segmentation. */
const mockGeometryIds = new Map<number, string>();

jest.mock('./surfaceComputationStrategies', () => ({
  computeSurfaceFromLabelmapSegmentation: jest.fn(),
}));
jest.mock('./createAndCacheSurfacesFromRaw', () => ({
  createAndCacheSurfacesFromRaw: jest.fn(),
}));
jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getGeometry: jest.fn(),
    removeGeometryLoadObject: jest.fn(),
  },
  getEnabledElementByViewportId: jest.fn(),
  utilities: {
    genericViewportDisplaySetMetadataProvider: { remove: jest.fn() },
    logger: {
      polySegLog: { getLogger: () => ({ warn: jest.fn() }) },
    },
  },
}));
jest.mock('@cornerstonejs/tools', () => ({
  utilities: {
    segmentation: { getUniqueSegmentIndices: () => [2] },
  },
  segmentation: {
    state: {
      getViewportIdsWithSegmentation: () => ['planar'],
      getSegmentation: () => ({
        segmentationId: 'seg',
        representationData: { Surface: { geometryIds: mockGeometryIds } },
      }),
      getSegmentationRepresentation: () => ({
        segmentationId: 'seg',
        type: 'Surface',
      }),
    },
    triggerSegmentationEvents: { triggerSegmentationModified: jest.fn() },
  },
  Enums: {
    SegmentationRepresentations: { Surface: 'Surface', Labelmap: 'Labelmap' },
  },
}));

describe('updateSurfaceData with a new segment', () => {
  beforeEach(() => {
    mockGeometryIds.clear();
    (computeSurfaceFromLabelmapSegmentation as jest.Mock).mockResolvedValue([
      { segmentIndex: 2, data: { points: [1, 1, 1], polys: [] } },
    ]);
    (getEnabledElementByViewportId as jest.Mock).mockReturnValue({
      viewport: { id: 'planar', type: 'planar' },
    });
  });

  it('puts no geometry id of the segment in the map when its surface fails to be cached', async () => {
    (createAndCacheSurfacesFromRaw as jest.Mock).mockRejectedValue(
      new Error('Surface must have non-empty polys array')
    );

    await expect(updateSurfaceData('seg')).rejects.toThrow(
      'Surface must have non-empty polys array'
    );
    expect(mockGeometryIds.has(2)).toBe(false);
  });

  it('puts the geometry id of the segment in the map once its surface is cached', async () => {
    let cached = false;

    (createAndCacheSurfacesFromRaw as jest.Mock).mockImplementation(
      async () => {
        expect(mockGeometryIds.has(2)).toBe(false);
        cached = true;
      }
    );

    await updateSurfaceData('seg');

    expect(cached).toBe(true);
    expect(mockGeometryIds.get(2)).toBe('segmentation_seg_surface_2');
  });

  it('caches the surface of the new segment as a surface converted from the labelmap', async () => {
    (createAndCacheSurfacesFromRaw as jest.Mock).mockReset();
    (createAndCacheSurfacesFromRaw as jest.Mock).mockResolvedValue(undefined);

    await updateSurfaceData('seg');

    expect(createAndCacheSurfacesFromRaw).toHaveBeenCalledWith(
      'seg',
      [{ segmentIndex: 2, data: { points: [1, 1, 1], polys: [] } }],
      expect.anything(),
      'Labelmap'
    );
  });
});
