import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { MetadataModules } from '../src/enums';
import * as metaData from '../src/metaData';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';

const ECG_ID = 'ecg:resizeDevicePixelRatio';
const SAMPLES = 1000;
const WIDTH = 400;
const HEIGHT = 300;

/** The ECG module of a record of two leads. */
function ecgModuleProvider(type, imageId) {
  if (type !== MetadataModules.ECG || imageId !== ECG_ID) {
    return;
  }

  return {
    numberOfWaveformChannels: 2,
    numberOfWaveformSamples: SAMPLES,
    samplingFrequency: 500,
    channelDefinitionSequence: ['I', 'II'].map((codeMeaning) => ({
      channelSourceSequence: { codeMeaning },
      mvPerUnit: 0.001,
    })),
    waveformData: {
      retrieveBulkData: async () => [
        new Int16Array(SAMPLES),
        new Int16Array(SAMPLES),
      ],
    },
  };
}

/**
 * Makes an element of the test size with a canvas whose backing store size
 * counts its writes: a write to `width` or `height` clears a canvas.
 */
function createElement() {
  const element = document.createElement('div');
  const viewportElement = document.createElement('div');
  const canvas = document.createElement('canvas');
  const size = { width: 300, height: 150 };
  const writes = { count: 0 };

  viewportElement.classList.add('viewport-element');
  canvas.classList.add('cornerstone-canvas');
  [element, canvas].forEach((node) => {
    Object.defineProperty(node, 'clientWidth', { value: WIDTH });
    Object.defineProperty(node, 'clientHeight', { value: HEIGHT });
    Object.defineProperty(node, 'offsetWidth', { value: WIDTH });
    Object.defineProperty(node, 'offsetHeight', { value: HEIGHT });
  });
  ['width', 'height'].forEach((name) => {
    Object.defineProperty(canvas, name, {
      configurable: true,
      get: () => size[name],
      set: (value) => {
        writes.count++;
        size[name] = value;
      },
    });
  });
  viewportElement.appendChild(canvas);
  element.appendChild(viewportElement);
  document.body.appendChild(element);

  return { element, canvas, writes };
}

const mounted = [];
let devicePixelRatio;

beforeEach(() => {
  devicePixelRatio = window.devicePixelRatio;
  metaData.addProvider(ecgModuleProvider, 100000);
});

afterEach(() => {
  window.devicePixelRatio = devicePixelRatio;
  metaData.removeProvider(ecgModuleProvider);
  mounted.splice(0).forEach((element) => element.remove());
});

describe('ECGViewport.resize on a screen with a device pixel ratio of 2', () => {
  it('sizes the canvas to the CSS size times the ratio, and leaves a canvas of that size alone', async () => {
    window.devicePixelRatio = 2;

    const { element, canvas, writes } = createElement();
    const viewport = new ECGViewport({
      id: 'ecgResizeDevicePixelRatio',
      element,
      renderingEngineId: 'renderingEngine',
    });

    mounted.push(element);
    await viewport.setDisplaySets({ displaySetId: ECG_ID });

    expect(canvas.width).toBe(WIDTH * 2);
    expect(canvas.height).toBe(HEIGHT * 2);

    const writesBefore = writes.count;

    viewport.resize();
    viewport.resize();

    expect(writes.count).toBe(writesBefore);
    expect(canvas.width).toBe(WIDTH * 2);
    expect(canvas.height).toBe(HEIGHT * 2);
  });
});
