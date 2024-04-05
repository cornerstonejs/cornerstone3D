import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  SplineContourSegmentationTool,
  LivewireContourSegmentationTool,
  PlanarFreehandContourSegmentationTool,
  Enums,
} = cornerstoneTools;

const { SegmentationRepresentations } = Enums;

const toolMap = new Map<string, any>();

const interpolationConfiguration = {
  interpolation: { enabled: true },
  decimate: {
    enabled: true,
    /** A maximum given distance 'epsilon' to decide if a point should or
     * shouldn't be added the resulting polyline which will have a lower
     * number of points for higher `epsilon` values.
     * Larger values work well for this video example
     */
    epsilon: 0.5,
  },
};

toolMap.set(PlanarFreehandContourSegmentationTool.toolName, {
  tool: PlanarFreehandContourSegmentationTool,
  segmentationType: SegmentationRepresentations.Contour,
});

toolMap.set(LivewireContourSegmentationTool.toolName, {
  tool: LivewireContourSegmentationTool,
  segmentationType: SegmentationRepresentations.Contour,
});

toolMap.set('CatmullRomSplineROI', {
  tool: SplineContourSegmentationTool,
  segmentationType: SegmentationRepresentations.Contour,
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.CatmullRom,
  },
});
toolMap.set('LinearSplineROI', {
  segmentationType: SegmentationRepresentations.Contour,
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.Linear,
  },
});

toolMap.set('BSplineROI', {
  segmentationType: SegmentationRepresentations.Contour,
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.BSpline,
  },
});

toolMap.set('FreeformInterpolation', {
  segmentationType: SegmentationRepresentations.Contour,
  baseTool: PlanarFreehandContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});
toolMap.set('SplineInterpolation', {
  segmentationType: SegmentationRepresentations.Contour,
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});
toolMap.set('LivewireInterpolation', {
  segmentationType: SegmentationRepresentations.Contour,
  baseTool: LivewireContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});

const contourTools = {
  toolMap,
};

export default contourTools;
