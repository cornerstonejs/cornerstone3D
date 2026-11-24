jest.mock('@cornerstonejs/core', () => ({
  cache: { getVolume: jest.fn() },
  Enums: { BlendModes: { LABELMAP_EDGE_PROJECTION_BLEND: 0 } },
  convertMapperToNotSharedMapper: jest.fn(),
  volumeLoader: { loadVolume: jest.fn() },
  eventTarget: { addEventListener: jest.fn() },
}));
jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

import { cache, volumeLoader } from '@cornerstonejs/core';
import { addVolumesAsIndependentComponents } from './addVolumesAsIndependentComponents';

describe('addVolumesAsIndependentComponents', () => {
  it('keeps the base actor while the base volume loads', async () => {
    // The combined array copies the base voxels once, so a frame that loads
    // later would stay empty in it. A reduced base volume names no
    // full-resolution texture, so only the load state can tell this.
    const baseVolume = {
      volumeId: 'ct',
      loadStatus: { loading: true },
      vtkOpenGLTexture: undefined,
      voxelManager: { getCompleteScalarDataArray: jest.fn() },
    };
    const segVolume = {
      volumeId: 'seg',
      imageData: { getDimensions: () => [1, 1, 1] },
      voxelManager: { getCompleteScalarDataArray: () => new Uint8Array(1) },
    };
    (cache.getVolume as jest.Mock).mockImplementation((id) =>
      id === 'ct' ? baseVolume : segVolume
    );
    (volumeLoader.loadVolume as jest.Mock).mockResolvedValue(segVolume);
    const viewport = {
      getDefaultActor: () => ({ uid: 'ct', actor: {} }),
      getVolumeId: () => 'ct',
      removeActors: jest.fn(),
      addActor: jest.fn(),
    };

    await addVolumesAsIndependentComponents({
      viewport: viewport as never,
      volumeInputs: [{ volumeId: 'seg' }],
      segmentationId: 'seg-1',
    });

    expect(viewport.removeActors).not.toHaveBeenCalled();
    expect(viewport.addActor).not.toHaveBeenCalled();
    expect(
      baseVolume.voxelManager.getCompleteScalarDataArray
    ).not.toHaveBeenCalled();
  });
});
