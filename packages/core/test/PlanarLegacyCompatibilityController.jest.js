jest.mock('../src/cache/cache', () => ({
  __esModule: true,
  default: {
    getVolume: jest.fn(),
  },
}));

jest.mock('../src/utilities/genericViewportDisplaySetMetadataProvider', () => ({
  __esModule: true,
  default: {
    add: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../src/utilities/colormap', () => ({
  findMatchingColormap: jest.fn(() => ({})),
  getMaxOpacity: jest.fn(() => 1),
  getThresholdValue: jest.fn(() => null),
}));

jest.mock('../src/utilities/transferFunctionUtils', () => ({
  getTransferFunctionNodes: jest.fn(() => []),
}));

import cache from '../src/cache/cache';
import metadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';
import Events from '../src/enums/Events';
import BlendModes from '../src/enums/BlendModes';
import { ActorRenderMode } from '../src/types/IActor';
import { SlabTypes } from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper/Constants';
import PlanarLegacyCompatibilityController from '../src/RenderingEngine/GenericViewport/Planar/PlanarLegacyCompatibilityController';

function createHost(overrides = {}) {
  const element = document.createElement('div');
  const host = {
    getElement: () => element,
    getViewportId: () => 'vp-1',
    getRequestedOrientation: () => undefined,
    prepareVolumeCompatibilityCamera: jest.fn(),
    setDisplaySets: jest.fn(async () => undefined),
    setImageIdIndex: jest.fn(async (idx) => `image-${idx}`),
    getCurrentImageId: jest.fn(() => 'image-0'),
    render: jest.fn(),
    removeBindingsExcept: jest.fn(),
    setCameraOrientation: jest.fn(),
    setDataPresentationState: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    getDisplaySetPresentation: jest.fn(() => undefined),
    getCameraOrientation: jest.fn(() => undefined),
    getCurrentPlanarRendering: jest.fn(() => undefined),
    getActiveDataId: jest.fn(() => undefined),
    getFirstBoundDataId: jest.fn(() => '__planar_v2__:vp-1:stack'),
    findDataIdByVolumeId: jest.fn(() => undefined),
    getBindingActor: jest.fn(() => undefined),
    getBindingRenderMode: jest.fn(() => undefined),
    getDefaultVOIRange: jest.fn(() => undefined),
    getImageCount: jest.fn(() => 0),
    getMaxImageIdIndex: jest.fn(() => -1),
    ...overrides,
  };
  return { host, element };
}

describe('PlanarLegacyCompatibilityController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setStack', () => {
    it('throws on an empty stack', async () => {
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);
      await expect(controller.setStack([])).rejects.toThrow(
        /Cannot set an empty stack/
      );
    });

    it('clamps currentImageIdIndex into range and resolves to the host current image id', async () => {
      const { host } = createHost({
        getCurrentImageId: jest.fn(() => 'image-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      const result = await controller.setStack(
        ['image-0', 'image-1', 'image-2'],
        99
      );

      expect(host.removeBindingsExcept).toHaveBeenCalledWith(new Set());
      // dataId is registered with the metadata provider
      expect(metadataProvider.add).toHaveBeenCalledWith(
        '__planar_v2__:vp-1:stack',
        expect.objectContaining({
          imageIds: ['image-0', 'image-1', 'image-2'],
          initialImageIdIndex: 2, // clamped to last
        })
      );
      expect(host.setDisplaySets).toHaveBeenCalled();
      expect(host.setImageIdIndex).toHaveBeenCalledWith(2);
      expect(result).toBe('image-1');
    });

    it('returns the requested image id without setImageIdIndex when a newer setStack supersedes it', async () => {
      const { host } = createHost();
      let resolveFirstSetDisplaySets;
      host.setDisplaySets.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSetDisplaySets = resolve;
          })
      );

      const controller = new PlanarLegacyCompatibilityController(host);
      const firstCall = controller.setStack(['a', 'b'], 1);

      // Kick off a second request before the first resolves.
      const secondCall = controller.setStack(['c'], 0);
      resolveFirstSetDisplaySets();

      const [firstResult] = await Promise.all([firstCall, secondCall]);
      expect(firstResult).toBe('b');
    });

    it('rolls back the registration when setDisplaySets throws', async () => {
      const { host } = createHost();
      host.setDisplaySets.mockRejectedValueOnce(new Error('boom'));
      const controller = new PlanarLegacyCompatibilityController(host);

      await expect(controller.setStack(['x'])).rejects.toThrow('boom');
      expect(metadataProvider.remove).toHaveBeenCalledWith(
        '__planar_v2__:vp-1:stack'
      );
    });
  });

  describe('setVolumes', () => {
    it('throws when a volume is not in the cache', async () => {
      cache.getVolume.mockReturnValue(undefined);
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);

      await expect(
        controller.setVolumes([{ volumeId: 'vol-1' }])
      ).rejects.toThrow(/imageVolume with id: vol-1/);
    });

    it('mounts the first volume as the source binding when replacing', async () => {
      cache.getVolume.mockReturnValue({ imageIds: ['v-0', 'v-1', 'v-2'] });
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);

      await controller.setVolumes([{ volumeId: 'vol-1' }]);

      expect(host.prepareVolumeCompatibilityCamera).toHaveBeenCalled();
      expect(host.setDisplaySets).toHaveBeenCalledTimes(1);
      const callArgs = host.setDisplaySets.mock.calls[0];
      expect(callArgs[0].options.role).toBe('source');
    });

    it('mounts additional volumes as overlay bindings on addVolumes', async () => {
      cache.getVolume.mockReturnValue({ imageIds: ['v-0', 'v-1'] });
      const { host } = createHost({
        getActiveDataId: jest.fn(() => '__existing__'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      await controller.addVolumes([{ volumeId: 'vol-extra' }]);
      const callArgs = host.setDisplaySets.mock.calls[0];
      expect(callArgs[0].options.role).toBe('overlay');
    });

    it('renders when immediate=true', async () => {
      cache.getVolume.mockReturnValue({ imageIds: ['v-0'] });
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);

      await controller.setVolumes([{ volumeId: 'vol-1' }], true);
      expect(host.render).toHaveBeenCalled();
    });

    it('keeps the registration of a volume that the viewport already holds', async () => {
      // The viewport removes every binding that it holds before the viewport
      // mounts the new bindings, so setDisplaySets calls removeData for the
      // volume that this call mounts again. The registration has to survive
      // that removal, because the mount reads the registration back.
      cache.getVolume.mockReturnValue({ imageIds: ['v-0', 'v-1'] });
      const dataId = '__planar_v2__:vp-1:volume:vol-1';
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);

      await controller.setVolumes([{ volumeId: 'vol-1' }]);

      host.setDisplaySets.mockImplementationOnce(async () => {
        controller.removeData(dataId);
      });
      metadataProvider.remove.mockClear();

      await controller.setVolumes([{ volumeId: 'vol-1' }]);

      expect(metadataProvider.remove).not.toHaveBeenCalledWith(dataId);
      expect(metadataProvider.add).toHaveBeenLastCalledWith(
        dataId,
        expect.objectContaining({ volumeId: 'vol-1' })
      );
    });

    it('removes the data of a volume when the mount of that volume fails', async () => {
      cache.getVolume.mockReturnValue({ imageIds: ['v-0'] });
      const dataId = '__planar_v2__:vp-1:volume:vol-1';
      const { host } = createHost();
      host.setDisplaySets.mockImplementationOnce(async () => {
        throw new Error('mount failed');
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      await expect(
        controller.setVolumes([{ volumeId: 'vol-1' }])
      ).rejects.toThrow(/mount failed/);

      expect(metadataProvider.remove).toHaveBeenCalledWith(dataId);
    });
  });

  describe('property management', () => {
    it('stores and merges properties onto the host data presentation state', () => {
      const { host } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      controller.setProperties({ voiRange: { lower: 0, upper: 100 } });
      expect(host.setDataPresentationState).toHaveBeenCalledWith(
        'data-1',
        expect.any(Object)
      );
    });

    it('applies camera orientation when set via properties', () => {
      const { host } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);
      const orientation = { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] };

      controller.setProperties({ orientation });
      expect(host.setCameraOrientation).toHaveBeenCalledWith(
        expect.objectContaining({
          viewPlaneNormal: [0, 0, 1],
          viewUp: [0, 1, 0],
        })
      );
    });

    it('does nothing when no target data id can be resolved', () => {
      const { host } = createHost({
        getActiveDataId: jest.fn(() => undefined),
        getFirstBoundDataId: jest.fn(() => undefined),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      controller.setProperties({ voiRange: { lower: 0, upper: 1 } });
      expect(host.setDataPresentationState).not.toHaveBeenCalled();
    });

    it('emits COLORMAP_MODIFIED when colormap is set and not suppressed', () => {
      const { host, element } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);
      const listener = jest.fn();
      element.addEventListener(Events.COLORMAP_MODIFIED, listener);

      controller.setProperties({ colormap: { name: 'hot' } });
      expect(listener).toHaveBeenCalled();
    });

    it('does not emit COLORMAP_MODIFIED when suppressEvents is true', () => {
      const { host, element } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);
      const listener = jest.fn();
      element.addEventListener(Events.COLORMAP_MODIFIED, listener);

      // suppressEvents is the third positional arg; the second is volumeId.
      controller.setProperties({ colormap: { name: 'hot' } }, undefined, true);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('default properties', () => {
    it('stores global defaults when no imageId is provided', () => {
      const { host } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      controller.setDefaultProperties({ voiRange: { lower: 0, upper: 100 } });
      // No side effect on host until resetToDefaultProperties is invoked.
      controller.resetToDefaultProperties();
      expect(host.setDataPresentationState).toHaveBeenCalledWith(
        'data-1',
        expect.objectContaining({ voiRange: { lower: 0, upper: 100 } })
      );
    });

    it('applies per-imageId default immediately when the current image matches', () => {
      const { host } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
        getCurrentImageId: jest.fn(() => 'image-special'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      controller.setDefaultProperties(
        { voiRange: { lower: 10, upper: 20 } },
        'image-special'
      );
      expect(host.setDataPresentationState).toHaveBeenCalled();
    });

    it('clearDefaultProperties without an imageId resets to a blank state', () => {
      const { host } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      controller.setDefaultProperties({ voiRange: { lower: 0, upper: 100 } });
      host.setDataPresentationState.mockClear();
      controller.clearDefaultProperties();
      expect(host.setDataPresentationState).toHaveBeenCalledWith('data-1', {});
    });
  });

  describe('STACK_NEW_IMAGE listener', () => {
    it('applies per-image default properties when the event fires', () => {
      const { host, element } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
        getCurrentImageId: jest.fn(() => 'other-image'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);

      controller.setDefaultProperties(
        { voiRange: { lower: 5, upper: 15 } },
        'event-image'
      );
      host.setDataPresentationState.mockClear();

      element.dispatchEvent(
        new CustomEvent(Events.STACK_NEW_IMAGE, {
          detail: { imageId: 'event-image' },
        })
      );

      expect(host.setDataPresentationState).toHaveBeenCalled();
    });

    it('is removed from the element on destroy', () => {
      const { host, element } = createHost({
        getActiveDataId: jest.fn(() => 'data-1'),
      });
      const controller = new PlanarLegacyCompatibilityController(host);
      controller.setDefaultProperties(
        { voiRange: { lower: 1, upper: 2 } },
        'image-x'
      );

      controller.destroy();
      host.setDataPresentationState.mockClear();

      element.dispatchEvent(
        new CustomEvent(Events.STACK_NEW_IMAGE, {
          detail: { imageId: 'image-x' },
        })
      );

      expect(host.setDataPresentationState).not.toHaveBeenCalled();
    });
  });

  describe('blend mode', () => {
    it('returns undefined when no volume binding exists', () => {
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);
      expect(controller.getBlendMode()).toBeUndefined();
    });

    it('sets blend mode on each tracked volume binding', async () => {
      cache.getVolume.mockReturnValue({ imageIds: ['v-0'] });
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);

      await controller.setVolumes([
        { volumeId: 'vol-1' },
        { volumeId: 'vol-2' },
      ]);
      host.setDisplaySetPresentation.mockClear();

      controller.setBlendMode(2, [], true);
      expect(host.setDisplaySetPresentation).toHaveBeenCalledTimes(2);
      expect(host.render).toHaveBeenCalled();
    });

    const dataId = '__planar_v2__:vp-1:volume:vol-1';

    /**
     * A host whose binding draws through the given render mode, with an actor
     * whose mapper reports the slab type MEAN, the default of vtkImageMapper.
     * The host keeps the presentation as the viewport does: a display set
     * presentation merges, a data presentation state replaces.
     */
    function createMappedHost(renderMode) {
      const mapper = { getSlabType: () => SlabTypes.MEAN };
      const actor = { getMapper: () => mapper };
      const presentations = new Map();

      return createHost({
        getActiveDataId: jest.fn(() => dataId),
        getBindingActor: jest.fn(() => actor),
        getBindingRenderMode: jest.fn(() => renderMode),
        setDisplaySetPresentation: jest.fn((id, props) =>
          presentations.set(id, { ...presentations.get(id), ...props })
        ),
        setDataPresentationState: jest.fn((id, props) =>
          presentations.set(id, props)
        ),
        getDisplaySetPresentation: jest.fn((id) => presentations.get(id)),
      });
    }

    async function mountMip(host) {
      cache.getVolume.mockReturnValue({ imageIds: ['v-0'] });

      const controller = new PlanarLegacyCompatibilityController(host);

      await controller.setVolumes([
        {
          volumeId: 'vol-1',
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
          callback: jest.fn(),
        },
      ]);

      return controller;
    }

    it('keeps the blend mode of the presentation after a callback on a sampled slice', async () => {
      const { host } = createMappedHost(ActorRenderMode.VTK_SAMPLED_SLICE);
      const controller = await mountMip(host);

      expect(host.getDisplaySetPresentation(dataId).blendMode).toBe(
        BlendModes.MAXIMUM_INTENSITY_BLEND
      );
      expect(controller.getBlendMode()).toBe(
        BlendModes.MAXIMUM_INTENSITY_BLEND
      );
    });

    it('reads the blend mode back from the mapper after a callback on the GPU volume path', async () => {
      const { host } = createMappedHost(ActorRenderMode.VTK_VOLUME_SLICE);

      await mountMip(host);

      expect(host.getDisplaySetPresentation(dataId).blendMode).toBe(
        BlendModes.AVERAGE_INTENSITY_BLEND
      );
    });

    it('gives the blend mode of the presentation of a sampled slice, else composite', () => {
      const sampled = createMappedHost(ActorRenderMode.VTK_SAMPLED_SLICE).host;
      const gpu = createMappedHost(ActorRenderMode.VTK_VOLUME_SLICE).host;
      const sampledController = new PlanarLegacyCompatibilityController(
        sampled
      );
      const gpuController = new PlanarLegacyCompatibilityController(gpu);

      sampledController.volumeDataIds.set('vol-1', dataId);
      gpuController.volumeDataIds.set('vol-1', dataId);

      expect(sampledController.getBlendMode()).toBe(BlendModes.COMPOSITE);
      expect(gpuController.getBlendMode()).toBe(
        BlendModes.AVERAGE_INTENSITY_BLEND
      );

      sampled.setDisplaySetPresentation(dataId, {
        blendMode: BlendModes.MINIMUM_INTENSITY_BLEND,
      });

      expect(sampledController.getBlendMode()).toBe(
        BlendModes.MINIMUM_INTENSITY_BLEND
      );
    });
  });

  describe('housekeeping', () => {
    it('getNumberOfSlices reports the larger of host.getImageCount and getMaxImageIdIndex+1', () => {
      const { host } = createHost({
        getImageCount: jest.fn(() => 3),
        getMaxImageIdIndex: jest.fn(() => 9),
      });
      const controller = new PlanarLegacyCompatibilityController(host);
      expect(controller.getNumberOfSlices()).toBe(10);
    });

    it('removeData unregisters from the metadata provider only for managed ids', () => {
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);

      controller.removeData('not-managed');
      expect(metadataProvider.remove).not.toHaveBeenCalled();
    });

    it('destroy clears all internal maps and detaches listeners', async () => {
      cache.getVolume.mockReturnValue({ imageIds: ['v-0'] });
      const { host } = createHost();
      const controller = new PlanarLegacyCompatibilityController(host);
      await controller.setVolumes([{ volumeId: 'vol-1' }]);

      controller.destroy();
      expect(metadataProvider.remove).toHaveBeenCalled();
    });
  });
});
