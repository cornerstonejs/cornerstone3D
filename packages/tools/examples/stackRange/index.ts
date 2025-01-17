import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, eventTarget } from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  KeyImageTool,
  VideoRedactionTool,
  LengthTool,
  ProbeTool,
  RectangleROITool,

  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { AnnotationMultiSlice } = cornerstoneTools.utilities;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings, Events: toolsEvents } = csToolsEnums;

const toolGroupId = 'STACK_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Range and Key Images Examples',
  'Show a stack viewport with controls to allow it to specify ranges and key images'
);

const content = document.getElementById('content');

// Create a selection info element
const selectionDiv = document.createElement('div');
selectionDiv.id = 'selection';
selectionDiv.style.width = '90%';
selectionDiv.style.height = '3em';
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
instructions.innerText = `Clear Frame Range clears and selected from range on playback
Click the viewer to apply a key image (range if playing, frame if still).
Annotation navigation will choose next/previous annotation in the group
Select start/remove range/end range to set the start of the range and the end range, as well as to remove the range (make the key image apply to the current frame only)
`;

content.append(instructions);
// ============================= //

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'viewportId';

let viewport;

addButtonToToolbar({
  id: 'CreateKey',
  title: 'Create Key Image',
  onClick: () => {
    KeyImageTool.createAndAddAnnotation(viewport, {
      data: { label: 'Demo Key Image' },
    });
  },
});

const toolsNames = [
  KeyImageTool.toolName,
  VideoRedactionTool.toolName,
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
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

addButtonToToolbar({
  id: 'Previous',
  title: '< Previous Annotation',
  onClick() {
    selectNextAnnotation(-1);
  },
});

addButtonToToolbar({
  id: 'Next',
  title: 'Next Annotation >',
  onClick() {
    selectNextAnnotation(1);
  },
});

addButtonToToolbar({
  id: 'Set Range [',
  title: 'Start Range',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
      AnnotationMultiSlice.setStartRange(viewport, annotation);
      viewport.render();
    }
  },
});

addButtonToToolbar({
  id: 'End Range',
  title: 'End Range',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
      AnnotationMultiSlice.setEndRange(viewport, annotation);
      viewport.render();
    }
  },
});

addButtonToToolbar({
  id: 'Select Series',
  title: 'Select Series',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
      AnnotationMultiSlice.setRange(viewport, annotation);
      viewport.render();
    }
  },
});

addButtonToToolbar({
  id: 'Select Current',
  title: 'Select Current',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
      AnnotationMultiSlice.setSingle(viewport, annotation);
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

const activeGroup = new cornerstoneTools.annotation.AnnotationGroup();

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
  const range = AnnotationMultiSlice.getFrameRangeStr(annotation);
  selectionDiv.innerHTML = `
    <b>${toolName} Annotation UID:</b>${uid} <b>Label:</b>${
    data.label || data.text
  } ${annotation.isVisible ? 'visible' : 'not visible'}<br />
    <b>Range:</b> Frames: ${range}<br />
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
  eventTarget.addEventListener(toolsEvents.ANNOTATION_ADDED, (evt) => {
    const { detail } = evt;
    activeGroup.add(detail.annotation?.annotationUID || detail.annotationUID);
  });
}

function selectNextAnnotation(direction) {
  const uid = selectedAnnotation.annotationUID;
  const nextUid =
    activeGroup.findNearby(uid, direction) ||
    activeGroup.findNearby(null, direction);
  updateAnnotationDiv(nextUid);
  if (!nextUid) {
    return;
  }
  const annotation = cornerstoneTools.annotation.state.getAnnotation(nextUid);
  if (!annotation) {
    return;
  }
  viewport.setViewReference(annotation.metadata);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  addAnnotationListeners();
  // Add annotation tools to Cornerstone3D
  cornerstoneTools.addTool(KeyImageTool);
  cornerstoneTools.addTool(VideoRedactionTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);

  // Add tools to Cornerstone3D

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // Add tools to the tool group
  toolGroup.addTool(KeyImageTool.toolName);
  toolGroup.addTool(VideoRedactionTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);

  toolGroup.setToolActive(VideoRedactionTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.ShiftAlt,
      },
    ],
  });
  toolGroup.setToolActive(KeyImageTool.toolName, {
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
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);

  toolGroup.addViewport(viewport.id, renderingEngineId);

  // Set the video on the viewport
  // Will be `<dicomwebRoot>/studies/<studyUID>/series/<seriesUID>/instances/<instanceUID>/rendered?accept=video/mp4`
  // on a compliant DICOMweb endpoint
  viewport.setStack(imageIds, 1);
}

run();
