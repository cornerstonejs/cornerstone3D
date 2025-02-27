import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';

import { describe, it, expect } from '@jest/globals';
import { render } from 'react-dom';

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

describe('stackViewport_node_render', function () {
  let viewport, element, renderingEngine;

  beforeEach(() => {
    setUseCPURendering(true);
    window.devicePixelRatio = 1;

    const initData = initCore();
    element = initData.element;
    renderingEngine = initData.renderingEngine;

    const viewportInput = {
      viewportId,
      type: ViewportType.STACK,
      element,
      defaultOptions: {
        background: [0.2, 0, 0.2],
      },
    };

    renderingEngine.enableElement(viewportInput);
    viewport = renderingEngine.getViewport(viewportId);
  });

  it('Basic Viewport Creation', () => {
    expect(viewport).not.toBeUndefined();
  });

  it('Should render simple stack', () => {
    let promise = new Promise((resolve) => {
      element.addEventListener(Events.IMAGE_RENDERED, () => {
        const canvas = viewport.getCanvas();
        const image = canvas.toDataURL('image/png');
        console.error('Rendered image', image);
        resolve(image);
      });
    });
    viewport.setStack([imageId], 0);
    viewport.render();
    return promise;
  });
});
