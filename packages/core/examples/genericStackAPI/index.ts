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
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import {
  getBooleanUrlParam,
  getStringUrlParam,
} from '../../../../utils/demo/helpers/exampleParameters';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK_GENERIC';
const stackDataId = 'stack-api-next:primary';

function parseStackReadyDelayMs(): number {
  const raw = getStringUrlParam('stackReadyDelayMs');
  if (!raw) {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

setTitleAndDescription(
  'Stack GenericViewport API',
  'Demonstrates the clean Planar GenericViewport API for stack-like workflows.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, () => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  if (!viewport) {
    return;
  }

  const { flipHorizontal, flipVertical, rotation } = viewport.getViewState();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation || 0)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});

const toolbarButtons: HTMLButtonElement[] = [];

function addToolbarButton(
  config: Parameters<typeof addButtonToToolbar>[0]
): HTMLButtonElement {
  const button = addButtonToToolbar(config);
  button.disabled = true;
  toolbarButtons.push(button);
  return button;
}

function enableToolbar(): void {
  for (const button of toolbarButtons) {
    button.disabled = false;
  }
}

addToolbarButton({
  title: 'Set VOI Range',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDataPresentation(stackDataId, {
      voiRange: { upper: 2500, lower: -1500 },
    });
    viewport.render();
  },
});

addToolbarButton({
  title: 'Next Image',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const currentImageIdIndex = viewport.getCurrentImageIdIndex();
    const numImages = viewport.getImageIds().length;
    const newImageIdIndex = Math.min(currentImageIdIndex + 1, numImages - 1);

    void viewport.setImageIdIndex(newImageIdIndex);
  },
});

addToolbarButton({
  title: 'Previous Image',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const currentImageIdIndex = viewport.getCurrentImageIdIndex();
    const newImageIdIndex = Math.max(currentImageIdIndex - 1, 0);

    void viewport.setImageIdIndex(newImageIdIndex);
  },
});

addToolbarButton({
  title: 'Flip H',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    const { flipHorizontal = false } = viewport.getViewState();

    viewport.setViewState({ flipHorizontal: !flipHorizontal });
    viewport.render();
  },
});

addToolbarButton({
  title: 'Flip V',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    const { flipVertical = false } = viewport.getViewState();

    viewport.setViewState({ flipVertical: !flipVertical });
    viewport.render();
  },
});

addToolbarButton({
  title: 'Rotate Random',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setViewState({
      rotation: Math.random() * 360,
    });
    viewport.render();
  },
});

addToolbarButton({
  title: 'Rotate Absolute 150',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setViewState({ rotation: 150 });
    viewport.render();
  },
});

addToolbarButton({
  title: 'Rotate Delta 30',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.updateViewState(({ rotation = 0 }) => ({
      rotation: rotation + 30,
    }));
    viewport.render();
  },
});

addToolbarButton({
  title: 'Invert',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    const { invert = false } = viewport.getDataPresentation(stackDataId) || {};

    viewport.setDataPresentation(stackDataId, {
      invert: !invert,
    });
    viewport.render();
  },
});

addToolbarButton({
  title: 'Apply Random Zoom And Pan',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.resetViewState();
    viewport.setScale(1.35);
    viewport.setPan([42, -28]);
    viewport.render();
  },
});

addToolbarButton({
  title: 'Apply Colormap',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDataPresentation(stackDataId, {
      colormap: { name: 'hsv' },
    });
    viewport.render();
  },
});

addToolbarButton({
  title: 'Reset Viewport',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.resetViewState();
    viewport.setDataPresentation(stackDataId, {
      colormap: undefined,
      invert: false,
      voiRange: ctVoiRange,
    });
    viewport.render();
  },
});

async function run() {
  await initDemo();

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
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  });

  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
  const stack = [imageIds[0], imageIds[1], imageIds[2]];

  utilities.genericViewportDataSetMetadataProvider.add(stackDataId, {
    imageIds: stack,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  await viewport.setDataList([
    {
      dataId: stackDataId,
      options: {},
    },
  ]);
  viewport.setDataPresentation(stackDataId, { voiRange: ctVoiRange });
  viewport.render();

  const delayMs = parseStackReadyDelayMs();
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  enableToolbar();
}

run();
