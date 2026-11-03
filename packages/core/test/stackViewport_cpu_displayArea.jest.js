import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';

import { describe, it, expect } from '@jest/globals';

const {
  utilities,
  setUseCPURendering,
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  init,
} = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'VIEWPORT';

function encodeImageIdInfo(info) {
  return `fakeImageLoader:${encodeURIComponent(JSON.stringify(info))}`;
}

const imageInfo = {
  loader: 'fakeImageLoader',
  name: 'imageURI',
  rows: 64,
  columns: 64,
  barStart: 20,
  barWidth: 5,
  xSpacing: 1,
  ySpacing: 1,
  sliceIndex: 0,
};

const imageId = encodeImageIdInfo(imageInfo);

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

function initCore() {
  init({});
  imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);

  metaData.addProvider(utilities.calibratedPixelSpacingMetadataProvider.get);
  metaData.addProvider(utilities.genericMetadataProvider.get);
  metaData.addProvider(fakeMetaDataProvider, 10000);

  document.body.innerHTML = `<div id="elementId" style="width:128px; height: 128px">
      <div id="viewport-element" class="viewport-element">
        <canvas id="cornerstone-canvas" class="cornerstone-canvas" width="128" height="128"/>
      </div>
    </div>`;
  const renderingEngine = new RenderingEngine(renderingEngineId);
  const element = document.getElementById('elementId');
  setSize(element, 100, 100);
  const viewportElement = document.getElementById('viewport-element');
  setSize(viewportElement, 100, 100);
  const canvasElement = document.getElementById('cornerstone-canvas');
  setSize(canvasElement, 100, 100);
  return { renderingEngine, element };
}

describe('stackViewport CPU setDisplayArea', function () {
  let viewport, element, renderingEngine;

  beforeEach(async () => {
    setUseCPURendering(true);
    window.devicePixelRatio = 1;

    const initData = initCore();
    element = initData.element;
    renderingEngine = initData.renderingEngine;

    renderingEngine.enableElement({
      viewportId,
      type: ViewportType.STACK,
      element,
    });
    viewport = renderingEngine.getViewport(viewportId);
    await viewport.setStack([imageId], 0);
  });

  afterEach(() => {
    renderingEngine.destroy();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setUseCPURendering(false);
  });

  it('does not throw and zooms to the requested image area', () => {
    const fitZoom = viewport.getZoom();

    expect(() =>
      viewport.setDisplayArea({ imageArea: [0.5, 0.5] })
    ).not.toThrow();

    expect(viewport.getZoom()).toBeCloseTo(fitZoom * 2, 5);
  });

  it('gives the same result when the same area is set twice', () => {
    const displayArea = {
      imageArea: [0.5, 0.5],
      imageCanvasPoint: { imagePoint: [0.25, 0.25], canvasPoint: [0.5, 0.5] },
    };
    viewport.setDisplayArea(displayArea);
    const first = viewport.getCamera();
    viewport.setDisplayArea(displayArea);
    const second = viewport.getCamera();

    expect(second.scale).toBeCloseTo(first.scale, 5);
    first.focalPoint.forEach((value, i) =>
      expect(second.focalPoint[i]).toBeCloseTo(value, 5)
    );
  });

  it('applies a SCALE display area as one image pixel per screen pixel', () => {
    viewport.setDisplayArea({ type: 'SCALE', scale: 1 });

    expect(viewport.getZoom()).toBeCloseTo(1, 5);
  });

  function imageTopLeftOnCanvas() {
    const { imageData } = viewport.getImageData();
    return viewport.worldToCanvas(imageData.indexToWorld([0, 0, 0]));
  }

  it('moves the image point to the requested canvas point', () => {
    viewport.setDisplayArea({
      imageCanvasPoint: { imagePoint: [0, 0], canvasPoint: [0.5, 0.5] },
    });

    const topLeft = imageTopLeftOnCanvas();
    expect(topLeft[0]).toBeCloseTo(50, 3);
    expect(topLeft[1]).toBeCloseTo(50, 3);
  });

  it('keeps a centered image in place for a centered point', () => {
    viewport.setDisplayArea({
      imageCanvasPoint: { imagePoint: [0.5, 0.5], canvasPoint: [0.5, 0.5] },
    });

    const topLeft = imageTopLeftOnCanvas();
    expect(topLeft[0]).toBeCloseTo(0, 3);
    expect(topLeft[1]).toBeCloseTo(0, 3);
  });

  it('applies the zoom and the pan together', () => {
    const fitZoom = viewport.getZoom();
    viewport.setDisplayArea({
      imageArea: [0.5, 0.5],
      imageCanvasPoint: { imagePoint: [0, 0], canvasPoint: [0, 0] },
    });

    expect(viewport.getZoom()).toBeCloseTo(fitZoom * 2, 5);
    const topLeft = imageTopLeftOnCanvas();
    expect(topLeft[0]).toBeCloseTo(0, 3);
    expect(topLeft[1]).toBeCloseTo(0, 3);
  });

  it('keeps a stored display area after a camera reset', () => {
    const fitZoom = viewport.getZoom();
    viewport.setDisplayArea({
      imageArea: [0.5, 0.5],
      storeAsInitialCamera: true,
    });
    viewport.setZoom(fitZoom * 5);

    viewport.resetCamera();

    expect(viewport.getZoom()).toBeCloseTo(fitZoom * 2, 5);
  });

  it('keeps the fit baseline when a reset leaves the zoom alone', () => {
    const fitZoom = viewport.getZoom();
    viewport.setZoom(fitZoom * 3);

    viewport.resetCamera({ resetPan: true, resetZoom: false });
    viewport.setDisplayArea({ imageArea: [0.5, 0.5] });

    expect(viewport.getZoom()).toBeCloseTo(fitZoom * 2, 5);
  });

  it('applies a display area given in the viewport options on load', async () => {
    const fitZoom = viewport.getZoom();
    renderingEngine.disableElement(viewportId);
    renderingEngine.enableElement({
      viewportId,
      type: ViewportType.STACK,
      element,
      defaultOptions: { displayArea: { imageArea: [0.5, 0.5] } },
    });
    viewport = renderingEngine.getViewport(viewportId);
    await viewport.setStack([imageId], 0);

    expect(viewport.getZoom()).toBeCloseTo(fitZoom * 2, 5);
  });

  it('measures the display area against the image on screen after scrolling', async () => {
    const largeImageId = encodeImageIdInfo({
      ...imageInfo,
      rows: 128,
      columns: 128,
      sliceIndex: 1,
    });
    await viewport.setStack([largeImageId], 0);
    const largeFitZoom = viewport.getZoom();

    await viewport.setStack([imageId, largeImageId], 0);
    await viewport.setImageIdIndex(1);
    viewport.setDisplayArea({ imageArea: [0.5, 0.5] });

    expect(viewport.getZoom()).toBeCloseTo(largeFitZoom * 2, 5);
  });

  it('flips the CPU image when the view presentation asks for a flip', () => {
    viewport.setViewPresentation({ flipHorizontal: true });

    expect(viewport.getCamera().flipHorizontal).toBe(true);
    expect(viewport._cpuFallbackEnabledElement.viewport.hflip).toBe(true);
  });

  it('clears a CPU flip when the view presentation asks for no flip', () => {
    viewport.setViewPresentation({ flipHorizontal: true, flipVertical: true });
    viewport.setViewPresentation({
      flipHorizontal: false,
      flipVertical: false,
    });

    const { viewport: cpuViewport } = viewport._cpuFallbackEnabledElement;
    expect(viewport.getCamera().flipHorizontal).toBe(false);
    expect(viewport.getCamera().flipVertical).toBe(false);
    expect(cpuViewport.hflip).toBe(false);
    expect(cpuViewport.vflip).toBe(false);
  });

  it('keeps a stored aspect ratio when a display area is set after scrolling', async () => {
    const otherImageId = encodeImageIdInfo({ ...imageInfo, sliceIndex: 1 });
    await viewport.setStack([imageId, otherImageId], 0);
    viewport.setAspectRatio([2, 1], { storeAsInitialCamera: true, fit: true });
    const stretchedFitZoom = viewport.getZoom();

    await viewport.setImageIdIndex(1);
    viewport.setDisplayArea({ imageArea: [0.5, 0.5] });

    expect(viewport.getAspectRatio()).toEqual([2, 1]);
    expect(viewport.getZoom()).toBeCloseTo(stretchedFitZoom * 2, 5);
  });

  it('keeps a fitted aspect ratio change as the display area baseline', () => {
    viewport.setAspectRatio([2, 1], { storeAsInitialCamera: true, fit: true });
    const stretchedFitZoom = viewport.getZoom();

    viewport.setDisplayArea({ imageArea: [0.5, 0.5] });

    expect(viewport.getAspectRatio()).toEqual([2, 1]);
    expect(viewport.getZoom()).toBeCloseTo(stretchedFitZoom * 2, 5);
  });
});
