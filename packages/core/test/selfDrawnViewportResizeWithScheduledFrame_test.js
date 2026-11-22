import * as cornerstone3D from '../src/index';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';

const { Enums, utilities, metaData } = cornerstone3D;
const { ViewportType, Events } = Enums;

const environmentEngineId = utilities.uuidv4();
const viewportId = 'selfDrawnResize';
const ECG_IMAGE_ID = 'ecg://test/resize';
const PIXEL_TOLERANCE = 1;

const ENGINES = [
  {
    name: 'the context pool rendering engine',
    Engine: ContextPoolRenderingEngine,
  },
  { name: 'the tiled rendering engine', Engine: TiledRenderingEngine },
];

/** The ECG module of a waveform of two channels of 100 samples. */
function ecgMetadataProvider(type, imageId) {
  if (type !== Enums.MetadataModules.ECG || imageId !== ECG_IMAGE_ID) {
    return;
  }

  const channels = [0, 1].map(() =>
    Int16Array.from({ length: 100 }, (_, sample) =>
      Math.round(1000 * Math.sin((sample / 100) * Math.PI * 2))
    )
  );

  return {
    numberOfWaveformChannels: 2,
    numberOfWaveformSamples: 100,
    samplingFrequency: 500,
    waveformBitsAllocated: 16,
    waveformSampleInterpretation: 'SS',
    multiplexGroupLabel: 'ECG',
    channelDefinitionSequence: [
      { channelSourceSequence: { codeMeaning: 'Channel 1' } },
      { channelSourceSequence: { codeMeaning: 'Channel 2' } },
    ],
    waveformData: { retrieveBulkData: () => Promise.resolve(channels) },
  };
}

/** Shows the waveform on an ECG viewport and waits for its first draw. */
async function showEcg(viewport) {
  const rendered = new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
  });

  metaData.addProvider(ecgMetadataProvider, 100);
  await viewport.setDisplaySets({ displaySetId: ECG_IMAGE_ID });
  await rendered;
}

/** Shows the test video on a video viewport, paused on its first frame. */
async function showVideo(viewport) {
  const video = () => viewport.element.querySelector('video');

  addTestVideoMetadata();
  await viewport.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
  viewport.setFrameNumber(1);
  await waitFor(
    () =>
      video().readyState >= 2 && video().currentTime === 0 && !video().seeking,
    20000
  );
}

const VIEWPORTS = [
  { name: 'an ECG viewport', type: ViewportType.ECG, show: showEcg },
  { name: 'a video viewport', type: ViewportType.VIDEO, show: showVideo },
];

describe('A viewport that draws itself, whose element changed size -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    });
  });

  afterEach(function () {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
  });

  ENGINES.forEach(({ name: engineName, Engine }) => {
    VIEWPORTS.forEach(({ name: viewportName, type, show }) => {
      it(`has the centre of ${viewportName} in the centre of the new canvas after a resize that meets a scheduled frame of ${engineName}`, async () => {
        renderingEngine = new Engine(utilities.uuidv4());

        const element = testUtils.createViewports(renderingEngine, {
          viewportType: type,
          orientation: null,
          viewportId,
          width: 400,
          height: 300,
          useEnableElement: true,
        });
        const viewport = renderingEngine.getViewport(viewportId);

        await show(viewport);
        await animationFrames(3);

        const centreWorld = viewport.canvasToWorld([200, 150]);

        element.style.width = '200px';
        element.style.height = '150px';
        renderingEngine.render();
        renderingEngine.resize(false);
        renderingEngine.render();
        await animationFrames(4);

        const centreCanvas = viewport.worldToCanvas(centreWorld);

        expect(Math.abs(centreCanvas[0] - 100)).toBeLessThanOrEqual(
          PIXEL_TOLERANCE
        );
        expect(Math.abs(centreCanvas[1] - 75)).toBeLessThanOrEqual(
          PIXEL_TOLERANCE
        );
      }, 30000);
    });
  });
});
