import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, volumeLoader } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addSliderToToolbar,
  addToggleButtonToToolbar,
  createInfoSection,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

let renderingEngine;

const { KeyboardBindings } = cornerstoneTools.Enums;

const {
  PlanarFreehandContourSegmentationTool,
  PanTool,
  StackScrollTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportIds = ['CT_STACK', 'CT_VOLUME_SAGITTAL'];

const segmentationId = `SEGMENTATION_ID`;
const segmentIndexes = [1, 2, 3, 4, 5];
const segmentVisibilityMap = new Map();
let activeSegmentIndex = 0;

// ======== Set up page ======== //
setTitleAndDescription(
  'Planar Freehand Contour Segmentation Tool',
  'Demonstrates how to create contour segmentations using planar freehand ROI tool'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const elements = [element1, element2];

elements.forEach((element) => {
  element.style.width = size;
  element.style.height = size;

  // Disable right click context menu so we can have right click tool
  element.oncontextmenu = (e) => e.preventDefault();

  viewportGrid.appendChild(element);
});

content.appendChild(viewportGrid);

// prettier-ignore
createInfoSection(content)
  .addInstruction('Select a segment index')
  .addInstruction('Left click and drag to draw a contour')
  .openNestedSection()
    .addInstruction(
      'Segmentation contours are closed automatically if the mouse button is released before joining the start and end points'
    )
    .addInstruction(
      'After drawing two contours that overlap for the same segment index they will:'
    )
    .openNestedSection()
      .addInstruction(
        'be merged if the first point of the second contour is inside the first contour'
      )
      .addInstruction(
        'be subtracted if the first point of the second contour is outside the first contour'
      )
      .closeNestedSection()
    .addInstruction(
      'Hold "shift" and draw a second contour inside the first contour to create a hole'
    )
    .openNestedSection()
      .addInstruction('You can release the "shift" right after adding the first point.')
      .closeNestedSection()
    .closeNestedSection()
  .addInstruction(
    'Left click and drag on the line of an existing contour or hole to edit them'
  )
  .openNestedSection()
    .addInstruction(
      'Drag the line and a preview of the edit will be displayed. Release the mouse to complete the edit.' +
      'You can cross the original contour multiple times in one drag to do a complicated edit in one movement.'
    )
  .closeNestedSection()
  .addInstruction(
    'Show/hide all or only current segment clicking on the respective buttons on the toolbar'
  )
  .addInstruction(
    'Use the sliders to change the contour style before or after drawing contours'
  );

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
  const currentConfig = segmentation.config.style.getStyle({
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Contour,
    segmentIndex: activeSegmentIndex,
  });

  const mergedConfig = { ...currentConfig, ...config };

  segmentation.config.style.setStyle(
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
      segmentIndex: activeSegmentIndex,
    },
    mergedConfig
  );
}

const cancelDrawingEventListener = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

elements.forEach((element) => {
  element.addEventListener(
    csToolsEnums.Events.KEY_DOWN,
    cancelDrawingEventListener
  );
});

const toolbar = document.getElementById('demo-toolbar');

addDropdownToToolbar({
  labelText: 'Segment Index',
  options: { values: segmentIndexes, defaultValue: segmentIndexes[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    updateActiveSegmentIndex(Number(nameAsStringOrNumber));
  },
});

addToggleButtonToToolbar({
  title: 'Show/Hide All Segments',
  onClick: function (toggle) {
    const segmentsVisibility = getSegmentsVisibilityState();

    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      viewportIds[0],
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
      !toggle
    );
    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      viewportIds[1],
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
      !toggle
    );

    segmentsVisibility.fill(!toggle);

    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Show/Hide Current Segment',
  onClick: function () {
    const segmentsVisibility = getSegmentsVisibilityState();
    const visible = !segmentsVisibility[activeSegmentIndex];

    segmentation.config.visibility.setSegmentIndexVisibility(
      viewportIds[0],
      segmentationId,
      csToolsEnums.SegmentationRepresentations.Contour,
      activeSegmentIndex,
      visible
    );
    segmentation.config.visibility.setSegmentIndexVisibility(
      viewportIds[1],
      segmentationId,
      csToolsEnums.SegmentationRepresentations.Contour,
      activeSegmentIndex,
      visible
    );

    segmentsVisibility[activeSegmentIndex] = visible;
    renderingEngine.render();
  },
});

const toggleSmoothingButtonContainer = document.createElement('span');

// Reserve some space in the toolbar because this input is added later
toolbar.appendChild(toggleSmoothingButtonContainer);

function addToggleSmoothingButton(toolGroup) {
  addToggleButtonToToolbar({
    title: 'Toggle smoothing (disabled)',
    container: toggleSmoothingButtonContainer,
    onClick: function (toggle) {
      const { toolName } = PlanarFreehandContourSegmentationTool;
      const currentConfig = toolGroup.getToolConfiguration(toolName);
      const { smoothing: currentSmoothingConfig } = currentConfig;

      this.innerText = `Toggle smoothing (${toggle ? 'enabled' : 'disabled'})`;

      toolGroup.setToolConfiguration(toolName, {
        ...currentConfig,
        smoothing: {
          ...currentSmoothingConfig,
          smoothOnAdd: toggle,
          smoothOnEdit: toggle,
        },
      });
    },
  });
}

addSliderToToolbar({
  id: 'outlineWidth',
  title: 'Segment Thickness',
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

// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName, {
    cachedStats: true,
  });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(PlanarFreehandContourSegmentationTool.toolName, {
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

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // set up toggle smoothing tool button.
  addToggleSmoothingButton(toolGroup);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a stack containing a single image
  const smallStackImageIds = [stackImageIds[0], stackImageIds[1]];

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack and a volume viewport
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: volumeImageIds,
  });

  // Get the viewports that were just created
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );
  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportIds[1])
  );

  // Set the stack on the viewport
  stackViewport.setStack(smallStackImageIds);

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  volumeViewport.setVolumes([{ volumeId }]);

  // Render the image
  renderingEngine.renderViewports(viewportIds);

  // Add a segmentation that will contains the contour annotations
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Create a segmentation representation associated to the viewportId
  await segmentation.addSegmentationRepresentations(viewportIds[0], [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);
  await segmentation.addSegmentationRepresentations(viewportIds[1], [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  updateActiveSegmentIndex(1);
}

run();
