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
