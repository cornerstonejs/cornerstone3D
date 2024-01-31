import { RenderingEngine, Types, Enums } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  addCheckboxToToolbar,
  getLocalUrl,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const DEFAULT_SPLINE_RESOLUTION = 20;
const DEFAULT_CARDINAL_SCALE = 0.5;

const {
  SplineROITool,
  LivewireContourTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'VIDEO_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Video Spline Tools Stack',
  'Spline tools for a video viewport with some settings that can be changed such ' +
    'as resolution, scale (Cardinal Splines only) and it is also possible to ' +
    'enable/disable the preview when adding a control point to a spline'
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

function addInstruction(text) {
  const instructions = document.createElement('p');
  instructions.innerText = `- ${text}`;
  info.appendChild(instructions);
}

addInstruction('Select a Spline ROI.');
addInstruction('Click to add control points and draw the spline.');
addInstruction(
  'A spline can be closed clicking on the first control point or ' +
    'double clicking when adding the last control point.'
);
addInstruction('Click and drag the control points to update the spline.');
addInstruction(
  'Shift+click allow adding new control points once the spline is closed.'
);
addInstruction(
  'Ctrl+click allow deleting control points once the spline is closed.'
);
addInstruction(
  'Use the "Resolution" slider to change the spline resolution (number of ' +
    'line segments). Resolution is not applicable to Linear spline.'
);
addInstruction(
  'User the "Scale" slider to change the Cardinal spline scale. ' +
    'A Catmull-Rom spline is a Cardinal spline with scale set to 50% and ' +
    'Linear spline is a Cardinal spline with scale set to 0%.'
);
addInstruction(
  'It is not allowed to add/removed control points to/from ' +
    'BSpline once it is closed.'
);
addInstruction(
  'Press Backspace or Delete to delete the last control point when drawing'
);

// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const cancelToolDrawing = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
  cancelToolDrawing(evt);
});

const Splines = {
  CardinalSplineROI: {
    splineType: SplineROITool.SplineTypes.Cardinal,
  },
  CatmullRomSplineROI: {
    splineType: SplineROITool.SplineTypes.CatmullRom,
  },
  LinearSplineROI: {
    splineType: SplineROITool.SplineTypes.Linear,
  },
  BSplineROI: {
    splineType: SplineROITool.SplineTypes.BSpline,
  },
};

const SplineToolNames = Object.keys(Splines);
const toolsNames = [...SplineToolNames, LivewireContourTool.toolName];
let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });

    selectedToolName = <string>newSelectedToolName;

    const resolutionSlider = document.getElementById(
      'splineResolution'
    ) as HTMLInputElement;

    const scaleSlider = document.getElementById(
      'splineScale'
    ) as HTMLInputElement;

    resolutionSlider.disabled = selectedToolName === 'LinearSplineROI';
    scaleSlider.disabled = selectedToolName !== 'CardinalSplineROI';
  },
});

addCheckboxToToolbar({
  title: 'Preview',
  checked: true,
  onChange: (drawPreviewEnabled) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    SplineToolNames.forEach((splineToolName) => {
      const splineConfig = toolGroup.getToolConfiguration(
        splineToolName,
        'spline'
      );
      splineConfig.drawPreviewEnabled = drawPreviewEnabled;
      toolGroup.setToolConfiguration(splineToolName, { spline: splineConfig });
    });
  },
});

addSliderToToolbar({
  id: 'splineResolution',
  title: 'Resolution',
  range: [0, 32],
  step: 1,
  defaultValue: DEFAULT_SPLINE_RESOLUTION,
  onSelectedValueChange: (value: string) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    SplineToolNames.forEach((splineToolName) => {
      const { splineType } = Splines[selectedToolName];
      const splineConfig = toolGroup.getToolConfiguration(
        splineToolName,
        'spline'
      );

      splineConfig.configuration[splineType].resolution = value;
      toolGroup.setToolConfiguration(splineToolName, { spline: splineConfig });
    });
  },
});

addSliderToToolbar({
  id: 'splineScale',
  title: 'Scale',
  range: [0, 1],
  step: 0.1,
  defaultValue: DEFAULT_CARDINAL_SCALE,
  onSelectedValueChange: (value: string) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const splineToolName = 'CardinalSplineROI';

    const splineConfig = toolGroup.getToolConfiguration(
      splineToolName,
      'spline'
    );

    splineConfig.configuration.CARDINAL.scale = value;
    toolGroup.setToolConfiguration(splineToolName, { spline: splineConfig });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SplineROITool);
  cornerstoneTools.addTool(LivewireContourTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addToolInstance('CardinalSplineROI', SplineROITool.toolName, {
    spline: {
      type: SplineROITool.SplineTypes.Cardinal,
      configuration: {
        [SplineROITool.SplineTypes.Cardinal]: {
          scale: DEFAULT_CARDINAL_SCALE,
        },
      },
    },
  });

  toolGroup.addToolInstance('CatmullRomSplineROI', SplineROITool.toolName, {
    spline: {
      type: SplineROITool.SplineTypes.CatmullRom,
    },
  });

  toolGroup.addToolInstance('LinearSplineROI', SplineROITool.toolName, {
    spline: {
      type: SplineROITool.SplineTypes.Linear,
    },
  });

  toolGroup.addToolInstance('BSplineROI', SplineROITool.toolName, {
    spline: {
      type: SplineROITool.SplineTypes.BSpline,
    },
  });

  toolGroup.addTool(LivewireContourTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(toolsNames[0], {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  addManipulationBindings(toolGroup);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
    wadoRsRoot:
      getLocalUrl() || 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Only one SOP instances is DICOM, so find it
  const videoId = imageIds.find(
    (it) => it.indexOf('2.25.179478223177027022014772769075050874231') !== -1
  );

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.VIDEO,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IVideoViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Set the stack on the viewport
  await viewport.setVideo(videoId, 25);
  viewport.play();
}

run();
