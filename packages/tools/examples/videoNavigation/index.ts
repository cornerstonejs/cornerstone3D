import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  initDemo,
  setTitleAndDescription,
  createDisplaySets,
  getLocalUrl,
  getViewportTypeForDisplaySet,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  ZoomTool,
  VideoRedactionTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;

const toolGroupId = 'VIDEO_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Video Navigation',
  'Show a video viewport with controls to allow it to be navigated and zoom/panned'
);

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

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

addButtonToToolbar({
  id: 'previous',
  title: 'previous',
  onClick() {
    viewport.scroll(-1);
  },
});

addButtonToToolbar({
  id: 'next',
  title: 'next',
  onClick() {
    viewport.scroll(1);
  },
});

addButtonToToolbar({
  id: 'jump',
  title: 'jump to 50',
  onClick() {
    viewport.setTime(50);
  },
});

const playbackSpeeds = [
  '0',
  '0.075',
  '0.15',
  '0.25',
  '0.5',
  '0.75',
  '1',
  '2',
  '3',
  '4',
  '10',
];

const toolbar = document.getElementById('demo-toolbar');
const rateTitle = document.createElement('div');
rateTitle.style.display = 'inline';
rateTitle.innerText = 'Playback Rate:';
toolbar.appendChild(rateTitle);
addDropdownToToolbar({
  options: { values: playbackSpeeds, defaultValue: '1', id: 'frameRate' },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newPlaybackSpeed = Number(newSelectedToolNameAsStringOrNumber);
    viewport.setPlaybackRate(newPlaybackSpeed);
  },
});

const scrollSpeeds = ['1 f', '2 f', '4 f', '0.5 s', '1 s', '2 s', '4 s'];

const scrollTitle = document.createElement('div');
scrollTitle.style.display = 'inline';
scrollTitle.innerText = 'Scroll Distance:';
toolbar.appendChild(scrollTitle);

addDropdownToToolbar({
  options: { values: scrollSpeeds, defaultValue: '1 f' },
  onSelectedValueChange: (value) => {
    value = value.toString();
    const unit = value[value.length - 1];
    const newScrollSpeed = Number(value.substring(0, value.length - 2));
    viewport.setScrollSpeed(newScrollSpeed, unit);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Fetch the series metadata and split it into display sets using the default
  // split rules.
  const displaySets = await createDisplaySets({
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const [displaySet] = displaySets;
  if (!displaySet) {
    throw new Error('No display set found in series');
  }

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(VideoRedactionTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(VideoRedactionTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.setToolActive(VideoRedactionTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
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
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewport using the display set's preferred viewport type
  // instead of hard-coding ViewportType.VIDEO.
  const viewportInput = {
    viewportId,
    type: getViewportTypeForDisplaySet(displaySet),
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  viewport = <Types.IVideoViewport>renderingEngine.getViewport(viewportId);

  toolGroup.addViewport(viewport.id, renderingEngineId);

  // Drive the viewport from the display set, mirroring the GenericViewport
  // setDisplaySets API. The displaySetId is the video instance's imageId
  // (equivalent to the previous viewport.setVideo(videoId) call).
  await viewport.setDisplaySets({
    displaySetId: displaySet.instances[0].imageId,
  });

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
