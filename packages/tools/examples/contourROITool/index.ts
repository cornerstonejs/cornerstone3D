import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
  eventTarget,
  getEnabledElement,
  triggerEvent,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import ContourROITool from '../../src/tools/annotation/ContourROITool';
import { Events } from '../../src/enums';
import { AnnotationLabelChangeEventDetail } from '../../src/types/EventTypes';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  annotation,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const { selection } = annotation;
const defaultFrameOfReferenceSpecificAnnotationManager =
  annotation.state.getAnnotationManager();

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportIds = ['CT_STACK', 'CT_VOLUME_SAGITTAL'];

// ======== Set up page ======== //
setTitleAndDescription(
  'Contour Freehand Annotation Tool',
  'Here we demonstrate how to use the Contour Freehand Annotation Tool to draw 2D open and closed ROIs'
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

- Left click and drag to draw a contour.
- The default label will be assigned or you can select any label from label list (dropdown).
- Draw a contour in one slice and move to another slice (skip some slice in between) and draw contour there. After drawing the second contour, the interpolated contours will be created in intermediate slices.
- To create the interpolated contour there should be atleast 1 or more slices in between manually drawn contours and the contours should be assigned with same label.
- Interpolated contours will not be created if more than one contour with same label is on a single slice.

--- Example:
-- 1) draw the contour in slice 1
-- 2) draw another contour in slice 5 with same label drawn in slice 1.
-- 3) check interpolated contours are created in intermediate slices.

Editing:
- Left click and drag on the line of an existing contour to edit it.
- Check related contours are adjusted based on the edited contour. If you are editing the interpolated contour then that contour will be considered as manually drawn.

Deleting:
- When manuallay drawn contour is deleted, then it will delete other interpolated contours connected to this contour.
- If the deleted the contour is in between two slices having manually drawn contours with same label, interpolated contours will be regenerated to connect those contours.
`;

content.append(instructions);

let shouldInterpolate = false;
function addToggleInterpolationButton(toolGroup) {
  addButtonToToolbar({
    title: 'Toggle interpolation',
    onClick: () => {
      shouldInterpolate = !shouldInterpolate;

      toolGroup.setToolConfiguration(ContourROITool.toolName, {
        interpolation: {
          enabled: shouldInterpolate,
        },
      });
    },
  });
}

let shouldCalculateStats = false;
function addToggleCalculateStatsButton(toolGroup) {
  addButtonToToolbar({
    title: 'Toggle calculate stats',
    onClick: () => {
      shouldCalculateStats = !shouldCalculateStats;
      toolGroup.setToolConfiguration(ContourROITool.toolName, {
        calculateStats: shouldCalculateStats,
      });
    },
  });
}

function addContourDeleteButton(toolGroup) {
  addButtonToToolbar({
    title: 'Delete Contour',
    onClick: () => {
      const annotationData =
        annotation.state.getAnnotation(selectedAnnotationId);
      if (!selectedAnnotationId || !annotationData) {
        alert('Please select any Contour ROI');
        return;
      }
      toolGroup.setToolConfiguration(ContourROITool.toolName, {});
      cornerstoneTools.annotation.state.removeAnnotation(
        annotationData.annotationUID
      );
    },
  });
}

const dropdownOptions = ['label 1', 'label 2', 'label 3', 'label 4', 'label 5'];
let dropDownValue = dropdownOptions[0];

function onSelectedValueChange(value) {
  dropDownValue = value;
  const annotationData = annotation.state.getAnnotation(selectedAnnotationId);
  if (!selectedAnnotationId || !annotationData) {
    alert('Please select any Contour ROI');
    return;
  }
  annotationData.data.label = dropDownValue;
  const { viewport, element } =
    getViewportDataBasedOnAnnotation(annotationData);
  triggerLabelUpdateCallback({ viewport, element }, annotationData);
}

function setDropDownTollbar() {
  addDropdownToToolbar({
    labelText: 'Labels',
    options: {
      values: dropdownOptions,
      defaultValue: dropDownValue,
    },
    onSelectedValueChange: onSelectedValueChange,
  });
}
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';
let selectedAnnotationId = '';

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

  // annotations.config.styles.setAnnotationToolStyle(annotationUID, style);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(ContourROITool.toolName, { cachedStats: true });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(ContourROITool.toolName, {
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

  // set up toggle interpolation tool button.
  addToggleInterpolationButton(toolGroup);

  // set up toggle calculate stats tool button.
  addToggleCalculateStatsButton(toolGroup);

  // delete button for contour ROI
  addContourDeleteButton(toolGroup);

  // set up the labels
  setDropDownTollbar(toolGroup);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Define a stack containing a single image
  const smallStackImageIds = stackImageIds.slice(0, 10);

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
    annotation.data.label = dropDownValue;
    const { viewport, element } = getViewportDataBasedOnAnnotation(annotation);
    triggerLabelUpdateCallback({ viewport, element }, annotation);
  });

  eventTarget.addEventListener(Events.ANNOTATION_SELECTION_CHANGE, (evt) => {
    const { selection } = evt.detail;
    selectedAnnotationId = selection[0];
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
    imageIds: smallStackImageIds,
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

function getViewportDataBasedOnAnnotation(annotationData) {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewports: Types.IViewport[] = renderingEngine.getViewports();

  let viewport = null;
  let element = null;
  if (annotationData.metadata.referencedImageId) {
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
