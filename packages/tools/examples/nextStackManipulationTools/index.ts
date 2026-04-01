import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  eventTarget,
  RenderingEngine,
  Enums,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { KeyboardBindings } from '../../src/enums';
import { StackScrollOutOfBoundsEvent } from 'core/src/types/EventTypes';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  PlanarRotateTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const toolGroupId = 'STACK_TOOL_GROUP_ID';
const dataId = 'stack-manipulation-tools-next:primary';
const stackRenderMode = getBooleanUrlParam('cpu') ? 'cpu2d' : 'vtkImage';
const leftClickTools = [
  WindowLevelTool.toolName,
  PlanarRotateTool.toolName,
  StackScrollTool.toolName,
];
const defaultLeftClickTool = leftClickTools[0];
let currentLeftClickTool = leftClickTools[0];

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'Basic Stack Manipulation',
  'Manipulation tools for a stack viewport'
);

const content = document.getElementById('content');
const element = document.createElement('div');

element.oncontextmenu = (e) => e.preventDefault();
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText =
  'Middle Click: Pan\nRight Click: Zoom\n Mouse Wheel: Stack Scroll\n Shift or Primary + Wheel: Planar Rotate';

content.append(instructions);

addDropdownToToolbar({
  options: {
    values: leftClickTools,
    defaultValue: defaultLeftClickTool,
  },
  onSelectedValueChange: (selectedValue) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    toolGroup.setToolPassive(currentLeftClickTool);
    toolGroup.setToolActive(selectedValue as string, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });

    currentLeftClickTool = selectedValue;
  },
});

const lastEvents = [];
const lastEventsDiv = document.createElement('div');

content.appendChild(lastEventsDiv);

function updateLastEvents(number, eventName, detail) {
  if (lastEvents.length > 4) {
    lastEvents.pop();
  }

  lastEvents.unshift({ number, eventName, detail });
  lastEventsDiv.innerHTML = '';

  lastEvents.forEach((eventInfo) => {
    const eventElement = document.createElement('p');

    eventElement.style.border = '1px solid black';
    eventElement.innerText =
      eventInfo.number + ' ' + eventInfo.eventName + '\n\n' + eventInfo.detail;

    lastEventsDiv.appendChild(eventElement);
  });
}

let eventNumber = 1;

const { STACK_SCROLL_OUT_OF_BOUNDS } = Enums.Events;

eventTarget.addEventListener(STACK_SCROLL_OUT_OF_BOUNDS, ((
  evt: StackScrollOutOfBoundsEvent
) => {
  updateLastEvents(
    eventNumber,
    STACK_SCROLL_OUT_OF_BOUNDS,
    JSON.stringify(evt.detail)
  );
  eventNumber++;
}) as EventListener);

async function run() {
  await initDemo();

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PlanarRotateTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName, { loop: false });
  toolGroup.addTool(PlanarRotateTool.toolName);

  toolGroup.setToolActive(defaultLeftClickTool, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });
  toolGroup.setToolActive(PlanarRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
        modifierKey: KeyboardBindings.Shift,
      },
      {
        mouseButton: MouseBindings.Wheel_Primary,
      },
    ],
  });

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportId = 'CT_STACK';
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_V2,
    element,
    defaultOptions: {
      background: getNextExampleBackground(),
      renderMode: stackRenderMode,
    },
  });

  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport = renderingEngine.getViewport(viewportId) as PlanarViewport;

  utilities.viewportNextDataSetMetadataProvider.add(dataId, {
    kind: 'planar',
    imageIds,
  });

  await viewport.setDataList([
    {
      dataId,
      options: {
        renderMode: stackRenderMode,
      },
    },
  ]);

  cornerstoneTools.utilities.stackPrefetch.enable(viewport.element);
  viewport.render();
}

run();
