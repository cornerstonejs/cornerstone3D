import { utilities } from '@cornerstonejs/core';
import type { PublicToolProps } from '../../types/index.js';
import type { AnnotationRenderContext } from '../../types/index.js';
import { PlanarFreehandContourSegmentationAnnotation } from '../../types/ToolSpecificAnnotationTypes.js';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents.js';
import PlanarFreehandROITool from './PlanarFreehandROITool.js';

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
    const annotation =
      renderContext.annotation as PlanarFreehandContourSegmentationAnnotation;
    const { invalidated } = annotation;

    // Render the annotation before triggering events
    const renderResult = super.renderAnnotationInstance(renderContext);

    if (invalidated) {
      const { segmentationId } = annotation.data.segmentation;

      // This event is trigged by ContourSegmentationBaseTool but PlanarFreehandROITool
      // is the only contour class that does not call `renderAnnotationInstace` from
      // its base class.
      triggerSegmentationDataModified(segmentationId);
    }

    return renderResult;
  }
}

PlanarFreehandContourSegmentationTool.toolName =
  'PlanarFreehandContourSegmentationTool';

export default PlanarFreehandContourSegmentationTool;
