import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, eventTarget } from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  HeightTool,
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

  PanTool,
  ZoomTool,
  VideoRedactionTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { AnnotationMultiSelect } = cornerstoneTools.utilities;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings, Events: toolsEvents } = csToolsEnums;

const toolGroupId = 'VIDEO_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Grouping Tools',
  'Show a video viewport with controls to allow it to be grouped and ranged'
);

const content = document.getElementById('content');

// Create a selection info element
const selectionDiv = document.createElement('div');
selectionDiv.id = 'selection';
selectionDiv.style.width = '90%';
selectionDiv.style.height = '3em';
content.appendChild(selectionDiv);

// Create two groupings of items
const group1 = new cornerstoneTools.annotation.AnnotationGroup();

const group2 = new cornerstoneTools.annotation.AnnotationGroup();

// ************* Create the cornerstone element.
const element = document.createElement('div');
// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const rangeDiv = document.createElement('div');
rangeDiv.innerHTML =
  '<div id="time" style="float:left;width:2.5em;">0 s</div><input id="range" style="width:400px;height:8px;float: left" value="0" type="range" /><div id="remaining">unknown</div>';
content.appendChild(rangeDiv);
const rangeElement = document.getElementById('range') as HTMLInputElement;
rangeElement.onchange = () => {
  viewport.setTime(Number(rangeElement.value));
};
rangeElement.oninput = () => {
  viewport.setTime(Number(rangeElement.value));
};

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
const baseEventDetail = {
  viewportId,
  renderingEngineId,
};

let viewport;

const playButton = addButtonToToolbar({
  id: 'play',
  title: 'Pause',
  onClick: (evt) => togglePlay(),
});

addButtonToToolbar({
  id: 'Clear',
  title: 'Clear Frame Range',
  onClick() {
    viewport.setFrameRange(null);
    viewport.play();
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

let activeGroup = group1;

const groupButton = addButtonToToolbar({
  id: 'Group',
  title: 'Group 1',
  onClick() {
    activeGroup.setVisible(false, baseEventDetail);
    activeGroup = activeGroup === group1 ? group2 : group1;
    groupButton.innerText = activeGroup === group1 ? 'Group 1' : 'Group 2';
    activeGroup.setVisible(true, baseEventDetail);
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
  playButton.innerText = toggle ? 'Play' : 'Pause';
}

addButtonToToolbar({
  id: 'Set Range [',
  title: 'Start Range',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
      const rangeSelection = AnnotationMultiSelect.getFrameRange(annotation);
      const frame = viewport.getFrameNumber();
      const range = Array.isArray(rangeSelection)
        ? rangeSelection
        : [rangeSelection, viewport.numberOfFrames];
      range[0] = frame;
      range[1] = Math.max(frame, range[1]);
      AnnotationMultiSelect.setFrameRange(
        annotation,
        range as [number, number],
        baseEventDetail
      );
      viewport.setFrameRange(range);
      viewport.render();
    }
  },
});

addButtonToToolbar({
  id: 'Set Current',
  title: 'Current Image',
  onClick() {
    const annotation = getActiveAnnotation();
    if (annotation) {
      togglePlay(false);
      AnnotationMultiSelect.setFrameRange(
        annotation,
        viewport.getFrameNumber(),
        baseEventDetail
      );
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
      const rangeSelection = AnnotationMultiSelect.getFrameRange(annotation);
      const frame = viewport.getFrameNumber();
      const range = Array.isArray(rangeSelection)
        ? rangeSelection
        : [rangeSelection, viewport.getNumberOfSlices()];
      range[1] = frame;
      range[0] = Math.min(frame, range[0]);
      AnnotationMultiSelect.setFrameRange(
        annotation,
        range as [number, number],
        baseEventDetail
      );
      viewport.setFrameRange(range);
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
  const range = AnnotationMultiSelect.getFrameRange(annotation);
  const rangeArr = Array.isArray(range) ? range : [range];
  const { fps } = viewport;
  selectionDiv.innerHTML = `
    <b>${toolName} Annotation UID:</b>${uid} <b>Label:</b>${
    data.label || data.text
  } ${annotation.isVisible ? 'visible' : 'not visible'}<br />
    <b>Range:</b> ${rangeArr.join('-')} Time ${rangeArr
    .map((it) => Math.round((it * 10) / fps) / 10)
    .join('-')} Groups: ${group1.has(uid) ? '1' : ''} ${
    group2.has(uid) ? '2' : ''
  }<br />
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
  const range = AnnotationMultiSelect.getFrameRange(annotation);
  if (Array.isArray(range)) {
    viewport.setFrameRange(range);
    togglePlay(true);
    viewport.setFrameNumber(range[0]);
  } else {
    viewport.setFrameRange(null);
    togglePlay(false);
    viewport.setFrameNumber(range);
  }
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
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Only one SOP instances is DICOM, so find it
  const videoId = imageIds.find(
    (it) => it.indexOf('2.25.179478223177027022014772769075050874231') !== -1
  );

  addAnnotationListeners();

  // Add annotation tools to Cornerstone3D
  cornerstoneTools.addTool(KeyImageTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(HeightTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(PlanarFreehandROITool);

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(VideoRedactionTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(HeightTool.toolName);
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
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(VideoRedactionTool.toolName);

  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

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
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.ShiftCtrl,
      },
    ],
  });
  toolGroup.setToolActive(HeightTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.ShiftCtrl,
      },
    ],
  });
  toolGroup.setToolActive(VideoRedactionTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Middle Click
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
      {
        mouseButton: MouseBindings.Primary, // Ctrl Left drag
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Shift Left Click
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Alt,
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
  await viewport.setVideo(videoId, 25);

  viewport.play();

  const seconds = (time) => `${Math.round(time * 10) / 10} s`;

  element.addEventListener(Enums.Events.IMAGE_RENDERED, (evt: any) => {
    const { time, duration } = evt.detail;
    rangeElement.value = time;
    rangeElement.max = duration;
    const timeElement = document.getElementById('time');
    timeElement.innerText = seconds(time);
    const remainingElement = document.getElementById('remaining');
    remainingElement.innerText = seconds(duration - time);
  });
}

run();
