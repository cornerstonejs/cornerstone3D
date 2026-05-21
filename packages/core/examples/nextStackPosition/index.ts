import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK_NEXT_POSITION';
const stackDataId = 'stack-position-next:primary';

type FractionPoint = number | [number, number];
type DisplayAreaSize = number | [number, number];

let viewport: PlanarViewport;
let displayArea: Types.ViewPresentation | 'none' = 'none';

setTitleAndDescription(
  'Stack Position Next',
  'Demonstrates the native Planar ViewportNext display area API.'
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
  const { rotation = 0 } = viewport.getViewPresentation();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  displayAreaInfo.innerText = `DisplayArea: ${JSON.stringify(displayArea)}`;
});

function toPoint(value: FractionPoint): [number, number] {
  return Array.isArray(value) ? value : [value, value];
}

function createDisplayArea(
  size: DisplayAreaSize,
  pointValue: FractionPoint,
  canvasValue: FractionPoint | undefined = pointValue,
  rotation = 0,
  flipHorizontal = false
): Types.ViewPresentation {
  const resolvedCanvasValue = canvasValue ?? pointValue;

  return {
    rotation,
    flipHorizontal,
    displayArea: {
      imageArea: Array.isArray(size) ? size : [size, size],
      imageCanvasPoint: {
        imagePoint: toPoint(pointValue),
        canvasPoint: toPoint(resolvedCanvasValue),
      },
    },
  };
}

const displayAreas = new Map<string, Types.ViewPresentation>();
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
    const selectedDisplayArea = displayAreas.get(String(name));

    if (!selectedDisplayArea) {
      return;
    }

    displayArea = selectedDisplayArea;
    viewport.setViewPresentation(selectedDisplayArea);
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
    const { rotation = 0 } = viewport.getViewPresentation();

    viewport.setViewPresentation({ rotation: rotation + 30 });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.resetCamera();
    viewport.setDataPresentation(stackDataId, {
      colormap: undefined,
      invert: false,
    });
    viewport.render();
  },
});

function addDisplayAreaGuides() {
  // Draw the display-area reference boxes inside the SVG annotation layer so
  // they are captured by canvas-based snapshot tests; DOM-only overlays get
  // skipped by checkForCanvasSnapshot (legacy stackPosition does this same
  // dance for the same reason).
  const svgNode = document
    .getElementsByClassName('svg-layer')
    .item(0) as SVGSVGElement | null;
  if (!svgNode) {
    return;
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const makeRect = (
    x: string,
    y: string,
    w: string,
    h: string,
    stroke: string
  ) => {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    return rect;
  };
  svgNode.appendChild(makeRect('25%', '25%', '25%', '25%', 'green'));
  svgNode.appendChild(makeRect('50%', '50%', '25%', '25%', 'red'));
}

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.55651399101931177647030363790032',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.99.1071.11955901484749168523821342348553',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      background: [0.8, 0, 0.8] as Types.Point3,
    },
  });

  viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  utilities.viewportNextDataSetMetadataProvider.add(stackDataId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  await viewport.setDataList([
    {
      dataId: stackDataId,
      options: {},
    },
  ]);

  viewport.render();
  addDisplayAreaGuides();
}

run();
