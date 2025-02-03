import { utilities } from '@cornerstonejs/core';
import type { PublicToolProps } from '../../types';
import SplineROITool from './SplineROITool';

class SplineContourSegmentationTool extends SplineROITool {
  static toolName = 'SplineContourSegmentationTool';

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
  }

  protected isContourSegmentationTool(): boolean {
    // Re-enable contour segmentation behavior disabled by SplineROITool
    return true;
  }
}

export default SplineContourSegmentationTool;
