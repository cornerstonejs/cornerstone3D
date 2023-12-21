import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
  eventTarget,
  triggerEvent,
  getEnabledElement,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { AnnotationLabelChangeEventDetail } from 'tools/src/types/EventTypes';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PlanarFreehandROITool,
  PanTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  FreehandROISculptorTool,
  ContourROITool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings, Events } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportIds = ['CT_STACK', 'CT_VOLUME_SAGITTAL'];

// ======== Set up page ======== //
setTitleAndDescription(
  'Freehand ROI Sculptor Tool',
  'Here we demonstrate how to use the Freehand ROI Sculptor Tool to sculpt freehand ROIs'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

// Disable right click context menu so we can have right click tool
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
Drawing:

PlanarFreehandROi

- Left click or click on FreeHandROI button and drag to draw a freehand annotation.
- If you join the contour together it will be closed, otherwise releasing the mouse will create an open contour (freehand line)

ContourROi

- Click on ContourROI button and drag to draw a contour
- Once draw the contour in one slice move to another slice and draw contour there. After completing contour the interpolated contour will be created in intermediate slices.
- To create the interpolated contour there should be atleast 1 or more slice differences

Editing:

PlanarFreehandROi

- Click on Sculpt button then adjustable cursor will appear.
- Nearest freehand ROI will be selected while clicking, and toolsize can be adjusted by moving cursor near to selected annotation
- Drag to sculpt freehand ROI

ContourROi

- Click on Sculpt button then adjustable cursor will appear
- Nearest freehand ROI will be selected while clicking, and toolsize can be adjusted by moving cursor near to selected annotation
- Click and drag to sculpt contour
- Check related contours are adjusted based on edited contour.

`;

content.append(instructions);

function addContourRoiToolButton(toolGroup) {
  addButtonToToolbar({
    title: 'ContourROI',
    onClick: () => {
      // shouldCalculateStats = !shouldCalculateStats;

      toolGroup.setToolActive(ContourROITool.toolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Left Click
          },
        ],
      });
      toolGroup.setToolPassive(FreehandROISculptorTool.toolName);
      toolGroup.setToolPassive(PlanarFreehandROITool.toolName);
    },
  });
}

function addFreeHandRoiToolButton(toolGroup) {
  addButtonToToolbar({
    title: 'FreeHandROI',
    onClick: () => {
      toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Left Click
          },
        ],
      });
      toolGroup.setToolPassive(FreehandROISculptorTool.toolName);
      toolGroup.setToolPassive(ContourROITool.toolName);
    },
  });
}

function addSculptingToolButton(toolGroup) {
  addButtonToToolbar({
    title: 'Sculpt',
    onClick: () => {
      toolGroup.setToolActive(FreehandROISculptorTool.toolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Left Click
          },
        ],
      });
      toolGroup.setToolPassive(ContourROITool.toolName);
      toolGroup.setToolPassive(PlanarFreehandROITool.toolName);
    },
  });
}

const toolGroupId = 'STACK_TOOL_GROUP_ID';
const dropdownOptions = ['label 1', 'label 2', 'label 3', 'label 4', 'label 5'];
const dropDownValue = dropdownOptions[0];
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(ContourROITool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(FreehandROISculptorTool);
  cornerstoneTools.addTool(PlanarFreehandROITool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(PlanarFreehandROITool.toolName, { cachedStats: true });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(FreehandROISculptorTool.toolName);
  toolGroup.addTool(ContourROITool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
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
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  // set up Freehand ROI tool button.
  addFreeHandRoiToolButton(toolGroup);

  // set up sculp tool button.
  addSculptingToolButton(toolGroup);

  // set up contour ROI tool button
  addContourRoiToolButton(toolGroup);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Define a stack containing a single image
  const smallStackImageIds = stackImageIds;

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  eventTarget.addEventListener(Events.ANNOTATION_COMPLETED, (evt) => {
    const { annotation } = evt.detail;
    if (annotation.metadata.toolName === ContourROITool.toolName) {
      annotation.data.label = dropDownValue;
      const { viewport, element } =
        getViewportDataBasedOnAnnotation(annotation);
      triggerLabelUpdateCallback({ viewport, element }, annotation);
    }
  });

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
}

function getViewportDataBasedOnAnnotation(measurementData) {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewports: Types.IViewport[] = renderingEngine.getViewports();

  let viewport = null;
  let element = null;
  if (measurementData.metadata.referencedImageId) {
    viewport = viewports[0];
    element = viewports[0].element;
  } else {
    viewport = viewports[1];
    element = viewports[1].element;
  }
  return { viewport, element };
}

function triggerLabelUpdateCallback(eventData, annotation) {
  const { element } = eventData;

  if (!element) {
    return;
  }
  const { viewportId, renderingEngineId } = getEnabledElement(element);

  const eventDetail: AnnotationLabelChangeEventDetail = {
    annotation,
    renderingEngineId,
    viewportId,
  };

  triggerEvent(eventTarget, Events.ANNOTATION_LABEL_CHANGE, eventDetail);
}

run();
