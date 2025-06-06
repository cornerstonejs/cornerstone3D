import { eventTarget, utilities } from '@cornerstonejs/core';
import type { PublicToolProps } from '../../types';
import SplineROITool from './SplineROITool';
import { Events } from '../../enums';
import { convertContourSegmentationAnnotation } from '../../utilities/contourSegmentation';

class SplineContourSegmentationTool extends SplineROITool {
  static toolName = 'SplineContourSegmentationTool';
  private annotationCutMergeCompletedBinded;

  constructor(toolProps: PublicToolProps) {
    const initialProps = utilities.deepMerge(
      {
        configuration: {
          calculateStats: false,
        },
      },
      toolProps
    );

    super(initialProps);
    this.annotationCutMergeCompletedBinded =
      this.annotationCutMergeCompleted.bind(this);
  }

  protected isContourSegmentationTool(): boolean {
    // Re-enable contour segmentation behavior disabled by SplineROITool
    return true;
  }

  protected initializeListeners() {
    eventTarget.addEventListener(
      Events.ANNOTATION_CUT_MERGE_PROCESS_COMPLETED,
      this.annotationCutMergeCompletedBinded
    );
  }

  protected removeListeners() {
    eventTarget.removeEventListener(
      Events.ANNOTATION_CUT_MERGE_PROCESS_COMPLETED,
      this.annotationCutMergeCompletedBinded
    );
  }

  protected annotationCutMergeCompleted(evt) {
    const { sourceAnnotation: annotation } = evt.detail;
    if (
      !this.splineToolNames.includes(annotation?.metadata?.toolName) ||
      !this.configuration.simplifiedSpline
    ) {
      return;
    }
    convertContourSegmentationAnnotation(annotation);
  }
}

export default SplineContourSegmentationTool;
