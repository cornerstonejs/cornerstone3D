import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import * as cornerstone3D from '../src/index';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import VideoViewport from '../src/RenderingEngine/Viewports/Video/VideoViewport';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';
import VolumeViewport3D from '../src/RenderingEngine/Viewports/Volume3D/viewport3D';

const { Enums, metaData } = cornerstone3D;
const { Events, MetadataModules } = Enums;

/** Records the detail of each DISPLAY_SET_APPEARANCE_CHANGED of a viewport. */
function recordAppearanceEvents(viewport) {
  const details = [];

  viewport.element.addEventListener(
    Events.DISPLAY_SET_APPEARANCE_CHANGED,
    (evt) => details.push(evt.detail)
  );

  return details;
}

/** Resolves after the pending promise jobs and timers of a few turns. */
async function settle() {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('The mount option appearance of a 3D viewport', () => {
  const renderingEngineId = 'mountAppearance3D';
  let viewport;
  let appliedByBinding;
  let failNextBind;

  beforeEach(() => {
    const renderer = vtkRenderer.newInstance();

    appliedByBinding = [];
    failNextBind = false;
    renderingEngineCache.set({
      id: renderingEngineId,
      getRenderer: () => renderer,
      renderViewport() {},
    });

    const element = document.createElement('div');

    document.body.appendChild(element);
    viewport = new VolumeViewport3D({
      id: '3d',
      element,
      renderingEngineId,
      canvas: document.createElement('canvas'),
      sWidth: 64,
      sHeight: 64,
      dataProvider: {
        load: async (displaySetId) => ({ id: displaySetId }),
      },
      renderPathResolver: {
        resolve: () => ({
          createRenderPath: () => ({
            addData: async () => {
              if (failNextBind) {
                throw new Error('the render path failed');
              }

              return {
                rendering: { renderMode: 'vtkGeometry3d' },
                updateAppearance(props) {
                  appliedByBinding.push({ ...props });
                },
                applyViewState() {},
                getFrameOfReferenceUID: () => 'for-3d',
                removeData() {},
              };
            },
          }),
        }),
      },
    });
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(renderingEngineId);
    document.body.innerHTML = '';
  });

  it('gives the binding the appearance of the mount from its first update and fires the appearance event once, with cause mount', async () => {
    const events = recordAppearanceEvents(viewport);

    await viewport.setDisplaySets({
      displaySetId: 'surface',
      options: { appearance: { opacity: 0.4 } },
    });

    expect(appliedByBinding[0]).toEqual({ visible: true, opacity: 0.4 });
    expect(events.map(({ cause }) => cause)).toEqual(['mount']);
    expect(events[0].overrides).toEqual({ opacity: 0.4 });
    expect(viewport.getDisplaySetAppearance('surface')).toEqual({
      opacity: 0.4,
    });
  });

  it('puts back the overrides that were stored before a mount that does not bind', async () => {
    viewport.setDisplaySetAppearance('surface', { opacity: 0.8 });
    failNextBind = true;

    await expect(
      viewport.addDisplaySet('surface', { appearance: { opacity: 0.1 } })
    ).rejects.toThrow('the render path failed');
    expect(viewport.getDisplaySetAppearance('surface')).toEqual({
      opacity: 0.8,
    });
  });
});

describe('The mount option appearance of a video viewport', () => {
  const FPS = 10;
  const FRAMES = 50;
  const VIDEO_ID =
    'wadors:https://server/studies/1/series/2/instances/3/frames/1';

  /** Gives a jsdom video element what a loaded video has. */
  function stubVideoElement(video) {
    Object.defineProperty(video, 'videoWidth', { value: 200 });
    Object.defineProperty(video, 'videoHeight', { value: 100 });
    Object.defineProperty(video, 'duration', { value: FRAMES / FPS });
    Object.defineProperty(video, 'readyState', { value: 4 });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true });
    Object.defineProperty(video, 'paused', { get: () => true });
    video.play = jest.fn(() => Promise.resolve());
    video.pause = jest.fn();
  }

  /** Makes a video viewport whose data provider gives the test video. */
  function createVideoViewport() {
    const element = document.createElement('div');

    Object.defineProperty(element, 'clientWidth', { value: 400 });
    Object.defineProperty(element, 'clientHeight', { value: 300 });
    document.body.appendChild(element);

    return new VideoViewport({
      id: 'video',
      element,
      renderingEngineId: 'renderingEngine',
      dataProvider: {
        load: async (id) => ({
          id,
          type: 'video',
          renderedUrl: 'https://server/video.mp4',
          fps: FPS,
          numberOfFrames: FRAMES,
          frameRange: [1, FRAMES],
          modality: 'XC',
          metadata: {
            bitsAllocated: 8,
            numberOfComponents: 3,
            origin: [0, 0, 0],
            rows: 100,
            columns: 200,
            direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            dimensions: [200, 100, 1],
            spacing: [1, 1, 1],
            hasPixelSpacing: false,
            numVoxels: 20000,
            imagePlaneModule: {},
          },
        }),
      },
    });
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('plays the video with the appearance of the mount and fires the appearance event once, with cause mount', async () => {
    const viewport = createVideoViewport();
    const events = recordAppearanceEvents(viewport);
    const mounted = viewport.setDisplaySets({
      displaySetId: VIDEO_ID,
      options: { appearance: { playbackRate: 2, loop: false } },
    });

    await settle();

    const video = viewport.element.querySelector('video');

    stubVideoElement(video);
    video.dispatchEvent(new Event('loadedmetadata'));
    await mounted;

    expect(video.playbackRate).toBe(2);
    expect(video.loop).toBe(false);
    expect(events.map(({ cause }) => cause)).toEqual(['mount']);
    expect(events[0].overrides).toEqual({ playbackRate: 2, loop: false });
    expect(viewport.getEffectiveDisplaySetAppearance(VIDEO_ID)).toEqual(
      expect.objectContaining({ playbackRate: 2, loop: false, muted: true })
    );
    viewport.destroy();
  });
});

describe('The mount option appearance of an ECG viewport', () => {
  const ECG_ID = 'ecg:mountAppearance';

  /** The ECG module of a short record of two leads. */
  function ecgModuleProvider(type, imageId) {
    if (type !== MetadataModules.ECG || imageId !== ECG_ID) {
      return;
    }

    return {
      numberOfWaveformChannels: 2,
      numberOfWaveformSamples: 500,
      samplingFrequency: 500,
      channelDefinitionSequence: ['I', 'II'].map((codeMeaning) => ({
        channelSourceSequence: { codeMeaning },
        mvPerUnit: 0.001,
      })),
      waveformData: {
        retrieveBulkData: async () => [
          new Int16Array(500).fill(100),
          new Int16Array(500).fill(-100),
        ],
      },
    };
  }

  /** Makes an ECG viewport on an element with a canvas. */
  function createECGViewport() {
    const element = document.createElement('div');
    const viewportElement = document.createElement('div');
    const canvas = document.createElement('canvas');

    viewportElement.classList.add('viewport-element');
    [element, canvas].forEach((node) => {
      Object.defineProperty(node, 'clientWidth', { value: 400 });
      Object.defineProperty(node, 'clientHeight', { value: 300 });
    });
    viewportElement.appendChild(canvas);
    element.appendChild(viewportElement);
    document.body.appendChild(element);

    return new ECGViewport({
      id: 'ecg',
      element,
      renderingEngineId: 'renderingEngine',
    });
  }

  beforeEach(() => {
    metaData.addProvider(ecgModuleProvider, 100000);
  });

  afterEach(() => {
    metaData.removeProvider(ecgModuleProvider);
    document.body.innerHTML = '';
  });

  it('draws the waveform with the appearance of the mount and fires the appearance event once, with cause mount', async () => {
    const viewport = createECGViewport();
    const events = recordAppearanceEvents(viewport);

    await viewport.setDisplaySets({
      displaySetId: ECG_ID,
      options: { appearance: { lineWidth: 3, showGrid: false } },
    });

    expect(events.map(({ cause }) => cause)).toEqual(['mount']);
    expect(events[0].overrides).toEqual({ lineWidth: 3, showGrid: false });
    expect(viewport.getEffectiveDisplaySetAppearance(ECG_ID)).toEqual(
      expect.objectContaining({ lineWidth: 3, showGrid: false, opacity: 1 })
    );
    viewport.destroy();
  });
});
