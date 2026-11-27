jest.mock('@cornerstonejs/core', () => ({
  cache: { getVolume: jest.fn() },
  Enums: { BlendModes: { LABELMAP_EDGE_PROJECTION_BLEND: 0 } },
  convertMapperToNotSharedMapper: jest.fn(),
  volumeLoader: { loadVolume: jest.fn() },
  eventTarget: {
    addEventListener: jest.fn(),
    addEventListenerDebounced: jest.fn(),
    removeEventListener: jest.fn(),
    removeEventListenerDebounced: jest.fn(),
  },
}));
jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

import {
  cache,
  convertMapperToNotSharedMapper,
  eventTarget,
  volumeLoader,
} from '@cornerstonejs/core';
import { Events } from '../../../enums';
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

  it('deletes the converted mapper when the representation goes, so its GPU memory entry goes too', async () => {
    const baseVolume = {
      volumeId: 'ct-loaded',
      loadStatus: { loading: false },
      voxelManager: {
        getCompleteScalarDataArray: () => new Float32Array(1),
        getScalarDataLength: () => 1,
      },
    };
    const segVolume = {
      volumeId: 'seg',
      imageData: { getDimensions: () => [1, 1, 1] },
      voxelManager: { getCompleteScalarDataArray: () => new Uint8Array(1) },
    };
    (cache.getVolume as jest.Mock).mockImplementation((id) =>
      id === 'ct-loaded' ? baseVolume : segVolume
    );
    (volumeLoader.loadVolume as jest.Mock).mockResolvedValue(segVolume);

    const sharedImageData = {
      getPointData: () => ({
        getScalars: () => null,
        removeArray: jest.fn(),
      }),
      modified: jest.fn(),
    };
    const oldMapper = { getInputData: () => sharedImageData };
    const converted = {
      setBlendMode: jest.fn(),
      getInputData: () => ({
        getPointData: () => ({
          getArray: () => ({
            setData: jest.fn(),
            setNumberOfComponents: jest.fn(),
          }),
        }),
      }),
      delete: jest.fn(),
    };
    (convertMapperToNotSharedMapper as jest.Mock).mockReturnValue(converted);

    const property = new Proxy(
      {},
      { get: (target, name) => (target[name] ??= jest.fn()) }
    );
    const actor = {
      getMapper: () => oldMapper,
      setMapper: jest.fn(),
      getProperty: () => property,
      get: jest.fn(),
      set: jest.fn(),
    };
    const viewport = {
      id: 'vp-edge',
      isDisabled: false,
      getDefaultActor: () => ({ uid: 'ct-loaded', actor }),
      getVolumeId: () => 'ct-loaded',
      getBlendMode: () => 0,
      getActor: () => ({ uid: 'ct-loaded' }),
      removeActors: jest.fn(),
      addActor: jest.fn(),
      render: jest.fn(),
    };

    await addVolumesAsIndependentComponents({
      viewport: viewport as never,
      volumeInputs: [{ volumeId: 'seg' }],
      segmentationId: 'seg-2',
    });

    expect(actor.setMapper).toHaveBeenLastCalledWith(converted);

    const onRemoved = (
      eventTarget.addEventListener as jest.Mock
    ).mock.calls.find(
      ([type]) => type === Events.SEGMENTATION_REPRESENTATION_REMOVED
    )[1];

    onRemoved({ detail: { viewportId: 'vp-edge' } });

    expect(actor.setMapper).toHaveBeenLastCalledWith(oldMapper);
    expect(converted.delete).toHaveBeenCalledTimes(1);
  });
});
