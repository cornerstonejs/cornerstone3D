import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  RectangleScissorsTool,
  SphereScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
} = cornerstoneTools;

const previewColors = {
  0: [255, 255, 255, 128],
  1: [0, 255, 255, 255],
};
const preview = {
  enabled: true,
  previewColors,
};
const configuration = {
  preview,
  strategySpecificConfiguration: {
    useCenterSegmentIndex: true,
  },
};
const thresholdOptions = new Map();
thresholdOptions.set('Dynamic Radius 0', { isDynamic: true, dynamicRadius: 0 });
thresholdOptions.set('Dynamic Radius 1', { isDynamic: true, dynamicRadius: 1 });
thresholdOptions.set('Dynamic Radius 2', { isDynamic: true, dynamicRadius: 2 });
thresholdOptions.set('Dynamic Radius 3', { isDynamic: true, dynamicRadius: 3 });
thresholdOptions.set('Use Existing Threshold', {
  isDynamic: false,
  dynamicRadius: 5,
});
thresholdOptions.set('CT Fat: (-150, -70)', {
  threshold: [-150, -70],
  isDynamic: false,
});
thresholdOptions.set('CT Bone: (200, 1000)', {
  threshold: [200, 1000],
  isDynamic: false,
});

const defaultThresholdOption = [...thresholdOptions.keys()][2];
const thresholdArgs = thresholdOptions.get(defaultThresholdOption);
const toolMap = new Map();

toolMap.set('ThresholdCircle', {
  tool: BrushTool,
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'THRESHOLD_INSIDE_CIRCLE',
    strategySpecificConfiguration: {
      ...configuration.strategySpecificConfiguration,
      THRESHOLD: { ...thresholdArgs },
    },
  },
});

toolMap.set('CircularBrush', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'FILL_INSIDE_CIRCLE',
  },
});

toolMap.set('CircularEraser', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'ERASE_INSIDE_CIRCLE',
  },
});

toolMap.set('SphereBrush', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'FILL_INSIDE_SPHERE',
  },
});
toolMap.set('SphereEraser', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'ERASE_INSIDE_SPHERE',
  },
});
toolMap.set(RectangleScissorsTool.toolName, { tool: RectangleScissorsTool });
toolMap.set(CircleScissorsTool.toolName, { tool: CircleScissorsTool });
toolMap.set(SphereScissorsTool.toolName, { tool: SphereScissorsTool });
toolMap.set('ScissorsEraser', {
  baseTool: SphereScissorsTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'ERASE_INSIDE',
  },
});
toolMap.set(PaintFillTool.toolName, {});

const labelmapTools = {
  toolMap,
  thresholdOptions,
  configuration,
  previewColors,
  preview,
};

export default labelmapTools;
