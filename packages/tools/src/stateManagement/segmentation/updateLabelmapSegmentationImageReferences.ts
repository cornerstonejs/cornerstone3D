import { defaultSegmentationStateManager } from './SegmentationStateManager';

export function updateLabelmapSegmentationImageReferences(
  viewportId: string,
  segmentationId: string
) {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.updateLabelmapSegmentationImageReferences(
    viewportId,
    segmentationId
  );
}
