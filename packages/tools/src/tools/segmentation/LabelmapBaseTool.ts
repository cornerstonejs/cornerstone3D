import { utilities } from '@cornerstonejs/core';
import { LabelmapMemo } from '../../utilities/segmentation';
import { BaseTool } from '../base';

const { DefaultHistoryMemo } = utilities.HistoryMemo;

/**
 * Labelmap tool containing shared functionality for labelmap tools.
 */
export default class LabelmapBaseTool extends BaseTool {
  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Creates a labelmap memo instance and returns it.
   * Uses the existing memo if defined.
   */
  public createMemo(
    segmentId: string,
    segmentationVoxelManager,
    previewVoxelManager?,
    previewMemo?
  ) {
    if (this.memo && !this.memo.complete) {
      // If the memo was already completed, ensure it gets stored first
      // Shouldn't happen, but can occur when missing events
      DefaultHistoryMemo.push(this.memo);
      this.memo = null;
    }
    this.memo ||= LabelmapMemo.createLabelmapMemo(
      segmentId,
      segmentationVoxelManager,
      previewVoxelManager,
      previewMemo
    );
    return this.memo as LabelmapMemo.LabelmapMemo;
  }
}
