import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, metaData } = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = cornerstone3D.utilities.uuidv4();
const viewportId = 'ECG_VIEWPORT';

describe('ECGViewport', () => {
  let renderingEngine;
  let element;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      viewportId,
      type: ViewportType.ECG,
    });
    renderingEngine = testEnv.renderingEngine;
    element = testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.ECG,
    });
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      viewportIds: [viewportId],
    });
  });

  describe('setEcg with synthetic data', () => {
    it('Should render ECG and fire IMAGE_RENDERED event', (done) => {
      const fakeImageId = 'ecg://test/image-001';
      const numberOfChannels = 2;
      const numberOfSamples = 100;
      const samplingFrequency = 500;

      // Create synthetic waveform data: simple sine-like Int16Arrays
      const channelArrays = [];
      for (let c = 0; c < numberOfChannels; c++) {
        const data = new Int16Array(numberOfSamples);
        for (let i = 0; i < numberOfSamples; i++) {
          // Sine wave with amplitude ~1000
          data[i] = Math.round(
            1000 * Math.sin((i / numberOfSamples) * Math.PI * 2)
          );
        }
        channelArrays.push(data);
      }

      // Register fake ECG metadata provider
      metaData.addProvider((type, imageId) => {
        if (type !== Enums.MetadataModules.ECG || imageId !== fakeImageId) {
          return;
        }
        return {
          numberOfWaveformChannels: numberOfChannels,
          numberOfWaveformSamples: numberOfSamples,
          samplingFrequency,
          waveformBitsAllocated: 16,
          waveformSampleInterpretation: 'SS',
          multiplexGroupLabel: 'ECG',
          channelDefinitionSequence: [
            { channelSourceSequence: { codeMeaning: 'Channel 1' } },
            { channelSourceSequence: { codeMeaning: 'Channel 2' } },
          ],
          waveformData: {
            retrieveBulkData: () => Promise.resolve(channelArrays),
          },
        };
      }, 100);

      const viewport = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        // Viewport should have loaded the waveform data
        const waveformData = viewport.getWaveformData();
        expect(waveformData).toBeDefined();
        expect(waveformData.numberOfChannels).toBe(numberOfChannels);
        expect(waveformData.numberOfSamples).toBe(numberOfSamples);
        expect(waveformData.samplingFrequency).toBe(samplingFrequency);

        done();
      });

      try {
        viewport.setEcg(fakeImageId);
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should convert between canvas and world coordinates', (done) => {
      const fakeImageId = 'ecg://test/image-002';
      const numberOfChannels = 2;
      const numberOfSamples = 100;
      const samplingFrequency = 500;

      const channelArrays = [];
      for (let c = 0; c < numberOfChannels; c++) {
        const data = new Int16Array(numberOfSamples);
        for (let i = 0; i < numberOfSamples; i++) {
          data[i] = Math.round(
            1000 * Math.sin((i / numberOfSamples) * Math.PI * 2)
          );
        }
        channelArrays.push(data);
      }

      metaData.addProvider((type, imageId) => {
        if (type !== Enums.MetadataModules.ECG || imageId !== fakeImageId) {
          return;
        }
        return {
          numberOfWaveformChannels: numberOfChannels,
          numberOfWaveformSamples: numberOfSamples,
          samplingFrequency,
          waveformBitsAllocated: 16,
          waveformSampleInterpretation: 'SS',
          multiplexGroupLabel: 'ECG',
          channelDefinitionSequence: [
            { channelSourceSequence: { codeMeaning: 'Channel 1' } },
            { channelSourceSequence: { codeMeaning: 'Channel 2' } },
          ],
          waveformData: {
            retrieveBulkData: () => Promise.resolve(channelArrays),
          },
        };
      }, 100);

      const viewport = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        // Test worldToCanvas / canvasToWorld round-trip
        const worldPoint = [50, 500, 0]; // sample 50, amplitude 500, channel 0
        const canvasPoint = viewport.worldToCanvas(worldPoint);
        const worldPointBack = viewport.canvasToWorld(canvasPoint);

        // Should round-trip (allowing for some floating-point error)
        expect(Math.abs(worldPointBack[0] - worldPoint[0])).toBeLessThan(1);
        expect(Math.abs(worldPointBack[1] - worldPoint[1])).toBeLessThan(1);
        expect(Math.abs(worldPointBack[2] - worldPoint[2])).toBeLessThan(1);

        done();
      });

      try {
        viewport.setEcg(fakeImageId);
      } catch (e) {
        done.fail(e);
      }
    });

    it('Should return 0 for getCurrentImageIdIndex', (done) => {
      const fakeImageId = 'ecg://test/image-003';
      const numberOfChannels = 1;
      const numberOfSamples = 50;
      const samplingFrequency = 500;

      const channelArrays = [new Int16Array(numberOfSamples)];

      metaData.addProvider((type, imageId) => {
        if (type !== Enums.MetadataModules.ECG || imageId !== fakeImageId) {
          return;
        }
        return {
          numberOfWaveformChannels: numberOfChannels,
          numberOfWaveformSamples: numberOfSamples,
          samplingFrequency,
          waveformBitsAllocated: 16,
          waveformSampleInterpretation: 'SS',
          multiplexGroupLabel: 'ECG',
          channelDefinitionSequence: [
            { channelSourceSequence: { codeMeaning: 'Channel 1' } },
          ],
          waveformData: {
            retrieveBulkData: () => Promise.resolve(channelArrays),
          },
        };
      }, 100);

      const viewport = renderingEngine.getViewport(viewportId);

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        expect(viewport.getCurrentImageIdIndex()).toBe(0);
        expect(viewport.getSliceIndex()).toBe(0);
        done();
      });

      try {
        viewport.setEcg(fakeImageId);
      } catch (e) {
        done.fail(e);
      }
    });
  });
});
