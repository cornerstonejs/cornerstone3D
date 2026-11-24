import { getEnabledElementByViewportId } from '@cornerstonejs/core';
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
  displaySetRegistry: { remove: jest.fn() },
  getEnabledElementByViewportId: jest.fn(),
  utilities: {
    logger: {
      polySegLog: { getLogger: () => ({ warn: jest.fn() }) },
    },
  },
}));

const mockSegmentations = new Map<string, unknown>();

jest.mock('@cornerstonejs/tools', () => ({
  utilities: {
    segmentation: {
      getUniqueSegmentIndices: (segmentationId: string) => {
        if (!mockSegmentations.has(segmentationId)) {
          throw new Error(
            `No segmentation found for segmentationId ${segmentationId}`
          );
        }
        return [1];
      },
    },
  },
  segmentation: {
    state: {
      getViewportIdsWithSegmentation: () => ['next3D'],
      getSegmentation: (segmentationId: string) =>
        mockSegmentations.get(segmentationId),
      getSegmentationRepresentation: jest.fn(),
    },
    triggerSegmentationEvents: { triggerSegmentationModified: jest.fn() },
  },
  Enums: { SegmentationRepresentations: { Surface: 'Surface' } },
}));

describe('updateSurfaceData after the segmentation is removed', () => {
  it('stops without an error when the segmentation went while its surfaces were computed', async () => {
    mockSegmentations.set('seg', {
      representationData: { Surface: { geometryIds: new Map() } },
    });
    (computeSurfaceFromLabelmapSegmentation as jest.Mock).mockImplementation(
      async () => {
        mockSegmentations.delete('seg');
        return [
          { segmentIndex: 1, data: { points: [1, 1, 1], polys: [1, 0] } },
        ];
      }
    );

    await expect(updateSurfaceData('seg')).resolves.toBeUndefined();
    expect(getEnabledElementByViewportId).not.toHaveBeenCalled();
  });
});
