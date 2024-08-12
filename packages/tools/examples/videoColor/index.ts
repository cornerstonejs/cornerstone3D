import { RenderingEngine, Types, Enums } from '@cornerstonejs/core';
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
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollMouseWheelTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;

const toolGroupId = 'VIDEO_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Video Color Manipulation',
  'Show a video viewport controls for color management, window level, brightness/contrast'
);

const content = document.getElementById('content');
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

const whiteValues = [
  [255, 255, 255],
  [180, 255, 255],
  [255, 180, 255],
  [255, 255, 180],
  [255, 180, 180],
  [180, 255, 180],
  [180, 180, 255],
];
let currentWhite = 0;

addButtonToToolbar({
  id: 'Color Correct',
  title: 'Color: 255,255,255',
  onClick() {
    currentWhite = (1 + currentWhite) % whiteValues.length;
    const white = whiteValues[currentWhite];
    viewport.setAverageWhite(white);
    document.getElementById('Color Correct').innerText = `Color: ${white.join(
      ','
    )}`;
  },
});

/**
 * One possible average white function showing how the imageData is used
 * to get average white information.
 */
function getAverageWhite(scalarData) {
  const maxValues = [0, 0, 0];
  for (let i = 0; i < scalarData.length; i += 4) {
    const r = scalarData[i];
    const g = scalarData[i + 1];
    const b = scalarData[i + 2];
    maxValues[0] = Math.max(r, maxValues[0]);
    maxValues[1] = Math.max(g, maxValues[1]);
    maxValues[2] = Math.max(b, maxValues[2]);
  }
  return maxValues;
}

addButtonToToolbar({
  id: 'Avg Color Correct',
  title: 'Avg Color Correct',
  onClick() {
    const white = getAverageWhite(
      viewport.getImageData().imageData.
    );
    console.log('White=', white);
    viewport.setAverageWhite(white);
    document.getElementById(
      'Color Correct'
    ).innerText = `Avg Color: ${white.join(',')}`;
    currentWhite = -1;
  },
});

const wl = (windowWidth, windowCenter) => ({ windowWidth, windowCenter });
const windowLevels = [
  wl(256, 128),
  wl(255, 127.5),
  wl(192, 96),
  wl(192, 128),
  wl(192, 160),
];

const toolbar = document.getElementById('demo-toolbar');
const windowLevelNames = windowLevels.map(
  ({ windowWidth, windowCenter }) => `W:${windowWidth}/C:${windowCenter}`
);
addDropdownToToolbar({
  options: {
    values: windowLevelNames,
    defaultValue: windowLevelNames[0],
    id: 'windowLevel',
  },
  onSelectedValueChange: (newWLText) => {
    const index = windowLevelNames.indexOf(newWLText) % windowLevels.length;
    const newWL = windowLevels[index];
    viewport.setWindowLevel(newWL.windowWidth, newWL.windowCenter);
  },
});

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

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(StackScrollTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Right Click
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
