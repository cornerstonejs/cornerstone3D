import { defaultSegmentationStateManager } from './SegmentationStateManager';

export function updateLabelmapSegmentationImageReferences(
  viewportId: string,
  segmentationId: string
): string | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.updateLabelmapSegmentationImageReferences(
    viewportId,
    segmentationId
  );
}
