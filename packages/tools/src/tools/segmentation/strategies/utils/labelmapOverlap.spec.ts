jest.mock('../../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(() => ({ segmentationId: 'segmentation' })),
}));
jest.mock(
  '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState',
  () => ({
    beginLabelmapEditTransaction: jest.fn(),
    getLockedVoxelsOnOtherLayers: jest.fn(() => []),
    resolveLabelmapLayerEditTarget: jest.fn(),
  })
);
jest.mock('./crossLayerErase', () => ({
  eraseCrossLayerOverwrites: jest.fn(),
}));
jest.mock('./overwritePolicy', () => ({
  resolveOverwriteSegmentIndices: jest.fn(() => []),
}));

import {
  beginLabelmapEditTransaction,
  getLockedVoxelsOnOtherLayers,
  resolveLabelmapLayerEditTarget,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { prepareOverlapOperationData } from './labelmapOverlap';

const sourceLayer = { labelmapId: 'source' };
const privateLayer = { labelmapId: 'private', volumeId: 'private-volume' };

function prepare(dimensions: number[]) {
  const transaction = {
    segmentIndex: 1,
    labelmapId: 'private',
    labelValue: 1,
    sourceLayer,
    activeLayer: privateLayer,
    movedSegment: true,
    crossLayerEraseBindings: [],
  };
  (beginLabelmapEditTransaction as jest.Mock).mockReturnValue(transaction);
  // A stack layer target after the move: a 2D image.
  const sliceVoxelManager = { dimensions: [4, 4, 1] };
  (resolveLabelmapLayerEditTarget as jest.Mock).mockReturnValue({
    imageId: 'private-1',
    voxelManager: sliceVoxelManager,
  });
  const operationData = {
    segmentationId: 'segmentation',
    segmentIndex: 1,
    segmentsLocked: [2],
    imageId: 'source-1',
    viewport: {},
    segmentationVoxelManager: { dimensions },
  };

  prepareOverlapOperationData(operationData as never);

  return { transaction, operationData, sliceVoxelManager };
}

describe('prepareOverlapOperationData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks a 2D brush edit as an image slice edit for the move and the locked check', () => {
    const { transaction, operationData, sliceVoxelManager } = prepare([
      4, 4, 1,
    ]);

    expect(resolveLabelmapLayerEditTarget).toHaveBeenCalledWith(
      privateLayer,
      expect.objectContaining({
        imageId: 'source-1',
        sourceLayer,
        imageSliceEdit: true,
      })
    );
    expect(operationData.segmentationVoxelManager).toBe(sliceVoxelManager);
    expect(operationData.imageId).toBe('private-1');
    // The locked check reads the layers for the image of the private layer.
    expect(getLockedVoxelsOnOtherLayers).toHaveBeenCalledWith(
      expect.anything(),
      'private',
      [2],
      expect.objectContaining({
        imageId: 'private-1',
        sourceLayer: privateLayer,
        imageSliceEdit: true,
      })
    );
    expect(transaction).toEqual(
      expect.objectContaining({ imageSliceEdit: true })
    );
  });

  it('keeps a 3D strategy in a stack viewport a volume edit', () => {
    const { transaction } = prepare([4, 4, 8]);

    expect(resolveLabelmapLayerEditTarget).toHaveBeenCalledWith(
      privateLayer,
      expect.objectContaining({ imageSliceEdit: false })
    );
    expect(getLockedVoxelsOnOtherLayers).toHaveBeenCalledWith(
      expect.anything(),
      'private',
      [2],
      expect.objectContaining({ imageSliceEdit: false })
    );
    expect(transaction).toEqual(
      expect.objectContaining({ imageSliceEdit: false })
    );
  });
});
