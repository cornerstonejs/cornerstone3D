import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  volumeLoader,
  viewportProjection,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import { ctPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  PanTool,
  ZoomTool,
  ToolGroupManager,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_VOLUME';
const displaySetId = 'volumePosition:ct';
const toolGroupId = 'VOLUME_POSITION_TOOL_GROUP';
const volumeName = 'CT_VOLUME_POSITION_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;

let viewport: PlanarViewport;
let displayArea: unknown = 'none';

setTitleAndDescription(
  'Volume Position',
  'Demonstrates how to use the display area with a sagittal CT volume viewport.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '1000px';
element.style.height = '512px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const displayAreaInfo = document.createElement('div');
info.appendChild(displayAreaInfo);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, () => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  if (!viewport) {
    return;
  }

  const { flipHorizontal = false } = viewport.getViewState();
  const { rotation = 0 } =
    viewportProjection.getPresentation(viewport, {
      selector: { rotation: true },
    }) ?? {};

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  displayAreaInfo.innerText = `DisplayArea: ${JSON.stringify(displayArea)}`;
});

function createDisplayArea(
  size,
  pointValue,
  canvasValue = pointValue,
  rotation = 0,
  flipHorizontal = false
) {
  const imagePoint = Array.isArray(pointValue)
    ? pointValue
    : [pointValue, pointValue];
  const canvasPoint = Array.isArray(canvasValue)
    ? canvasValue
    : [canvasValue, canvasValue];

  return {
    rotation,
    flipHorizontal,
    displayArea: {
      imageArea: Array.isArray(size) ? size : [size, size],
      imageCanvasPoint: {
        imagePoint,
        canvasPoint,
      },
    },
  };
}

const displayAreas = new Map();
displayAreas.set('Center Full', createDisplayArea(1, 0.5));
displayAreas.set('Center with border', createDisplayArea(1.1, 0.5));
displayAreas.set('Center Half', createDisplayArea(2, 0.5));
displayAreas.set('Left Top', createDisplayArea(1, 0));
displayAreas.set('Right Top', createDisplayArea(1, [1, 0]));
displayAreas.set('Center Left/Top', createDisplayArea(2, 0, 0.5));
displayAreas.set('Center Right/Bottom', createDisplayArea(2, 1, 0.5));
displayAreas.set('Left Bottom', createDisplayArea(1, [0, 1]));
displayAreas.set('Right Bottom', createDisplayArea(1, [1, 1]));
displayAreas.set(
  'Left Top Half 2, 0.1',
  createDisplayArea([2, 0.1], 0, undefined)
);
displayAreas.set(
  'Left Top Half 0.1, 2',
  createDisplayArea([0.1, 2], 0, undefined)
);
displayAreas.set('Left Top Half 2,2', createDisplayArea(2, 0, undefined));
displayAreas.set('Right Top Half', createDisplayArea([0.1, 2], [1, 0]));
displayAreas.set('Left Bottom Half', createDisplayArea(2, [0, 1]));
displayAreas.set('Right Bottom Half', createDisplayArea(2, [1, 1]));
displayAreas.set(
  '90 Left Top Half',
  createDisplayArea([2, 0.1], 0, undefined, 90, false)
);
displayAreas.set(
  '180 Right Top Half',
  createDisplayArea([0.1, 2], [1, 0], undefined, 180, false)
);
displayAreas.set(
  'Flip Left Bottom Half',
  createDisplayArea(2, [0, 1], undefined, 0, true)
);
displayAreas.set(
  'Flip 180 Right Bottom Half',
  createDisplayArea(2, [1, 1], undefined, 180, true)
);

addDropdownToToolbar({
  options: {
    values: [...displayAreas.keys()],
    defaultValue: displayAreas.keys().next().value,
  },
  onSelectedValueChange: (name) => {
    displayArea = displayAreas.get(name);
    const {
      flipHorizontal,
      rotation,
      displayArea: area,
    } = displayArea as {
      flipHorizontal: boolean;
      rotation: number;
      displayArea: Types.DisplayArea;
    };

    viewport.setDisplayArea(area);
    viewport.setViewState({ flipHorizontal });

    const viewState = viewportProjection.withPresentation(viewport, {
      rotation,
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Flip H',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    const { flipHorizontal = false } = viewport.getViewState();

    viewport.setViewState({ flipHorizontal: !flipHorizontal });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Delta 30',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    const { rotation = 0 } =
      viewportProjection.getPresentation(viewport, {
        selector: { rotation: true },
      }) ?? {};
    const viewState = viewportProjection.withPresentation(viewport, {
      rotation: rotation + 30,
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.resetViewState();
    viewport.resetDisplaySetPresentation(displaySetId);
    viewport.setOrientation(Enums.OrientationAxis.SAGITTAL);
    viewport.render();
  },
});

function initializeTools() {
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
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

  return toolGroup;
}

function addDisplayAreaGuides() {
  const svgNode = document.getElementsByClassName('svg-layer').item(0);
  const parentNode = svgNode?.parentNode;

  if (!parentNode) {
    return;
  }

  const divNode = document.createElement('div');
  divNode.setAttribute(
    'style',
    'left:25%; top: 25%; width:25%; height:25%; border: 1px solid green; position: absolute'
  );
  parentNode.insertBefore(divNode, svgNode.nextSibling);

  const div2Node = document.createElement('div');
  div2Node.setAttribute(
    'style',
    'left: 50%; top: 50%; width:25%; height:25%; border: 1px solid red; position: absolute'
  );
  parentNode.insertBefore(div2Node, divNode.nextSibling);
}

async function run() {
  await initDemo();

  const toolGroup = initializeTools();
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: [0.8, 0, 0.8] as Types.Point3,
    },
  });

  viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();

  displaySetRegistry.add(displaySetId, {
    imageIds,
    volumeId,
  });

  await viewport.setDisplaySets({ displaySetId });
  viewport.setDisplaySetPresentation(displaySetId, ctPresentation());

  viewport.setOrientation(Enums.OrientationAxis.SAGITTAL);
  viewport.setDisplaySetPresentation(displaySetId, {
    voiRange: { lower: -160, upper: 240 },
    voiLUTFunction: Enums.VOILUTFunctionType.LINEAR,
    colormap: { name: 'Grayscale' },
    slabThickness: 0.1,
  });
  viewport.render();

  toolGroup.addViewport(viewportId, renderingEngineId);
  element.oncontextmenu = (e) => e.preventDefault();
  addDisplayAreaGuides();
}

run();
