import { eventTarget, utilities } from '@cornerstonejs/core';
import type { PublicToolProps } from '../../types';
import SplineROITool from './SplineROITool';
import { Events } from '../../enums';
import { convertContourSegmentationAnnotation } from '../../utilities/contourSegmentation';
import { getAnnotation } from '../../stateManagement/annotation/annotationState';

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
      this.toolName !== annotation?.metadata?.toolName ||
      !this.splineToolNames.includes(annotation?.metadata?.toolName) ||
      !this.configuration.simplifiedSpline
    ) {
      return;
    }

    // applyContourStroke already removes the source stroke and rebuilds the
    // segment as PlanarFreehandContourSegmentationTool annotations. Converting
    // the removed source again would add a second, same-geometry freehand
    // contour. Under Clipper's EvenOdd fill rule those duplicates cancel out
    // when the next stroke is applied, which makes the original spline vanish.
    // Skip if the source annotation is no longer in the annotation state.
    if (
      !annotation?.annotationUID ||
      !getAnnotation(annotation.annotationUID)
    ) {
      return;
    }

    convertContourSegmentationAnnotation(annotation);
  }
}

export default SplineContourSegmentationTool;
