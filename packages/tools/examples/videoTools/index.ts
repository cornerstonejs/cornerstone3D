import {
  RenderingEngine,
  Types,
  Enums,
  eventTarget,
  triggerEvent,
} from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
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
  StackScrollMouseWheelTool,
  StackScrollTool,
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
instructions.innerText = `Playback speed to change CINE playback speed
Scroll Distance to change amount scrolled on next/prev button or wheel
Left Drag: Up/down scroll images
Middle Click or Ctrl+Left: Pan
Shift+Left: Zoom
Right Click: Redaction
Mouse Wheel: Stack Scroll';
`;

content.append(instructions);
// ============================= //

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoViewportId';
let viewport;

addButtonToToolbar({
  id: 'play',
  title: 'pause',
  onClick() {
    viewport.togglePlayPause();

    // toggle the title
    const button = document.getElementById('play');
    if (button.innerText === 'pause') {
      button.innerText = 'play';
    } else {
      button.innerText = 'pause';
    }
  },
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
  id: 'Next',
  title: 'Next',
  onClick() {
    navigateRelative(1);
  },
});

addButtonToToolbar({
  id: 'Previous',
  title: 'Previous',
  onClick() {
    navigateRelative(-1);
  },
});

addButtonToToolbar({
  id: 'Clear',
  title: 'Clear Range',
  onClick() {
    viewport.setRange(null);
    viewport.play();
  },
});

addButtonToToolbar({
  id: 'AddSelection',
  title: 'Add',
  onClick() {
    viewport.pause();
    if (!selectedAnnotation.annotationUID) {
      return;
    }
    const newSelection = setSelection(
      selectedAnnotation.annotationUID,
      null,
      viewport.getFrame()
    );
    updateAnnotationDiv(selectedAnnotation.annotationUID, newSelection);
    fireUpdateEvent();
  },
});

addButtonToToolbar({
  id: 'SetSelection',
  title: 'Set',
  onClick() {
    viewport.pause();
    const frame = viewport.getFrame();
    const { annotationUID, selection } = selectedAnnotation;
    if (!annotationUID) {
      return;
    }
    const newSelection = setSelection(annotationUID, selection, frame);
    updateAnnotationDiv(annotationUID, newSelection);
    fireUpdateEvent();
  },
});

addButtonToToolbar({
  id: 'Start Range',
  title: 'Start',
  onClick() {
    viewport.pause();
    const { annotationUID, selection } = selectedAnnotation;
    const range = toRange(selection);
    range[0] = viewport.getFrame();
    if (range[1] < range[0]) {
      range[1] = range[0];
    }
    const updated = setSelection(annotationUID, selection, range);
    updateAnnotationDiv(annotationUID, updated);
    fireUpdateEvent();
  },
});

addButtonToToolbar({
  id: 'End Range',
  title: 'End',
  onClick() {
    viewport.pause();
    const { annotationUID, selection } = selectedAnnotation;
    const range = toRange(selection);
    range[1] = viewport.getFrame();
    if (range[1] < range[0]) {
      range[0] = range[1];
    }
    const updated = setSelection(annotationUID, selection, range);
    updateAnnotationDiv(annotationUID, updated);
    fireUpdateEvent();
  },
});

let toggledAnnotations = true;
addButtonToToolbar({
  id: 'ToggleAnnotations',
  title: 'Toggle Annotations',
  onClick() {
    toggledAnnotations = !toggledAnnotations;
    toggleAnnotations(toggledAnnotations);
  },
});

function annotationSelectionListener(evt) {
  const { selection } = evt.detail;
  if (!selection?.length) {
    selectionDiv.innerHTML = '';
    return;
  }
  const [uid] = selection;
  updateAnnotationDiv(uid);
}

function annotationModifiedListener(evt) {
  updateAnnotationDiv(evt.detail.annotation.annotationUID);
}

const selectedAnnotation = {
  annotationUID: '',
  selection: '',
};

function toTime(selection) {
  const range = toRange(selection).map(
    (it) => Math.round(((it - 1) * 10) / viewport.fps) / 10
  );
  if (range[0] === range[1]) {
    return String(range[0]);
  }
  return toSelection(range);
}

function formatSelections(selections, chosen) {
  return selections.map((selection) => {
    if (selection === chosen) {
      return `<b>${toTime(selection)}</b>`;
    }
    return toTime(selection);
  });
}

function toggleAnnotations(toggle) {
  const toolGroup = ToolGroupManager.getToolGroupForViewport(
    viewportId,
    renderingEngineId
  );

  Object.keys(toolGroup._toolInstances).forEach((toolName) => {
    if (toggle) {
      try {
        toolGroup.setToolActive(toolName);
      } catch (e) {
        console.log(e);
      }
    } else {
      toolGroup.setToolDisabled(toolName);
    }
  });
}

function updateAnnotationDiv(uid, range) {
  let chosenSelection = toSelection(range);
  if (!chosenSelection && uid === selectedAnnotation.annotationUID) {
    // Don't update, probably don't have it.
    return;
  }
  const annotation = cornerstoneTools.annotation.state.getAnnotation(uid);
  const { metadata, data } = annotation;
  const { referencedImageId = '', toolName } = metadata;
  const selectionsString = referencedImageId.substring(
    referencedImageId.indexOf('/frames/') + 8
  );
  const selections = selectionsString.split(',');
  chosenSelection ||= selections[0];
  const selectionIndex = selections.indexOf(chosenSelection);
  selectedAnnotation.annotationUID = uid;
  selectedAnnotation.selection = selections[selectionIndex];
  selectionDiv.innerHTML = `
    <b>${toolName} Annotation UID:</b>${uid} <b>Label:</b>${
    data.label || data.text
  }<br />
    <b>Selection:</b> ${formatSelections(selections, chosenSelection)}<br />
  `;
}

function toRange(selection) {
  if (!selection) {
    return;
  }
  const range = selection.split('-').map((it) => Number(it));
  if (range.length === 1) {
    range.push(range[0]);
  }
  return range;
}

function addAnnotationListeners() {
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_SELECTION_CHANGE,
    annotationSelectionListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_MODIFIED,
    annotationModifiedListener
  );
  eventTarget.addEventListener(
    toolsEvents.ANNOTATION_COMPLETED,
    annotationModifiedListener
  );
}

function toSelection(range) {
  if (Array.isArray(range)) {
    return `${range[0]}-${range[1]}`;
  } else if (typeof range === 'number') {
    return String(range);
  }
  return range;
}

function setSelection(uid, current, range) {
  if (!uid) {
    return;
  }
  const annotation = cornerstoneTools.annotation.state.getAnnotation(uid);
  const { referencedImageId } = annotation.metadata;
  const selection = toSelection(range);

  const framesStart = referencedImageId.indexOf('/frames/') + 8;
  const existingSelection = referencedImageId.substring(framesStart).split(',');
  const currentIndex = current ? existingSelection.indexOf(current) : -1;
  const newIndex = existingSelection.indexOf(selection);
  let returnIndex = existingSelection.length;
  if (currentIndex !== -1 && (newIndex === -1 || newIndex === currentIndex)) {
    // Replace the existing index
    existingSelection[currentIndex] = selection;
    returnIndex = currentIndex;
  } else if (currentIndex !== -1) {
    // Just remove, since we already have the new index
    existingSelection.splice(currentIndex);
    returnIndex = currentIndex;
  } else if (newIndex !== -1) {
    returnIndex = newIndex;
    // No-op since it already exists, and we aren't removing anything
  } else {
    // Just add to the end
    existingSelection.push(selection);
  }
  annotation.metadata.referencedImageId =
    referencedImageId.substring(0, framesStart) + existingSelection.join(',');
  return existingSelection[returnIndex];
}

/**
 * Returns the current, next and previous annotation instances.
 */
function getRelativeAnnotation(direction = 1) {
  if (!selectedAnnotation.annotationUID) {
    return;
  }
  const annotation = cornerstoneTools.annotation.state.getAnnotation(
    selectedAnnotation.annotationUID
  );
  const { referencedImageId } = annotation.metadata;

  const framesStart = referencedImageId.indexOf('/frames/') + 8;
  const existingSelection = getRanges(annotation);
  const index =
    existingSelection.indexOf(selectedAnnotation.selection) + direction;
  if (index >= 0 && index < existingSelection.length) {
    return {
      ...selectedAnnotation,
      selection: existingSelection[index],
    };
  }
  const allAnnotations = cornerstoneTools.annotation.state.getAnnotations(
    null,
    viewport.getFrameOfReferenceUID()
  );
  const annotationUids = findAnnotationUids(allAnnotations);
  const newUid =
    annotationUids[
      (annotationUids.indexOf(selectedAnnotation.annotationUID) +
        direction +
        annotationUids.length * 2) %
        annotationUids.length
    ];
  const newAnnotation = cornerstoneTools.annotation.state.getAnnotation(newUid);
  const newRanges = getRanges(newAnnotation);
  return {
    annotationUID: newUid,
    selection: newRanges[direction < 0 ? newRanges.length - 1 : 0],
  };
}

function getRanges(annotation) {
  const { referencedImageId } = annotation.metadata;
  const framesStart = referencedImageId.indexOf('/frames/') + 8;
  return referencedImageId.substring(framesStart).split(',');
}

function findAnnotationUids(annotations) {
  const uids = [];
  for (const key in annotations) {
    annotations[key].forEach((annotation) => {
      uids.push(annotation.annotationUID);
    });
  }
  return uids;
}
function navigateRelative(direction = 1) {
  const next = getRelativeAnnotation(direction);
  if (!next) {
    return;
  }
  updateAnnotationDiv(next.annotationUID, next.selection);
  const { selection } = selectedAnnotation;
  const range = toRange(selection);
  if (range[0] < range[1]) {
    viewport.play();
  } else {
    viewport.pause();
  }
  viewport.setRange(range);
  const frame = viewport.getFrame();
  if (frame < range[0] || frame > range[1]) {
    viewport.setFrame(range[0]);
  }
}

function fireUpdateEvent(
  uid = selectedAnnotation.annotationUID,
  selection = selectedAnnotation.selection
) {
  const range = toRange(selection);
  viewport.setRange(range);
  const annotation = cornerstoneTools.annotation.state.getAnnotation(uid);

  const eventDetail = {
    annotation,
    viewportId,
    renderingEngineId,
  };
  triggerEvent(eventTarget, toolsEvents.ANNOTATION_MODIFIED, eventDetail);
  viewport.render();
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
  cornerstoneTools.addTool(StackScrollMouseWheelTool);

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
