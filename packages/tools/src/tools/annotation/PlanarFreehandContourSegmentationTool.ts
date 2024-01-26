import type { SplineContourSegmentationAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { utilities } from '@cornerstonejs/core';
import type { PublicToolProps, AnnotationRenderContext } from '../../types';
import PlanarFreehandROITool from './PlanarFreehandROITool';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';

class PlanarFreehandContourSegmentationTool extends PlanarFreehandROITool {
  static toolName;

  constructor(toolProps: PublicToolProps) {
    const initialProps = utilities.deepMerge(
      {
        configuration: {
          calculateStats: false,
          /**
           * Allow open contours false means to not allow a final/complete
           * annotation to be done as an open contour.  This does not mean
           * that the contour won't be open during creation.
           */
          allowOpenContours: false,
        },
      },
      toolProps
    );

    super(initialProps);
  }

  protected isContourSegmentationTool(): boolean {
    // Re-enable contour segmentation behavior disabled by PlanarFreehandROITool
    return true;
  }

  protected renderAnnotationInstance(
    renderContext: AnnotationRenderContext
  ): boolean {
    const { annotation } = renderContext;
    const { invalidated } = annotation;
    const renderResult = super.renderAnnotationInstance(renderContext);

    // Trigger the event only for invalid annotations
    if (invalidated) {
      const { segmentationId } = (<SplineContourSegmentationAnnotation>(
        annotation
      )).data.segmentation;

      triggerSegmentationDataModified(segmentationId);
    }

    return renderResult;
  }
}

PlanarFreehandContourSegmentationTool.toolName =
  'PlanarFreehandContourSegmentationTool';

export default PlanarFreehandContourSegmentationTool;
