import {
  RenderingEngine,
  Types,
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  addToggleButtonToToolbar,
  addDropdownToToolbar,
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  addManipulationBindings,
  addVideoTime,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  KeyImageTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  CobbAngleTool,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  LivewireContourTool,

  VideoRedactionTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings, Events: toolsEvents } = csToolsEnums;

const toolGroupId = 'VIDEO_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Basic Video Tools',
  'Show a video viewport with controls to allow it to be navigated and zoom/panned'
);

const content = document.getElementById('content');

// Create a selection info element
const selectionDiv = document.createElement('div');
selectionDiv.id = 'selection';
selectionDiv.style.width = '90%';
selectionDiv.style.height = '1.5em';
content.appendChild(selectionDiv);

// ************* Create the cornerstone element.
const element = document.createElement('div');
// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText = `Play/Pause button will toggle the playing of video
Clear Frame Range clears and selected from range on playback
Select annotation drop down chooses the tool to use
Annotation navigation will choose next/previous annotation in the group
Clicking on the group button switches the displayed annotation group and the group annotations are added to.
The single image selector sets the annotation to apply to just the current image (shown on +/- 5 frames)
The [ and ] indicators beside that add left/right boundaries to the image to choose a range.
Delete annotation will remove an annotation
`;

content.append(instructions);
// ============================= //

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoViewportId';

let viewport;

addToggleButtonToToolbar({
  id: 'play',
  title: 'Play',
  onClick: togglePlay,
  defaultToggle: false,
});

const toolsNames = [
  LengthTool.toolName,
  KeyImageTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  CobbAngleTool.toolName,
  ArrowAnnotateTool.toolName,
  PlanarFreehandROITool.toolName,
  VideoRedactionTool.toolName,
  LivewireContourTool.toolName,
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

function togglePlay(toggle = undefined) {
  if (toggle === undefined) {
    toggle = viewport.togglePlayPause();
  } else if (toggle === true) {
    viewport.play();
  } else {
    viewport.pause();
  }
}

addButtonToToolbar({
  id: 'Delete',
  title: 'Delete Annotation',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
      cornerstoneTools.annotation.state.removeAnnotation(
        annotation.annotationUID
      );
      viewport.render();
    }
  },
});

function annotationModifiedListener(evt) {
  updateAnnotationDiv(
    evt.detail.annotation?.annotationUID ||
      evt.detail.annotationUID ||
      evt.detail.added?.[0]
  );
}

const selectedAnnotation = {
  annotationUID: '',
};

function updateAnnotationDiv(uid) {
  const annotation = cornerstoneTools.annotation.state.getAnnotation(uid);
  if (!annotation) {
    selectionDiv.innerHTML = '';
    selectedAnnotation.annotationUID = '';
    return;
  }
  selectedAnnotation.annotationUID = uid;
  const { metadata, data } = annotation;
  const { toolName } = metadata;
  selectionDiv.innerHTML = `
    <b>${toolName} Annotation UID:</b>${uid} <b>Label:</b>${
    data.label || data.text
  } ${annotation.isVisible ? 'visible' : 'not visible'}
  `;
}

function getActiveAnnotation() {
  return cornerstoneTools.annotation.state.getAnnotation(
    selectedAnnotation.annotationUID
  );
}

function addAnnotationListeners() {
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_SELECTION_CHANGE,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_MODIFIED,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_COMPLETED,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_REMOVED,
    annotationModifiedListener
  );
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

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

  addAnnotationListeners();

  // Add annotation tools to Cornerstone3D
  cornerstoneTools.addTool(KeyImageTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(PlanarFreehandROITool);
  cornerstoneTools.addTool(VideoRedactionTool);
  cornerstoneTools.addTool(LivewireContourTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // Add tools to the tool group
  toolGroup.addTool(KeyImageTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(PlanarFreehandROITool.toolName);
  toolGroup.addTool(VideoRedactionTool.toolName);
  toolGroup.addTool(LivewireContourTool.toolName);

  toolGroup.setToolActive(KeyImageTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.ShiftAlt,
      },
    ],
  });
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Middle Click
      },
    ],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM

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

  // Get the stack viewport that was created
  viewport = <Types.IVideoViewport>renderingEngine.getViewport(viewportId);

  toolGroup.addViewport(viewport.id, renderingEngineId);

  // Set the video on the viewport
  // Will be `<dicomwebRoot>/studies/<studyUID>/series/<seriesUID>/instances/<instanceUID>/rendered?accept=video/mp4`
  // on a compliant DICOMweb endpoint
  await viewport.setVideo(videoId, 1);
  addVideoTime(element, viewport);
}

run();
