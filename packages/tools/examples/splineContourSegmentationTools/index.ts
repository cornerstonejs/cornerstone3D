import type { Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';
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
  contourSegmentationToolBindings,
} from '../../../../utils/demo/helpers';
import type { Types as cstTypes } from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SplineContourSegmentationTool,

  PlanarFreehandContourSegmentationTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;
const { ViewportType } = Enums;

// Define a unique id for the volume
const toolGroupId = 'STACK_TOOLGROUP_ID';

const segmentationId = `SEGMENTATION_ID`;
const segmentIndexes = [1, 2, 3, 4, 5];
const segmentVisibilityMap = new Map();
let activeSegmentIndex = 0;

// ======== Set up page ======== //

setTitleAndDescription(
  'Spline Segmentation ROI Tool',
  'Here we demonstrate how to use spline segmentation ROI tools on a single viewport'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const viewportId = 'CT_STACK_ACQUISITION';
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

function updateActiveSegmentIndex(segmentIndex: number): void {
  activeSegmentIndex = segmentIndex;
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, segmentIndex);
}

function getSegmentsVisibilityState() {
  let segmentsVisibility = segmentVisibilityMap.get(segmentationId);

  if (!segmentsVisibility) {
    segmentsVisibility = new Array(segmentIndexes.length + 1).fill(true);
    segmentVisibilityMap.set(segmentationId, segmentsVisibility);
  }

  return segmentsVisibility;
}

function updateSegmentationConfig(config) {
  segmentation.config.style.setStyle(
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
    config
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

const Splines = {
  CatmullRomSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.CatmullRom,
  },
  LinearSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.Linear,
  },
  BSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.BSpline,
  },
};

const SplineToolNames = Object.keys(Splines);
const splineToolsNames = [...SplineToolNames];
let selectedToolName = splineToolsNames[0];

addDropdownToToolbar({
  labelText: 'Segment Index',
  options: { values: segmentIndexes, defaultValue: segmentIndexes[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    updateActiveSegmentIndex(Number(nameAsStringOrNumber));
  },
});

addDropdownToToolbar({
  options: { values: splineToolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: contourSegmentationToolBindings,
    });

    selectedToolName = <string>newSelectedToolName;
  },
});

addToggleButtonToToolbar({
  title: 'Show/Hide All Segments',
  onClick: function (toggle) {
    const segmentsVisibility = getSegmentsVisibilityState();

    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      viewportId,
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
      !toggle
    );

    segmentsVisibility.fill(!toggle);
  },
});

addButtonToToolbar({
  title: 'Show/Hide Current Segment',
  onClick: function () {
    const segmentsVisibility = getSegmentsVisibilityState();
    const visible = !segmentsVisibility[activeSegmentIndex];

    segmentation.config.visibility.setSegmentIndexVisibility(
      viewportId,
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
      activeSegmentIndex,
      visible
    );

    segmentsVisibility[activeSegmentIndex] = visible;
  },
});

addSliderToToolbar({
  id: 'outlineWidth',
  title: 'Outline Thickness',
  range: [0.1, 10],
  step: 0.1,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    updateSegmentationConfig({ outlineWidth: Number(value) });
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

addSliderToToolbar({
  id: 'outlineDash',
  title: 'Outline Dash',
  range: [0, 10],
  step: 1,
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    const outlineDash = value === '0' ? undefined : `${value},${value}`;
    updateSegmentationConfig({ outlineDash: outlineDash });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SplineContourSegmentationTool);
  cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  toolGroup.addTool(SplineContourSegmentationTool.toolName);
  toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);

  toolGroup.addToolInstance(
    'CatmullRomSplineROI',
    SplineContourSegmentationTool.toolName,
    {
      spline: {
        type: SplineContourSegmentationTool.SplineTypes.CatmullRom,
      },
    }
  );

  toolGroup.addToolInstance(
    'LinearSplineROI',
    SplineContourSegmentationTool.toolName,
    {
      spline: {
        type: SplineContourSegmentationTool.SplineTypes.Linear,
      },
    }
  );

  toolGroup.addToolInstance(
    'BSplineROI',
    SplineContourSegmentationTool.toolName,
    {
      spline: {
        type: SplineContourSegmentationTool.SplineTypes.BSpline,
      },
    }
  );

  toolGroup.setToolActive(splineToolsNames[0], {
    bindings: contourSegmentationToolBindings,
  });

  // Spline curves may be converted into freehand contours when they overlaps (append/remove)
  toolGroup.setToolPassive(PlanarFreehandContourSegmentationTool.toolName, {
    removeAllBindings: contourSegmentationToolBindings,
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element: element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Set the stack on the viewport
  stackViewport.setStack(imageIds.slice(0, 10));

  // Render the image
  renderingEngine.render();

  // Add a segmentation that will contains the contour annotations
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
        data: {
          // geometryIds may not be used anymore because it will be removed in a
          // near future but it is still initialized for backward compatibility
          geometryIds: [],
        },
      },
    },
  ]);

  // Create a segmentation representation associated to the viewportId
  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  // Store the segmentation representation that was just created

  // Make the segmentation created as the active one
  segmentation.activeSegmentation.setActiveSegmentation(
    viewportId,
    segmentationId
  );

  updateActiveSegmentIndex(1);
}

run();
