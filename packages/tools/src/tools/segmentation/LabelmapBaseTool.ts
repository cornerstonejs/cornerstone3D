import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { LabelmapMemo } from '../../utilities/segmentation';
import { BaseTool } from '../base';

const { DefaultHistoryMemo } = utilities.HistoryMemo;

/**
 * A type for preview data/information, used to setup previews on hover, or
 * maintain the preview information.
 */
export type PreviewData = {
  /**
   *  The preview data returned from the strategy
   */
  preview: unknown;
  timer?: number;
  timerStart: number;
  startPoint: Types.Point2;
  element: HTMLDivElement;
  isDrag: boolean;
};

/**
 * Labelmap tool containing shared functionality for labelmap tools.
 */
export default class LabelmapBaseTool extends BaseTool {
  protected _previewData?: PreviewData = {
    preview: null,
    element: null,
    timerStart: 0,
    timer: null,
    startPoint: [NaN, NaN],
    isDrag: false,
  };

  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Creates a labelmap memo instance and returns it.
   * Uses the existing memo if defined.
   */
  public createMemo(segmentId: string, segmentationVoxelManager, preview) {
    if (this.memo) {
      if (preview?.previewVoxelManager) {
        // Need to update the preview voxel manager to use the new one
        (this.memo as LabelmapMemo.LabelmapMemo).voxelManager =
          preview.previewVoxelManager;
      }
      return this.memo as LabelmapMemo.LabelmapMemo;
    }
    this.memo ||= LabelmapMemo.createLabelmapMemo(
      segmentId,
      segmentationVoxelManager,
      preview
    );
    return this.memo as LabelmapMemo.LabelmapMemo;
  }
}
