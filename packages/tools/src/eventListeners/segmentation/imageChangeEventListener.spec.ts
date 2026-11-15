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
  '../../stateManagement/segmentation/SegmentationRenderingEngine',
  () => ({
    triggerSegmentationRender: jest.fn(),
  })
);

jest.mock(
  '../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode',
  () => jest.fn(() => 'volume')
);

jest.mock(
  '../../stateManagement/segmentation/helpers/labelmapImageMapperSupport',
  () => ({
    canRenderVolumeViewportLabelmapAsImage: jest.fn(() => true),
    getVolumeViewportLabelmapImageMapperState: jest.fn(() => ({
      key: 'supported',
    })),
    shouldUseSliceRendering: jest.fn(() => true),
  })
);

jest.mock(
  '../../stateManagement/segmentation/getSegmentationRepresentation',
  () => ({
    getSegmentationRepresentations: jest.fn(),
  })
);

jest.mock('../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(() => ({})),
}));

jest.mock('../../tools/displayTools/Labelmap/syncStackLabelmapActors', () => ({
  syncStackLabelmapActors: jest.fn(),
}));

jest.mock(
  '../../tools/displayTools/Labelmap/volumeLabelmapImageMapper',
  () => ({
    placeVolumeLabelmapImageMapperActors: jest.fn(),
  })
);

import {
  Enums,
  getEnabledElement,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import imageChangeEventListener from './imageChangeEventListener';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/getSegmentationRepresentation';
import { canRenderVolumeViewportLabelmapAsImage } from '../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import { triggerSegmentationRender } from '../../stateManagement/segmentation/SegmentationRenderingEngine';

const viewportId = 'viewport';
const renderingEngineId = 'rendering-engine';

const mockedCanRender =
  canRenderVolumeViewportLabelmapAsImage as unknown as jest.Mock;
const mockedRepresentations = getSegmentationRepresentations as jest.Mock;
const mockedTriggerRender = triggerSegmentationRender as jest.Mock;

/**
 * Fires IMAGE_RENDERED on the element the way a viewport render does.
 */
function fireImageRendered(element: HTMLDivElement): void {
  element.dispatchEvent(
    new CustomEvent(Enums.Events.IMAGE_RENDERED, {
      detail: { viewportId, renderingEngineId },
    })
  );
}

describe('segmentation imageChangeEventListener on a slab change of a planar viewport', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    jest.clearAllMocks();
    element = document.createElement('div');

    const viewport = {
      id: viewportId,
      type: Enums.ViewportType.PLANAR_NEXT,
      element,
    };

    (getEnabledElement as jest.Mock).mockReturnValue({ viewport });
    (getEnabledElementByIds as jest.Mock).mockReturnValue({ viewport });
    mockedRepresentations.mockReturnValue([
      {
        segmentationId: 'segmentation',
        type: SegmentationRepresentations.Labelmap,
      },
    ]);
    mockedCanRender.mockReturnValue(true);
    imageChangeEventListener.enable(element);
  });

  afterEach(() => {
    imageChangeEventListener.disable(element);
  });

  it('chooses the labelmap plan again when a slab starts and when it ends', () => {
    fireImageRendered(element);
    fireImageRendered(element);

    expect(mockedTriggerRender).not.toHaveBeenCalled();

    mockedCanRender.mockReturnValue(false);
    fireImageRendered(element);
    fireImageRendered(element);

    expect(mockedTriggerRender).toHaveBeenCalledTimes(1);
    expect(mockedTriggerRender).toHaveBeenCalledWith(viewportId);

    mockedCanRender.mockReturnValue(true);
    fireImageRendered(element);

    expect(mockedTriggerRender).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when the viewport has no labelmap', () => {
    mockedRepresentations.mockReturnValue([]);
    fireImageRendered(element);
    mockedCanRender.mockReturnValue(false);
    fireImageRendered(element);

    expect(mockedTriggerRender).not.toHaveBeenCalled();
  });

  it('stops listening when the element is disabled', () => {
    fireImageRendered(element);
    imageChangeEventListener.disable(element);
    mockedCanRender.mockReturnValue(false);
    fireImageRendered(element);

    expect(mockedTriggerRender).not.toHaveBeenCalled();
  });
});
