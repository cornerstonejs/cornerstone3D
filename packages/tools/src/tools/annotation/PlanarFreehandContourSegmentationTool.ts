import { utilities } from '@cornerstonejs/core';
import { PublicToolProps } from '../../types';
import PlanarFreehandROITool from './PlanarFreehandROITool';

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
}

PlanarFreehandContourSegmentationTool.toolName =
  'PlanarFreehandContourSegmentationTool';

export default PlanarFreehandContourSegmentationTool;
