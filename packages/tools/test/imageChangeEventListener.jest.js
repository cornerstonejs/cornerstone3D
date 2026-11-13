jest.mock('@cornerstonejs/core', () => {
  class BaseVolumeViewport {}

  return {
    BaseVolumeViewport,
    Enums: {
      Events: {
        CAMERA_MODIFIED: 'CORNERSTONE_CAMERA_MODIFIED',
        IMAGE_RENDERED: 'CORNERSTONE_IMAGE_RENDERED',
        PRE_STACK_NEW_IMAGE: 'CORNERSTONE_PRE_STACK_NEW_IMAGE',
      },
      ViewportType: {
        PLANAR_NEXT: 'planarNext',
      },
    },
    getEnabledElement: jest.fn(),
    getEnabledElementByIds: jest.fn(),
  };
});

jest.mock(
  '../src/stateManagement/segmentation/SegmentationRenderingEngine',
  () => ({
    triggerSegmentationRender: jest.fn(),
  })
);

jest.mock(
  '../src/stateManagement/segmentation/helpers/getViewportLabelmapRenderMode',
  () => jest.fn(() => 'image')
);

jest.mock(
  '../src/stateManagement/segmentation/helpers/labelmapImageMapperSupport',
  () => ({
    canRenderVolumeViewportLabelmapAsImage: jest.fn(() => false),
    getVolumeViewportLabelmapImageMapperState: jest.fn(),
    shouldUseSliceRendering: jest.fn(() => false),
  })
);

jest.mock(
  '../src/stateManagement/segmentation/getSegmentationRepresentation',
  () => ({
    getSegmentationRepresentations: jest.fn(),
  })
);

jest.mock('../src/stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(() => ({})),
}));

jest.mock('../src/tools/displayTools/Labelmap/syncStackLabelmapActors', () => ({
  syncStackLabelmapActors: jest.fn(),
}));

import {
  Enums,
  getEnabledElement,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../src/enums';
import imageChangeEventListener from '../src/eventListeners/segmentation/imageChangeEventListener';
import { getSegmentationRepresentations } from '../src/stateManagement/segmentation/getSegmentationRepresentation';
import { syncStackLabelmapActors } from '../src/tools/displayTools/Labelmap/syncStackLabelmapActors';

const viewportId = 'viewport';
const renderingEngineId = 'rendering-engine';
const maxSynchronousRenders = 5;

/**
 * Fires IMAGE_RENDERED on the element the way a viewport render does.
 */
function fireImageRendered(element) {
  element.dispatchEvent(
    new CustomEvent(Enums.Events.IMAGE_RENDERED, {
      detail: { viewportId, renderingEngineId },
    })
  );
}

describe('segmentation imageChangeEventListener', () => {
  let element;

  beforeEach(() => {
    jest.clearAllMocks();
    syncStackLabelmapActors.mockReset();
    element = document.createElement('div');

    const enabledElement = {
      viewport: {
        id: viewportId,
        type: 'stack',
        element,
        getCurrentImageId: () => 'image:0',
      },
    };

    getEnabledElement.mockReturnValue(enabledElement);
    getEnabledElementByIds.mockReturnValue(enabledElement);
    getSegmentationRepresentations.mockReturnValue([
      {
        segmentationId: 'segmentation',
        type: SegmentationRepresentations.Labelmap,
      },
    ]);
  });

  afterEach(() => {
    imageChangeEventListener.disable(element);
  });

  it('syncs the labelmap once when the sync renders synchronously', () => {
    syncStackLabelmapActors.mockImplementation(() => {
      if (syncStackLabelmapActors.mock.calls.length <= maxSynchronousRenders) {
        fireImageRendered(element);
      }
    });

    imageChangeEventListener.enable(element);
    fireImageRendered(element);

    expect(syncStackLabelmapActors).toHaveBeenCalledTimes(1);
  });

  it('stops listening to IMAGE_RENDERED after the initial image', () => {
    imageChangeEventListener.enable(element);
    fireImageRendered(element);
    fireImageRendered(element);

    expect(syncStackLabelmapActors).toHaveBeenCalledTimes(1);
  });
});
