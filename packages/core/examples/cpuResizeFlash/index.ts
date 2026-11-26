import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, OrientationAxis, RenderBackends } = Enums;

const renderingEngineId = 'cpuResizeFlashEngine';
const viewportId = 'CPU_RESIZE_FLASH';
const displaySetId = 'cpu-resize-flash:ct';
const volumeId = 'cornerstoneStreamingImageVolume:cpuResizeFlash';
const showsVolume = getBooleanUrlParam('volume');

/** The longest time that the readout waits for the canvas to be drawn. */
const LONGEST_WAIT_MS = 3000;

/** The two sizes of the pane that the buttons give, in CSS pixels. */
const PANE_SIZES = {
  narrow: { width: 320, height: 512 },
  wide: { width: 512, height: 512 },
};

setTitleAndDescription(
  'CPU resize flash',
  'A planar viewport that draws its display set on the CPU (renderBackend "cpu") on a device with WebGL. ' +
    'The two buttons change the size of the pane; a ResizeObserver calls renderingEngine.resize(true, true), ' +
    'as an application does. A new size of the CPU canvas clears it, and the readout gives how long the ' +
    'canvas stayed blank after the last resize. Add ?volume=true to show the series as a volume.'
);

const content = document.getElementById('content');
const element = document.createElement('div');

element.id = 'cornerstone-element';
element.style.width = `${PANE_SIZES.wide.width}px`;
element.style.height = `${PANE_SIZES.wide.height}px`;
element.style.border = '1px solid #888';
content.appendChild(element);

const readout = document.createElement('div');

readout.id = 'blank-readout';
readout.style.fontFamily = 'monospace';
readout.style.marginTop = '8px';
readout.innerText = 'Blank after the last resize: no resize yet';
content.appendChild(readout);

let measurementId = 0;

/** The viewport of the example. */
function getViewport(): PlanarViewport {
  return getRenderingEngine(renderingEngineId).getViewport<PlanarViewport>(
    viewportId
  );
}

/**
 * Whether the canvas that the viewport draws on holds a picture: the CPU
 * path paints every pixel, the background too, so a pixel at the centre that
 * is not transparent means the canvas is drawn.
 */
function isCanvasDrawn(viewport: PlanarViewport): boolean {
  const canvas = viewport.getCanvas();

  if (!canvas.width || !canvas.height) {
    return false;
  }

  const [, , , alpha] = canvas
    .getContext('2d')
    .getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1
    ).data;

  return alpha !== 0;
}

/**
 * Resizes the rendering engine and measures, frame by frame, how long the
 * canvas stays blank, and writes it in the readout.
 */
function resizeAndMeasure(): void {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine?.getViewport<PlanarViewport>(viewportId);

  if (!viewport) {
    return;
  }

  const id = ++measurementId;
  const start = performance.now();

  renderingEngine.resize(true, true);

  const drawnInTask = isCanvasDrawn(viewport);
  let blankFrames = 0;
  const size = `${element.clientWidth} x ${element.clientHeight}`;

  if (drawnInTask) {
    readout.innerText = `Blank after the last resize (${size}): 0 ms, 0 frames (drawn in the task of the resize)`;
    return;
  }

  const check = () => {
    if (id !== measurementId) {
      return;
    }

    const elapsed = performance.now() - start;

    if (isCanvasDrawn(viewport)) {
      readout.innerText = `Blank after the last resize (${size}): ${Math.round(elapsed)} ms, ${blankFrames} frames`;
      return;
    }

    blankFrames++;

    if (elapsed > LONGEST_WAIT_MS) {
      readout.innerText = `Blank after the last resize (${size}): still blank after ${LONGEST_WAIT_MS} ms (${blankFrames} frames)`;
      return;
    }

    readout.innerText = `Blank after the last resize (${size}): blank for ${Math.round(elapsed)} ms so far`;
    requestAnimationFrame(check);
  };

  requestAnimationFrame(check);
}

/** Gives the pane one of the two sizes. */
function setPaneSize(size: { width: number; height: number }): void {
  element.style.width = `${size.width}px`;
  element.style.height = `${size.height}px`;
}

addButtonToToolbar({
  id: 'narrow-pane',
  title: `Narrow pane (${PANE_SIZES.narrow.width} x ${PANE_SIZES.narrow.height})`,
  onClick: () => setPaneSize(PANE_SIZES.narrow),
});

addButtonToToolbar({
  id: 'wide-pane',
  title: `Wide pane (${PANE_SIZES.wide.width} x ${PANE_SIZES.wide.height})`,
  onClick: () => setPaneSize(PANE_SIZES.wide),
});

/** Shows the CT series on the CPU and starts to follow the size of the pane. */
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
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  });

  const viewport = getViewport();

  displaySetRegistry.add(displaySetId, {
    imageIds,
    ...(showsVolume ? { volumeId } : {}),
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: {
      mode: showsVolume ? 'volume' : 'stack',
      orientation: OrientationAxis.AXIAL,
      initialImageIdIndex: Math.floor(imageIds.length / 2),
      renderBackend: RenderBackends.CPU,
    },
  });
  viewport.setDisplaySetAppearance(displaySetId, { voiRange: ctVoiRange });
  viewport.render();

  new ResizeObserver(() => resizeAndMeasure()).observe(element);
}

run();
