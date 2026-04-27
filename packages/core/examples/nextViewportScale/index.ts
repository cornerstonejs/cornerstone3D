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
  addSliderToToolbar,
  ctVoiRange,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events, OrientationAxis } = Enums;

const renderingEngineId = 'nextViewportScaleRenderingEngine';
const stackViewportId = 'CT_STACK_NEXT_SCALE';
const volumeViewportId = 'CT_VOLUME_NEXT_SCALE';
const stackDataId = 'next-viewport-scale:stack';
const volumeDataId = 'next-viewport-scale:volume';
const volumeId = 'cornerstoneStreamingImageVolume:NEXT_VIEWPORT_SCALE_CT';
const viewportWidthPx = 640;
const viewportHeightPx = 400;
const scaleXSliderId = 'next-viewport-scale-x';
const scaleYSliderId = 'next-viewport-scale-y';
const stackViewportBackground: Types.Point3 = [0.05, 0.18, 0.2];
const volumeViewportBackground: Types.Point3 = [0.22, 0.1, 0.16];
const stackViewportBackgroundCss = 'rgb(13, 46, 51)';
const volumeViewportBackgroundCss = 'rgb(56, 26, 41)';

type ScaleTarget = 'both' | 'stack' | 'volume';
type ScaleValue = number | Types.Point2;

let activeTarget: ScaleTarget = 'both';
let scaleX = 1;
let scaleY = 1;
const viewportInfo = new Map<string, HTMLDivElement>();

setTitleAndDescription(
  'Next Viewport Scale',
  'Shows scalar and two-axis scale on Planar ViewportNext stack and volume-slice viewports.'
);

const content = document.getElementById('content');
const viewportRow = document.createElement('div');
viewportRow.id = 'next-viewport-scale-row';
viewportRow.style.display = 'flex';
viewportRow.style.flexWrap = 'wrap';
viewportRow.style.gap = '12px';
viewportRow.style.marginTop = '12px';
content.appendChild(viewportRow);

const stackElement = createViewportPanel(
  'Stack Planar Next',
  stackViewportId,
  stackViewportBackgroundCss
);
const volumeElement = createViewportPanel(
  'Volume Slice Planar Next',
  volumeViewportId,
  volumeViewportBackgroundCss
);

function createViewportPanel(
  title: string,
  viewportId: string,
  backgroundColor: string
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '6px';

  const heading = document.createElement('div');
  heading.innerText = title;
  heading.style.fontWeight = '600';
  panel.appendChild(heading);

  const element = document.createElement('div');
  element.id = viewportId;
  element.style.width = `${viewportWidthPx}px`;
  element.style.height = `${viewportHeightPx}px`;
  element.style.background = backgroundColor;
  panel.appendChild(element);

  const info = document.createElement('div');
  info.style.fontFamily = 'monospace';
  info.style.whiteSpace = 'pre';
  panel.appendChild(info);
  viewportInfo.set(viewportId, info);

  viewportRow.appendChild(panel);

  return element;
}

function getViewport(viewportId: string): PlanarViewport {
  return getRenderingEngine(renderingEngineId).getViewport(
    viewportId
  ) as PlanarViewport;
}

function getTargetViewports(): PlanarViewport[] {
  if (activeTarget === 'stack') {
    return [getViewport(stackViewportId)];
  }

  if (activeTarget === 'volume') {
    return [getViewport(volumeViewportId)];
  }

  return [getViewport(stackViewportId), getViewport(volumeViewportId)];
}

function getViewportCanvasCenter(viewport: PlanarViewport): Types.Point2 {
  const canvas = viewport.getCanvas();

  return [
    (canvas.clientWidth || canvas.width) / 2,
    (canvas.clientHeight || canvas.height) / 2,
  ];
}

function formatScaleLabel(axis: 'X' | 'Y', value: number): string {
  return `Scale ${axis}: ${value.toFixed(2)}`;
}

function setSliderValue(
  sliderId: string,
  value: number,
  labelText: string
): void {
  const slider = document.getElementById(sliderId) as HTMLInputElement | null;

  if (slider) {
    slider.value = String(value);
  }

  const label = document.getElementById(`${sliderId}-label`);

  if (label) {
    label.innerText = labelText;
  }
}

function setScaleState(scale: Types.Point2): void {
  scaleX = scale[0];
  scaleY = scale[1];

  setSliderValue(scaleXSliderId, scaleX, formatScaleLabel('X', scaleX));
  setSliderValue(scaleYSliderId, scaleY, formatScaleLabel('Y', scaleY));
}

function syncScaleSlidersFromViewport(): void {
  const viewport = getTargetViewports()[0];
  const [currentScaleX, currentScaleY] = viewport.getScale();

  setScaleState([currentScaleX, currentScaleY]);
}

function applyScale(scale: ScaleValue, anchorToCenter = false): void {
  const resolvedScale: Types.Point2 =
    typeof scale === 'number' ? [scale, scale] : scale;

  setScaleState(resolvedScale);

  for (const viewport of getTargetViewports()) {
    viewport.setScale(
      scale,
      anchorToCenter ? getViewportCanvasCenter(viewport) : undefined
    );
    viewport.render();
  }

  updateInfo();
}

function applyDisplayAreaScaleMode(
  scaleMode: 'fitAspect' | 'fitWidth' | 'fitHeight' | 'absolute'
): void {
  setScaleState([1, 1]);

  for (const viewport of getTargetViewports()) {
    viewport.setViewPresentation({
      displayArea: {
        imageArea: [1, 1],
        imageCanvasPoint: {
          imagePoint: [0.5, 0.5],
          canvasPoint: [0.5, 0.5],
        },
        scaleMode,
      },
      scale: [1, 1],
    });
    viewport.render();
  }

  updateInfo();
}

function resetTargetViewports(): void {
  setScaleState([1, 1]);

  for (const viewport of getTargetViewports()) {
    viewport.resetCamera();
    viewport.setScale([1, 1]);
    viewport.render();
  }

  updateInfo();
}

function updateInfo(): void {
  for (const viewportId of [stackViewportId, volumeViewportId]) {
    const viewport = getViewport(viewportId);
    const scale = viewport.getScale();
    const zoom = viewport.getZoom();
    const viewState = viewport.getViewState();
    const info = viewportInfo.get(viewportId);

    if (!info) {
      continue;
    }

    info.innerText = [
      `scale: [${scale[0].toFixed(2)}, ${scale[1].toFixed(2)}]`,
      `legacy zoom: ${zoom.toFixed(2)}`,
      `scaleMode: ${viewState.scaleMode ?? 'fit'}`,
      `viewport: ${viewportWidthPx} x ${viewportHeightPx}`,
    ].join('\n');
  }
}

addDropdownToToolbar({
  labelText: 'Target',
  options: {
    values: ['both', 'stack', 'volume'],
    defaultValue: 'both',
  },
  onSelectedValueChange: (value) => {
    activeTarget = value as ScaleTarget;
    syncScaleSlidersFromViewport();
    updateInfo();
  },
});

addButtonToToolbar({
  title: 'Scale [1, 1]',
  onClick: () => {
    scaleX = 1;
    scaleY = 1;
    applyScale([scaleX, scaleY]);
  },
});

addButtonToToolbar({
  title: 'Uniform 1.5',
  onClick: () => {
    scaleX = 1.5;
    scaleY = 1.5;
    applyScale(1.5);
  },
});

addButtonToToolbar({
  title: 'Wide [2, 1]',
  onClick: () => {
    scaleX = 2;
    scaleY = 1;
    applyScale([scaleX, scaleY]);
  },
});

addButtonToToolbar({
  title: 'Tall [1, 2]',
  onClick: () => {
    scaleX = 1;
    scaleY = 2;
    applyScale([scaleX, scaleY]);
  },
});

addButtonToToolbar({
  title: 'Center Wide [2, 1]',
  onClick: () => {
    scaleX = 2;
    scaleY = 1;
    applyScale([scaleX, scaleY], true);
  },
});

addButtonToToolbar({
  title: 'Fit Aspect',
  onClick: () => {
    applyDisplayAreaScaleMode('fitAspect');
  },
});

addButtonToToolbar({
  title: 'Fit Width',
  onClick: () => {
    applyDisplayAreaScaleMode('fitWidth');
  },
});

addButtonToToolbar({
  title: 'Fit Height',
  onClick: () => {
    applyDisplayAreaScaleMode('fitHeight');
  },
});

addButtonToToolbar({
  title: 'Absolute Fill',
  onClick: () => {
    applyDisplayAreaScaleMode('absolute');
  },
});

addButtonToToolbar({
  title: 'Reset',
  onClick: resetTargetViewports,
});

addSliderToToolbar({
  id: scaleXSliderId,
  title: 'Scale X',
  range: [0.25, 3],
  step: 0.05,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    setScaleState([Number(value), scaleY]);
    applyScale([scaleX, scaleY]);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = formatScaleLabel('X', Number(value));
  },
});

addSliderToToolbar({
  id: scaleYSliderId,
  title: 'Scale Y',
  range: [0.25, 3],
  step: 0.05,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    setScaleState([scaleX, Number(value)]);
    applyScale([scaleX, scaleY]);
  },
  updateLabelOnChange: (value, label) => {
    label.innerText = formatScaleLabel('Y', Number(value));
  },
});

setScaleState([scaleX, scaleY]);

function addCameraListeners(): void {
  for (const element of [stackElement, volumeElement]) {
    element.addEventListener(Events.CAMERA_MODIFIED, updateInfo);
  }
}

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const middleImageIndex = Math.floor(imageIds.length / 2);
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId: stackViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: stackElement,
    defaultOptions: {
      background: stackViewportBackground,
    },
  });
  renderingEngine.enableElement({
    viewportId: volumeViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: volumeElement,
    defaultOptions: {
      background: volumeViewportBackground,
      orientation: OrientationAxis.SAGITTAL,
    },
  });

  const stackViewport = getViewport(stackViewportId);
  const volumeViewport = getViewport(volumeViewportId);

  utilities.viewportNextDataSetMetadataProvider.add(stackDataId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: middleImageIndex,
  });
  utilities.viewportNextDataSetMetadataProvider.add(volumeDataId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: middleImageIndex,
    volumeId,
  });

  await Promise.all([
    stackViewport.setDataList([
      {
        dataId: stackDataId,
        options: {},
      },
    ]),
    volumeViewport.setDataList([
      {
        dataId: volumeDataId,
        options: {
          orientation: OrientationAxis.SAGITTAL,
        },
      },
    ]),
  ]);

  stackViewport.setDataPresentation(stackDataId, {
    voiRange: ctVoiRange,
  });
  volumeViewport.setDataPresentation(volumeDataId, {
    voiRange: ctVoiRange,
  });

  addCameraListeners();
  stackViewport.render();
  volumeViewport.render();
  updateInfo();
}

run();
