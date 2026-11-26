jest.mock('@cornerstonejs/core', () => ({
  getEnabledElementByViewportId: jest.fn((viewportId: string) => ({
    viewport: { id: viewportId },
  })),
}));

jest.mock('./performVolumeLabelmapUpdate', () => ({
  performVolumeLabelmapUpdate: jest.fn(),
}));

jest.mock('./performStackLabelmapUpdate', () => ({
  performStackLabelmapUpdate: jest.fn(),
}));

jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(() => ({ representationData: {} })),
}));

jest.mock(
  '../../../stateManagement/segmentation/getViewportIdsWithSegmentation',
  () => ({ getViewportIdsWithSegmentation: jest.fn() })
);

jest.mock(
  '../../../stateManagement/segmentation/getSegmentationRepresentation',
  () => ({ getSegmentationRepresentations: jest.fn(() => []) })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode',
  () => ({
    __esModule: true,
    default: jest.fn((viewport: { id: string }) =>
      viewport.id.startsWith('volume') ? 'volume' : 'image'
    ),
  })
);

jest.mock(
  '../../../stateManagement/segmentation/SegmentationRenderingEngine',
  () => ({ triggerSegmentationRender: jest.fn() })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport',
  () => ({
    canRenderVolumeViewportLabelmapAsImage: jest.fn(() => false),
    shouldUseSliceRendering: jest.fn(() => false),
  })
);

import { getViewportIdsWithSegmentation } from '../../../stateManagement/segmentation/getViewportIdsWithSegmentation';
import { performVolumeLabelmapUpdate } from './performVolumeLabelmapUpdate';
import onLabelmapSegmentationDataModified from './onLabelmapSegmentationDataModified';

const getViewportIdsMock = getViewportIdsWithSegmentation as jest.Mock;
const performVolumeUpdateMock = performVolumeLabelmapUpdate as jest.Mock;

function fire(detail: Record<string, unknown>) {
  onLabelmapSegmentationDataModified({ detail } as never);
}

describe('onLabelmapSegmentationDataModified', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes a remounted labelmap volume that a stack edit changed', () => {
    // Paint while only a stack viewport shows the segmentation.
    getViewportIdsMock.mockReturnValue(['stack-viewport']);
    fire({ segmentationId: 'segmentation-id', modifiedSlicesToUse: [0] });

    expect(performVolumeUpdateMock).not.toHaveBeenCalled();

    // Mount it in a volume viewport again: the volume missed the edit.
    getViewportIdsMock.mockReturnValue(['volume-viewport']);
    fire({ segmentationId: 'segmentation-id', voxelsUnchanged: true });

    expect(performVolumeUpdateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ voxelsUnchanged: false })
    );

    // A second mount with no edit between keeps the skip.
    fire({ segmentationId: 'segmentation-id', voxelsUnchanged: true });

    expect(performVolumeUpdateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ voxelsUnchanged: true })
    );
  });

  it('refreshes every slice when the first event after a stack edit is an edit', () => {
    getViewportIdsMock.mockReturnValue(['stack-viewport']);
    fire({ segmentationId: 'edited-segmentation', modifiedSlicesToUse: [10] });

    // A mount that sends no event, then an edit of another slice.
    getViewportIdsMock.mockReturnValue(['volume-viewport']);
    fire({ segmentationId: 'edited-segmentation', modifiedSlicesToUse: [50] });

    expect(performVolumeUpdateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modifiedSlicesToUse: [],
        voxelsUnchanged: false,
      })
    );
  });
});
