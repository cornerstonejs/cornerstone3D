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
        // console.error('Rendered image', image);
        expect(image).toBeTruthy();
        resolve(image);
      });
    });
    viewport.setStack([imageId], 0);
    viewport.render();
    return promise;
  });

  describe('VOI on the CPU path', () => {
    const lutA = { firstValueMapped: 0, numBitsPerEntry: 8, lut: [0, 64, 255] };
    const lutB = {
      firstValueMapped: 0,
      numBitsPerEntry: 8,
      lut: [0, 192, 255],
    };

    async function loadFrames(name, setups) {
      const ids = setups.map((_, sliceIndex) =>
        encodeImageIdInfo({ ...imageInfo, name, sliceIndex })
      );
      const images = await Promise.all(
        ids.map((id) => imageLoader.loadAndCacheImage(id))
      );
      images.forEach((image, i) => Object.assign(image, setups[i]));
      return ids;
    }

    const cpuViewport = () => viewport._cpuFallbackEnabledElement.viewport;

    it('uses the VOI LUT Sequence and the function of each frame', async () => {
      const ids = await loadFrames('cpuFrames', [
        { voiLUT: lutA },
        { voiLUT: lutB, voiLUTFunction: 'SIGMOID' },
        { voiLUT: undefined },
      ]);
      await viewport.setStack(ids, 0);
      expect(cpuViewport().voiLUT).toBe(lutA);

      await viewport.setImageIdIndex(1);
      expect(cpuViewport().voiLUT).toBe(lutB);
      expect(cpuViewport().voi.voiLUTFunction).toBe('SIGMOID');
      expect(viewport.getProperties().VOILUTFunction).toBe('SIGMOID');

      await viewport.setImageIdIndex(2);
      expect(cpuViewport().voiLUT).toBeUndefined();
      expect(viewport.getProperties().VOILUTFunction).toBe('LINEAR');
    });

    it('keeps a VOI LUT Function that the application set across frames', async () => {
      const ids = await loadFrames('cpuAppFunction', [
        { voiLUT: lutA },
        { voiLUT: lutB },
      ]);
      await viewport.setStack(ids, 0);
      viewport.setProperties({ VOILUTFunction: 'SIGMOID' });

      await viewport.setImageIdIndex(1);

      expect(viewport.getProperties().VOILUTFunction).toBe('SIGMOID');
      expect(cpuViewport().voi.voiLUTFunction).toBe('SIGMOID');
      expect(cpuViewport().voiLUT).toBeUndefined();
    });

    it('sends the function and the sequence state in VOI_MODIFIED', async () => {
      const ids = await loadFrames('cpuEvent', [
        { voiLUT: lutA, voiLUTFunction: 'LINEAR_EXACT' },
      ]);
      await viewport.setStack(ids, 0);
      const details = [];
      element.addEventListener(Events.VOI_MODIFIED, (evt) =>
        details.push(evt.detail)
      );

      viewport.setProperties({ voiRange: { lower: 0, upper: 2 } });

      expect(details.at(-1)).toEqual(
        expect.objectContaining({
          VOILUTFunction: 'LINEAR_EXACT',
          voiLUTSequenceApplied: true,
        })
      );
    });

    it('drops the VOI LUT Sequence for a colormap, as the GPU path does', async () => {
      const ids = await loadFrames('cpuColormap', [{ voiLUT: lutA }]);
      await viewport.setStack(ids, 0);
      const { voiRange } = viewport.getProperties();

      viewport.setProperties({ colormap: { name: 'hsv' } });

      // The colormap maps the window of the sequence domain linearly.
      expect(cpuViewport().voiLUT).toBeUndefined();
      expect(viewport.getProperties().voiRange).toEqual(voiRange);
    });

    it('drops the VOI LUT Sequence for a colormap name that does not resolve, as the GPU path does', async () => {
      const ids = await loadFrames('cpuColormapUnknown', [{ voiLUT: lutA }]);
      await viewport.setStack(ids, 0);

      viewport.setProperties({ colormap: { name: 'notAColormap' } });

      expect(cpuViewport().colormap).toBeUndefined();
      expect(cpuViewport().voiLUT).toBeUndefined();
    });

    it('keeps the colormap and drops the sequence after setStack, as the GPU path does', async () => {
      const ids = await loadFrames('cpuColormapStack', [{ voiLUT: lutA }]);
      const nextIds = await loadFrames('cpuColormapStack2', [{ voiLUT: lutB }]);
      await viewport.setStack(ids, 0);
      viewport.setProperties({ colormap: { name: 'hsv' } });

      await viewport.setStack(nextIds, 0);

      expect(cpuViewport().colormap).toBeDefined();
      expect(cpuViewport().voiLUT).toBeUndefined();
    });

    it('removes a colormap on resetProperties and shows the sequence again, as the GPU path does', async () => {
      const ids = await loadFrames('cpuColormapReset', [{ voiLUT: lutA }]);
      await viewport.setStack(ids, 0);
      viewport.setProperties({ colormap: { name: 'hsv' } });

      viewport.resetProperties();

      expect(viewport.getProperties().colormap).toBeUndefined();
      expect(cpuViewport().colormap).toBeUndefined();
      expect(cpuViewport().voiLUT).toBe(lutA);
    });

    it('removes a colormap applied after the load on resetProperties, as the GPU path does', async () => {
      const ids = await loadFrames('cpuColormapResetPlain', [{}]);
      await viewport.setStack(ids, 0);
      viewport.setProperties({ colormap: { name: 'hsv' } });
      expect(cpuViewport().colormap).toBeDefined();

      viewport.resetProperties();

      expect(viewport.getProperties().colormap).toBeUndefined();
      expect(cpuViewport().colormap).toBeUndefined();
    });

    it('restores the default useVOILUTSequence on resetToDefaultProperties', async () => {
      const ids = await loadFrames('cpuDefaultSequence', [{ voiLUT: lutA }]);
      await viewport.setStack(ids, 0);
      viewport.setProperties({ useVOILUTSequence: false });
      viewport.setProperties({ useVOILUTSequence: true });
      expect(cpuViewport().voiLUT).toBe(lutA);

      viewport.resetToDefaultProperties();

      expect(viewport.getProperties().useVOILUTSequence).toBe(false);
      expect(cpuViewport().voiLUT).toBeUndefined();
    });

    it('does not throw for useVOILUTSequence while a new stack loads', async () => {
      const ids = await loadFrames('cpuLoading', [{ voiLUT: lutA }]);
      await viewport.setStack(ids, 0);
      const pending = viewport.setStack(ids, 0);

      expect(() =>
        viewport.setProperties({ useVOILUTSequence: false })
      ).not.toThrow();
      await pending;
    });
  });
});
