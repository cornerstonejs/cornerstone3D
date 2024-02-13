import { Enums, RenderingEngine, Types } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addSliderToToolbar,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
  createImageIdsAndCacheMetaData,
  createInfoSection,
  initDemo,
  setTitleAndDescription,
  addManipulationBindings,
  getLocalUrl,
  addVideoTime,
  addSegmentIndexDropdown,
} from '../../../../utils/demo/helpers';
import type { Types as cstTypes } from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const DEFAULT_SEGMENTATION_CONFIG = {
  fillAlpha: 0.5,
  fillAlphaInactive: 0.3,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.85,
  outlineWidthActive: 3,
  outlineWidthInactive: 2,
  outlineDashActive: undefined,
  outlineDashInactive: undefined,
};

const {
  SplineContourSegmentationTool,
  SegmentationDisplayTool,
  LivewireContourSegmentationTool,
  PlanarFreehandContourSegmentationTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;
const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define various constants for the tool definition
const toolGroupId = 'DEFAULT_TOOLGROUP_ID';

const segmentationId = `SEGMENTATION_ID`;
let segmentationRepresentationUID = '';
const segmentIndexes = [1, 2, 3, 4, 5];
const segmentVisibilityMap = new Map();

const configuredTools = new Map<string, any>();
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

configuredTools.set('CatmullRomSplineROI', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.CatmullRom,
  },
});
configuredTools.set('LinearSplineROI', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.Linear,
  },
});

configuredTools.set('BSplineROI', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: {
    splineType: SplineContourSegmentationTool.SplineTypes.BSpline,
  },
});

configuredTools.set('FreeformInterpolation', {
  baseTool: PlanarFreehandContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});
configuredTools.set('SplineInterpolation', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});
configuredTools.set('LivewireInterpolation', {
  baseTool: LivewireContourSegmentationTool.toolName,
  configuration: interpolationConfiguration,
});

// ======== Set up page ======== //

setTitleAndDescription(
  'Video Contour Segmentation Tools',
  'Here we demonstrate how to use spline and livewire segmentation ROI tools on a video viewport'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
let viewport;

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const viewportId = 'VIDEO_VIEWPORT_ID';
const element = document.createElement('div');

element.oncontextmenu = () => false;
element.style.width = size;
element.style.height = size;

viewportGrid.appendChild(element);

content.appendChild(viewportGrid);

createInfoSection(content, { ordered: true })
  .addInstruction('Select a segmentation index')
  .addInstruction('Select a spline curve type')
  .addInstruction('Draw a spline curve on the viewport')
  .addInstruction('Repeat the steps 1-3 as many times as you want')
  .addInstruction(
    'Notice that each segment index has a different color assigned to it'
  )
  .addInstruction('Change the style for the segmentation')
  .addInstruction('Confirm the style is applied properly');

function updateInputsForCurrentSegmentation() {
  // We can use any toolGroupId because they are all configured in the same way
  const segmentationConfig = getSegmentationConfig(toolGroupId);
  const contourConfig = segmentationConfig.CONTOUR;

  (document.getElementById('outlineWidthActive') as HTMLInputElement).value =
    String(
      contourConfig.outlineWidthActive ??
        DEFAULT_SEGMENTATION_CONFIG.outlineWidthActive
    );

  (document.getElementById('outlineOpacity') as HTMLInputElement).value =
    String(
      contourConfig.outlineOpacity ?? DEFAULT_SEGMENTATION_CONFIG.outlineOpacity
    );

  (document.getElementById('fillAlpha') as HTMLInputElement).value = String(
    contourConfig.fillAlpha ?? DEFAULT_SEGMENTATION_CONFIG.fillAlpha
  );
}

function getSegmentsVisibilityState() {
  let segmentsVisibility = segmentVisibilityMap.get(segmentationId);

  if (!segmentsVisibility) {
    segmentsVisibility = new Array(segmentIndexes.length + 1).fill(true);
    segmentVisibilityMap.set(segmentationId, segmentsVisibility);
  }

  return segmentsVisibility;
}

function getSegmentationConfig(
  toolGroupdId: string
): cstTypes.RepresentationConfig {
  const segmentationConfig =
    segmentation.config.getSegmentationRepresentationSpecificConfig(
      toolGroupdId,
      segmentationRepresentationUID
    ) ?? {};

  // Add CONTOUR object because getSegmentationRepresentationSpecificConfig
  // can return an empty object
  if (!segmentationConfig.CONTOUR) {
    segmentationConfig.CONTOUR = {};
  }

  return segmentationConfig;
}

function updateSegmentationConfig(config) {
  const segmentationConfig = getSegmentationConfig(toolGroupId);

  Object.assign(segmentationConfig.CONTOUR, config);

  segmentation.config.setSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    segmentationConfig
  );
}

// ============================= //

const cancelDrawingEventListener = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

element.addEventListener(
  csToolsEnums.Events.KEY_DOWN,
  cancelDrawingEventListener
);

addSegmentIndexDropdown(segmentationId);

const toolNames = [
  PlanarFreehandContourSegmentationTool.toolName,
  LivewireContourSegmentationTool.toolName,
  ...configuredTools.keys(),
];
let selectedToolName = toolNames[0];

addDropdownToToolbar({
  options: { values: toolNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName, { removeAllBindings: true });

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
        {
          mouseButton: MouseBindings.Primary, // Shift + Left Click
          modifierKey: KeyboardBindings.Shift,
        },
      ],
    });

    selectedToolName = <string>newSelectedToolName;
  },
});

addToggleButtonToToolbar({
  title: 'Show/Hide All Segments',
  onClick: function (toggle) {
    const segmentsVisibility = getSegmentsVisibilityState();

    segmentation.config.visibility.setSegmentationVisibility(
      toolGroupId,
      segmentationRepresentationUID,
      !toggle
    );

    segmentsVisibility.fill(!toggle);
  },
});

addButtonToToolbar({
  title: 'Show/Hide Current Segment',
  onClick: function () {
    const segmentsVisibility = getSegmentsVisibilityState();
    const { segmentIndex: activeSegmentIndex } = addSegmentIndexDropdown;
    const visible = !segmentsVisibility[activeSegmentIndex];

    segmentation.config.visibility.setSegmentVisibility(
      toolGroupId,
      segmentationRepresentationUID,
      activeSegmentIndex,
      visible
    );

    segmentsVisibility[activeSegmentIndex] = visible;
  },
});

addSliderToToolbar({
  id: 'outlineWidthActive',
  title: 'Outline Thickness',
  range: [0.1, 10],
  step: 0.1,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    updateSegmentationConfig({ outlineWidthActive: Number(value) });
  },
});

addSliderToToolbar({
  id: 'outlineOpacity',
  title: 'Outline Opacity',
  range: [0, 1],
  step: 0.05,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    updateSegmentationConfig({ outlineOpacity: Number(value) });
  },
});

addSliderToToolbar({
  id: 'fillAlpha',
  title: 'Fill Alpha',
  range: [0, 1],
  step: 0.05,
  defaultValue: 0.5,
  onSelectedValueChange: (value) => {
    updateSegmentationConfig({ fillAlpha: Number(value) });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(SplineContourSegmentationTool);
  cornerstoneTools.addTool(LivewireContourSegmentationTool);
  cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(SplineContourSegmentationTool.toolName);
  toolGroup.addTool(LivewireContourSegmentationTool.toolName);
  toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);
  toolGroup.addTool(LivewireContourSegmentationTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  for (const [toolName, config] of configuredTools.entries()) {
    toolGroup.addToolInstance(toolName, config.baseTool, config.configuration);
  }

  toolGroup.setToolActive(toolNames[0], {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

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
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.VIDEO,
      element: element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);
  addVideoTime(viewportGrid, viewport);

  // Set the stack on the viewport
  await viewport.setVideo(videoId, 1);

  // Render the image
  renderingEngine.render();

  // Add a segmentation that will contains the contour annotations
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Create a segmentation representation associated to the toolGroupId
  const segmentationRepresentationUIDs =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    ]);

  // Store the segmentation representation that was just created
  [segmentationRepresentationUID] = segmentationRepresentationUIDs;

  updateInputsForCurrentSegmentation();
}

run();
