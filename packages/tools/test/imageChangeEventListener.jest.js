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

jest.mock(
  '../src/tools/displayTools/Labelmap/volumeLabelmapImageMapper',
  () => ({
    placeVolumeLabelmapImageMapperActors: jest.fn(),
  })
);

import {
  Enums,
  getEnabledElement,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../src/enums';
import imageChangeEventListener from '../src/eventListeners/segmentation/imageChangeEventListener';
import { getSegmentationRepresentations } from '../src/stateManagement/segmentation/getSegmentationRepresentation';
import {
  canRenderVolumeViewportLabelmapAsImage,
  getVolumeViewportLabelmapImageMapperState,
  shouldUseSliceRendering,
} from '../src/stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import { triggerSegmentationRender } from '../src/stateManagement/segmentation/SegmentationRenderingEngine';
import { syncStackLabelmapActors } from '../src/tools/displayTools/Labelmap/syncStackLabelmapActors';
import { placeVolumeLabelmapImageMapperActors } from '../src/tools/displayTools/Labelmap/volumeLabelmapImageMapper';

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

describe('segmentation imageChangeEventListener on a planar viewport with slice-rendered labelmaps', () => {
  let element;
  let viewport;

  /**
   * Fires CAMERA_MODIFIED on the element the way a camera change does.
   */
  function fireCameraModified() {
    element.dispatchEvent(
      new CustomEvent(Enums.Events.CAMERA_MODIFIED, {
        detail: { viewportId, renderingEngineId },
      })
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    element = document.createElement('div');
    viewport = {
      id: viewportId,
      type: Enums.ViewportType.PLANAR_NEXT,
      element,
      getCurrentImageId: () => 'image:0',
    };

    getEnabledElement.mockReturnValue({ viewport });
    getEnabledElementByIds.mockReturnValue({ viewport });
    getSegmentationRepresentations.mockReturnValue([
      {
        segmentationId: 'segmentation',
        type: SegmentationRepresentations.Labelmap,
      },
    ]);
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    shouldUseSliceRendering.mockReturnValue(true);
    getVolumeViewportLabelmapImageMapperState.mockReturnValue({
      key: 'supported:0,0,1:10',
    });
    imageChangeEventListener.enable(element);
  });

  afterEach(() => {
    imageChangeEventListener.disable(element);
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    shouldUseSliceRendering.mockReturnValue(false);
  });

  it('puts the labelmap slices back on the view plane on each camera change', () => {
    fireCameraModified();
    fireCameraModified();

    expect(placeVolumeLabelmapImageMapperActors).toHaveBeenCalledTimes(2);
    expect(placeVolumeLabelmapImageMapperActors).toHaveBeenCalledWith({
      viewport,
      segmentationId: 'segmentation',
    });
  });

  it('asks for a new slice image only when the slice state changes', () => {
    fireCameraModified();
    fireCameraModified();

    expect(triggerSegmentationRender).toHaveBeenCalledTimes(1);

    getVolumeViewportLabelmapImageMapperState.mockReturnValue({
      key: 'supported:0,0,1:11',
    });
    fireCameraModified();

    expect(triggerSegmentationRender).toHaveBeenCalledTimes(2);
    expect(placeVolumeLabelmapImageMapperActors).toHaveBeenCalledTimes(3);
  });

  it('leaves the actors alone when no labelmap is drawn as a slice image', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    fireCameraModified();

    expect(placeVolumeLabelmapImageMapperActors).not.toHaveBeenCalled();
  });
});
