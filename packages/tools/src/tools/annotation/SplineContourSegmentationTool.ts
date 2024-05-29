import { utilities } from '@cornerstonejs/core';
import { PublicToolProps } from '../../types/index.js';
import SplineROITool from './SplineROITool.js';

class SplineContourSegmentationTool extends SplineROITool {
  static toolName;

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

SplineContourSegmentationTool.toolName = 'SplineContourSegmentationTool';
export default SplineContourSegmentationTool;
