import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers/index.js';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { Statistics } from '../../src/types/index.js';
import { Calculator } from '../../src/utilities/math/basic/index.js';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  CobbAngleTool,
  ToolGroupManager,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Tools Stack',
  'Annotation tools for a stack viewport with custom text and statistics calculator if wanted'
);

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const instructions = document.createElement('p');
instructions.innerText = 'Left Click to use selected tool';
info.appendChild(instructions);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, (_) => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the stack viewport
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  if (!viewport) {
    return;
  }
});
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const toolsNames = [
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  CobbAngleTool.toolName,
  ArrowAnnotateTool.toolName,
  PlanarFreehandROITool.toolName,
];
let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    selectedToolName = <string>newSelectedToolName;
  },
});

//Here are the function with all your custom text to show
function getTextLinesLength(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { length, unit } = cachedVolumeStats;

  // Can be null on load
  if (length === undefined || length === null || isNaN(length)) {
    return;
  }

  const textLines = [`${Math.round(length)} ${unit}`, `(your custom text)`];

  return textLines;
}

function getTextLinesRectangle(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { area, mean, max, stdDev, areaUnit, modalityUnit } = cachedVolumeStats;

  if (mean === undefined) {
    return;
  }

  const textLines: string[] = [];

  textLines.push(`Area: ${Math.round(area)} ${areaUnit}`);
  textLines.push(`Mean: ${Math.round(mean)} ${modalityUnit}`);
  textLines.push(`(your custom text or statistic)`);
  return textLines;
}

function getTextLinesProbe(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { index, value, modalityUnit } = cachedVolumeStats;

  if (value === undefined) {
    return;
  }

  const textLines = [];

  textLines.push(`(${index[0]}, ${index[1]}, ${index[2]})`);
  textLines.push(`(your custom text)`);

  return textLines;
}

function getTextLinesAngle(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { angle } = cachedVolumeStats;

  if (angle === undefined) {
    return;
  }

  const textLines = [`${Math.round(angle)} ${String.fromCharCode(176)}`];
  textLines.push(`(your custom text)`);

  return textLines;
}

//This is an exemple of a custom statistic calculator
class newStatsCalculator extends Calculator {
  /**
   * This callback is used when we verify if the point is in the annotion drawn so we can get every point
   * in the shape to calculate the statistics
   * @param value of the point in the shape of the annotation
   */
  static statsCallback = ({ value: newValue }): void => {
    //Do something with the points in the annotation
  };

  /**
   * Basic function that calculates statictics for a given array of points.
   * @param points
   * @returns An object that contains :
   * max : The maximum value of the array
   * mean : mean of the array
   * stdDev : standard deviation of the array
   * stdDevWithSumSquare : standard deviation of the array using sum²
   */

  static getStatistics = (): Statistics[] => {
    //Here you can calculate your own statistics and send them back
    return [
      { name: 'max', value: 900, unit: null },
      { name: 'mean', value: 999, unit: null },
      { name: 'stdDev', value: 999, unit: null },
      { name: 'stdDevWithSumSquare', value: 999, unit: null },
    ];
  };
}

addButtonToToolbar({
  title: 'Customize text',
  onClick: () => {
    const toolgroup = ToolGroupManager.getToolGroup('STACK_TOOL_GROUP_ID');

    //Here we are setting the new configuration to the tools we want to update
    //But we can do it also when adding the tool into the toolgroup
    toolgroup.setToolConfiguration(LengthTool.toolName, {
      getTextLines: getTextLinesLength,
    });

    toolgroup.setToolConfiguration(ProbeTool.toolName, {
      getTextLines: getTextLinesProbe,
    });

    toolgroup.setToolConfiguration(RectangleROITool.toolName, {
      getTextLines: getTextLinesRectangle,
      statsCalculator: newStatsCalculator,
    });

    toolgroup.setToolConfiguration(EllipticalROITool.toolName, {
      getTextLines: getTextLinesRectangle,
      statsCalculator: newStatsCalculator,
    });

    toolgroup.setToolConfiguration(CircleROITool.toolName, {
      getTextLines: getTextLinesRectangle,
      statsCalculator: newStatsCalculator,
    });

    toolgroup.setToolConfiguration(BidirectionalTool.toolName, {
      getTextLines: getTextLinesLength,
    });

    toolgroup.setToolConfiguration(AngleTool.toolName, {
      getTextLines: getTextLinesAngle,
    });

    toolgroup.setToolConfiguration(CobbAngleTool.toolName, {
      getTextLines: getTextLinesAngle,
    });

    toolgroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
      getTextLines: getTextLinesRectangle,
      statsCalculator: newStatsCalculator,
    });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(PlanarFreehandROITool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group (we can add specified tools configuration if wanted)
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(PlanarFreehandROITool.toolName, {
    calculateStats: true,
  });

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  // We set all the other tools passive here, this means that any state is rendered, and editable
  // But aren't actively being drawn (see the toolModes example for information)
  toolGroup.setToolPassive(ProbeTool.toolName);
  toolGroup.setToolPassive(RectangleROITool.toolName);
  toolGroup.setToolPassive(EllipticalROITool.toolName);
  toolGroup.setToolPassive(CircleROITool.toolName);
  toolGroup.setToolPassive(BidirectionalTool.toolName);
  toolGroup.setToolPassive(AngleTool.toolName);
  toolGroup.setToolPassive(CobbAngleTool.toolName);
  toolGroup.setToolPassive(ArrowAnnotateTool.toolName);
  toolGroup.setToolPassive(PlanarFreehandROITool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Define a stack containing a single image
  const stack = [imageIds[0]];

  // Set the stack on the viewport
  viewport.setStack(stack);

  // Render the image
  viewport.render();
}

run();
