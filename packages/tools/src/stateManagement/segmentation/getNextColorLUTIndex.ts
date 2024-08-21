import { defaultSegmentationStateManager } from './SegmentationStateManager';

export function getNextColorLUTIndex(): number {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getNextColorLUTIndex();
}
