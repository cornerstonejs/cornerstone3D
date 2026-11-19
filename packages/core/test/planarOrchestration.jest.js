import { Events, OrientationAxis } from '../src/enums';
import PlanarLegacyCompatibilityController, {
  PLANAR_LEGACY_PER_IMAGE_DEFAULT_PROPERTIES_LIMIT,
} from '../src/RenderingEngine/GenericViewport/Planar/PlanarLegacyCompatibilityController';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';

function createLegacyStackHarness({ deferSetData = false } = {}) {
  const element = document.createElement('div');
  const viewportId = 'CT_STACK';
  const dataId = `__planar_v2__:${viewportId}:stack`;
  const pendingSetData = [];
  let controller;
  let hasBinding = false;
  let currentImageIds = [];

  function finishSetData(requestedDataId) {
    const registered = genericViewportDisplaySetMetadataProvider.get(
      genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
      requestedDataId
    );

    if (!registered) {
      throw new Error(`Missing metadata for ${requestedDataId}`);
    }

    currentImageIds = registered.imageIds;
    hasBinding = true;
  }

  const host = {
    getElement: () => element,
    getViewportId: () => viewportId,
    getRequestedOrientation: () => OrientationAxis.ACQUISITION,
    prepareVolumeCompatibilityCamera: jest.fn(),
    setDisplaySets: jest.fn((...entries) => {
      const requestedDataId = entries[0]?.displaySetId;

      if (hasBinding) {
        hasBinding = false;
        controller.removeData(requestedDataId);
      }

      if (!deferSetData) {
        finishSetData(requestedDataId);
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        pendingSetData.push(() => {
          finishSetData(requestedDataId);
          resolve();
        });
      });
    }),
    addDisplaySet: jest.fn(async () => undefined),
    setImageIdIndex: jest.fn(async (imageIdIndex) => {
      return currentImageIds[imageIdIndex];
    }),
    getCurrentImageId: () => currentImageIds[0],
    render: jest.fn(),
    removeBindingsExcept: jest.fn((keepDataIds) => {
      if (hasBinding && !keepDataIds.has(dataId)) {
        hasBinding = false;
        controller.removeData(dataId);
      }
    }),
    setCameraOrientation: jest.fn(),
    setDataPresentationState: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    getDisplaySetPresentation: jest.fn(),
    notifyDataPresentationModified: jest.fn(),
    triggerCameraReset: jest.fn(),
    getCameraOrientation: jest.fn(),
    getCurrentPlanarRendering: jest.fn(),
    getActiveDataId: () => (hasBinding ? dataId : undefined),
    getFirstBoundDataId: () => (hasBinding ? dataId : undefined),
    findDataIdByVolumeId: jest.fn(),
    getBindingActor: jest.fn(),
    getBindingRenderMode: jest.fn(),
    getDefaultVOIRange: jest.fn(),
    getDefaultInvert: jest.fn(),
    getImageCount: () => currentImageIds.length,
    getMaxImageIdIndex: () => Math.max(0, currentImageIds.length - 1),
  };

  controller = new PlanarLegacyCompatibilityController(host);

  return {
    controller,
    dataId,
    element,
    getCurrentImageIds: () => currentImageIds,
    host,
    pendingSetData,
  };
}

describe('Planar legacy stack compatibility', () => {
  afterEach(() => {
    genericViewportDisplaySetMetadataProvider.clear();
  });

  it('replaces the legacy stack without unregistering replacement metadata', async () => {
    const { controller, dataId, getCurrentImageIds, host } =
      createLegacyStackHarness();

    await controller.setStack(['image:old']);
    await expect(controller.setStack(['image:new'])).resolves.toBe('image:new');

    expect(host.setDisplaySets).toHaveBeenCalledTimes(2);
    expect(getCurrentImageIds()).toEqual(['image:new']);
    expect(
      genericViewportDisplaySetMetadataProvider.get(
        genericViewportDisplaySetMetadataProvider.VIEWPORT_V2_DISPLAY_SET,
        dataId
      )
    ).toEqual({
      imageIds: ['image:new'],
      initialImageIdIndex: 0,
    });
  });

  it('ignores stale stack completions from overlapping replacements', async () => {
    const { controller, getCurrentImageIds, host, pendingSetData } =
      createLegacyStackHarness({ deferSetData: true });

    const firstSetStack = controller.setStack(['image:first']);
    const secondSetStack = controller.setStack(['image:second']);

    expect(host.setDisplaySets).toHaveBeenCalledTimes(2);
    pendingSetData.pop()();
    await expect(secondSetStack).resolves.toBe('image:second');
    expect(getCurrentImageIds()).toEqual(['image:second']);
    expect(host.setImageIdIndex).toHaveBeenCalledTimes(1);

    pendingSetData.pop()();
    await expect(firstSetStack).resolves.toBe('image:first');
    expect(host.setImageIdIndex).toHaveBeenCalledTimes(1);
  });

  it('evicts oldest per-image default properties beyond the compatibility cache limit', async () => {
    const { controller, element, host } = createLegacyStackHarness();

    await controller.setStack(['image:active']);

    for (
      let index = 0;
      index <= PLANAR_LEGACY_PER_IMAGE_DEFAULT_PROPERTIES_LIMIT;
      index++
    ) {
      controller.setDefaultProperties({ invert: true }, `image:${index}`);
    }

    host.setDataPresentationState.mockClear();
    element.dispatchEvent(
      new CustomEvent(Events.NEW_IMAGE, {
        detail: {
          imageId: 'image:0',
        },
      })
    );

    expect(host.setDataPresentationState).not.toHaveBeenCalled();

    element.dispatchEvent(
      new CustomEvent(Events.NEW_IMAGE, {
        detail: {
          imageId: `image:${PLANAR_LEGACY_PER_IMAGE_DEFAULT_PROPERTIES_LIMIT}`,
        },
      })
    );

    expect(host.setDataPresentationState).toHaveBeenCalledTimes(1);
  });

  it('prunes per-image default properties that do not belong to a replacement stack', async () => {
    const { controller, element, host } = createLegacyStackHarness();

    await controller.setStack(['image:old']);
    controller.setDefaultProperties({ invert: true }, 'image:old');
    await controller.setStack(['image:new']);

    host.setDataPresentationState.mockClear();
    element.dispatchEvent(
      new CustomEvent(Events.NEW_IMAGE, {
        detail: {
          imageId: 'image:old',
        },
      })
    );

    expect(host.setDataPresentationState).not.toHaveBeenCalled();
  });
});
