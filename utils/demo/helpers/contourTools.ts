import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  SplineContourSegmentationTool,
  LivewireContourSegmentationTool,
  PlanarFreehandContourSegmentationTool,
} = cornerstoneTools;

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
});

toolMap.set(LivewireContourSegmentationTool.toolName, {
  tool: LivewireContourSegmentationTool,
});

toolMap.set('CatmullRomSplineROI', {
  tool: SplineContourSegmentationTool,
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.CatmullRom,
  },
});
toolMap.set('LinearSplineROI', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.Linear,
  },
});

toolMap.set('BSplineROI', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.BSpline,
  },
});

toolMap.set('FreeformInterpolation', {
  baseTool: PlanarFreehandContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});
toolMap.set('SplineInterpolation', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});
toolMap.set('LivewireInterpolation', {
  baseTool: LivewireContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});

const contourTools = {
  toolMap,
};

export default contourTools;
