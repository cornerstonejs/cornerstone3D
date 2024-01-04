import { utilities } from '@cornerstonejs/core';
import { EventTypes, PublicToolProps } from '../../types';
import { SplineSegmentationROIAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import SplineROITool from './SplineROITool';

class SplineSegmentationROITool extends SplineROITool {
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

  createAnnotation(
    evt: EventTypes.InteractionEventType
  ): SplineSegmentationROIAnnotation {
    const splineROIAnnotation = super.createAnnotation(evt);
    const segmentationAnnotationData = this.getSegmentationAnnotationData();

    return {
      ...splineROIAnnotation,
      ...segmentationAnnotationData,
    } as SplineSegmentationROIAnnotation;
  }
}

SplineSegmentationROITool.toolName = 'SplineSegmentationROI';
export default SplineSegmentationROITool;
