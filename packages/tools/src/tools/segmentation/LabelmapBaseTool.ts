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
  /** A timer id to allow cancelling the timer */
  timer?: number;
  /** The start time for the timer, to allow showing preview after a given length of time */
  timerStart: number;
  /**
   * The starting point where the use clicked down on, used to cancel preview
   * on drag, but preserve it if the user moves the mouse tiny amounts accidentally.
   */
  startPoint: Types.Point2;
  element: HTMLDivElement;
  /**
   * Record if this is a drag preview, that is, a preview which is being extended
   * by the user dragging to view more area.
   */
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
   * Creates a labelmap memo instance, which is a partially created memo
   * object that stores the changes made to the labelmap rather than the
   * initial state.  This memo is then committed once done so that the
   */
  public createMemo(segmentId: string, segmentationVoxelManager, preview) {
    this.memo ||= LabelmapMemo.createLabelmapMemo(
      segmentId,
      segmentationVoxelManager,
      preview
    );
    return this.memo as LabelmapMemo.LabelmapMemo;
  }
}
