import {
  cache,
  getEnabledElementByViewportId,
  utilities,
} from '@cornerstonejs/core';
import { computeSurfaceFromLabelmapSegmentation } from './surfaceComputationStrategies';
import { updateSurfaceData } from './updateSurfaceData';

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
    segmentation: { getUniqueSegmentIndices: () => [1] },
  },
  segmentation: {
    state: {
      getViewportIdsWithSegmentation: () => ['next3D', 'other3D'],
      getSegmentation: () => ({
        representationData: { Surface: { geometryIds: new Map() } },
      }),
      getSegmentationRepresentation: jest.fn(),
    },
    triggerSegmentationEvents: { triggerSegmentationModified: jest.fn() },
  },
  Enums: { SegmentationRepresentations: { Surface: 'Surface' } },
}));

/** The actor entries of the surfaces of segment 1 and of segment 2. */
function createSurfaceActorEntries(viewportId: string) {
  return [1, 2].map((segmentIndex) => ({
    uid: `${viewportId}-actor-${segmentIndex}`,
    referencedId: `segmentation_seg_surface_${segmentIndex}`,
    representationUID: `seg-Surface-${segmentIndex}`,
  }));
}

describe('updateSurfaceData with a deleted segment', () => {
  it('takes the surface of the deleted segment off two next 3D viewports, and its geometry out of the cache once', async () => {
    const other = {
      type: 'volume3d',
      getActors: () => createSurfaceActorEntries('other3D'),
      removeData: jest.fn(),
      render: jest.fn(),
    };
    const next = {
      type: 'volume3d',
      getActors: () => createSurfaceActorEntries('next3D'),
      removeData: jest.fn(),
      render: jest.fn(),
    };
    const surface = { points: [0, 0, 0], polys: [1, 0] };
    const cached = new Map(
      [1, 2].map((segmentIndex) => [
        `segmentation_seg_surface_${segmentIndex}`,
        { data: segmentIndex === 1 ? surface : { points: [], polys: [] } },
      ])
    );

    (computeSurfaceFromLabelmapSegmentation as jest.Mock).mockResolvedValue([
      { segmentIndex: 1, data: { points: [1, 1, 1], polys: [1, 0] } },
    ]);
    (getEnabledElementByViewportId as jest.Mock).mockImplementation(
      (viewportId: string) => ({
        viewport: viewportId === 'other3D' ? other : next,
      })
    );
    (cache.getGeometry as jest.Mock).mockImplementation((geometryId: string) =>
      cached.get(geometryId)
    );
    (cache.removeGeometryLoadObject as jest.Mock).mockImplementation(
      (geometryId: string) => {
        if (!cached.delete(geometryId)) {
          throw new Error('geometryId was not present in geometryCache');
        }
      }
    );

    await updateSurfaceData('seg');

    expect(other.removeData).toHaveBeenCalledTimes(1);
    expect(other.removeData).toHaveBeenCalledWith('segmentation_seg_surface_2');
    expect(next.removeData).toHaveBeenCalledTimes(1);
    expect(next.removeData).toHaveBeenCalledWith('segmentation_seg_surface_2');
    expect(
      utilities.genericViewportDisplaySetMetadataProvider.remove
    ).toHaveBeenCalledWith('segmentation_seg_surface_2');
    expect(next.render).toHaveBeenCalled();
    expect(cache.removeGeometryLoadObject).toHaveBeenCalledTimes(1);
    expect(cache.removeGeometryLoadObject).toHaveBeenCalledWith(
      'segmentation_seg_surface_2'
    );
    expect(surface.points).toEqual([1, 1, 1]);
  });
});
