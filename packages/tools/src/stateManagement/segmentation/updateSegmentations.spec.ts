import { SegmentationRepresentations } from '../../enums';
import normalizeSegmentationInput from './helpers/normalizeSegmentationInput';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import { updateSegmentations } from './updateSegmentations';

jest.mock('./triggerSegmentationEvents');

const segmentationId = 'update-segmentations-spec';

describe('updateSegmentations', () => {
  beforeEach(() => {
    defaultSegmentationStateManager.resetState();
    defaultSegmentationStateManager.addSegmentation(
      normalizeSegmentationInput({
        segmentationId,
        representation: {
          type: SegmentationRepresentations.Contour,
          data: {},
        },
      })
    );
    jest.mocked(triggerSegmentationModified).mockClear();
  });

  afterAll(() => {
    defaultSegmentationStateManager.resetState();
  });

  it('fires one SEGMENTATION_MODIFIED event per update', () => {
    updateSegmentations([{ segmentationId, payload: { label: 'Liver' } }]);

    expect(triggerSegmentationModified).toHaveBeenCalledTimes(1);
    expect(triggerSegmentationModified).toHaveBeenCalledWith(segmentationId);
  });

  it('fires no SEGMENTATION_MODIFIED event when suppressEvents is set', () => {
    updateSegmentations(
      [{ segmentationId, payload: { label: 'Liver' } }],
      true
    );

    expect(triggerSegmentationModified).not.toHaveBeenCalled();
    expect(
      defaultSegmentationStateManager.getSegmentation(segmentationId).label
    ).toBe('Liver');
  });
});
