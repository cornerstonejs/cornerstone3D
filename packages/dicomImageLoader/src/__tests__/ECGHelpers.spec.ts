import { getECGModule } from '../imageLoader/wadors/metaData/ECGHelpers';

describe('ECGHelpers', () => {
  describe('getECGModule', () => {
    it('should return null when no WaveformSequence is found', () => {
      const metadata = {};
      const result = getECGModule(metadata);
      expect(result).toBeNull();
    });

    it('should parse ECG module from DICOM metadata with InlineBinary data', async () => {
      // Create a simple 16-bit signed short waveform: 2 channels, 10 samples each
      const numberOfChannels = 2;
      const numberOfSamples = 10;
      const buffer = new ArrayBuffer(numberOfChannels * numberOfSamples * 2);
      const view = new Int16Array(buffer);

      // Fill with simple pattern: channel 0 = [0, 100, 200, ...], channel 1 = [0, -100, -200, ...]
      for (let i = 0; i < numberOfSamples; i++) {
        view[i * numberOfChannels + 0] = i * 100;
        view[i * numberOfChannels + 1] = -i * 100;
      }

      const base64Data = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const metadata = {
        '54000100': {
          Value: [
            {
              '003A0005': { Value: [numberOfChannels] },
              '003A0010': { Value: [numberOfSamples] },
              '003A001A': { Value: [500] }, // 500 Hz sampling
              '54001004': { Value: [16] }, // 16 bits allocated
              '54001006': { Value: ['SS'] }, // Signed short
              '003A0020': { Value: ['ECG'] },
              '003A0200': {
                Value: [
                  {
                    '003A0208': {
                      Value: [
                        {
                          '00080104': { Value: ['Lead I'] },
                        },
                      ],
                    },
                  },
                  {
                    '003A0208': {
                      Value: [
                        {
                          '00080104': { Value: ['Lead II'] },
                        },
                      ],
                    },
                  },
                ],
              },
              '54001010': {
                InlineBinary: base64Data,
              },
            },
          ],
        },
      };

      const result = getECGModule(metadata);

      expect(result).not.toBeNull();
      expect(result?.numberOfWaveformChannels).toBe(numberOfChannels);
      expect(result?.numberOfWaveformSamples).toBe(numberOfSamples);
      expect(result?.samplingFrequency).toBe(500);
      expect(result?.waveformBitsAllocated).toBe(16);
      expect(result?.waveformSampleInterpretation).toBe('SS');
      expect(result?.multiplexGroupLabel).toBe('ECG');
      expect(result?.channelDefinitionSequence.length).toBe(2);
      expect(
        result?.channelDefinitionSequence[0].channelSourceSequence?.codeMeaning
      ).toBe('Lead I');
      expect(
        result?.channelDefinitionSequence[1].channelSourceSequence?.codeMeaning
      ).toBe('Lead II');
    });

    it('should have a retrieveBulkData function that decodes InlineBinary data', async () => {
      const numberOfChannels = 2;
      const numberOfSamples = 5;
      const buffer = new ArrayBuffer(numberOfChannels * numberOfSamples * 2);
      const view = new Int16Array(buffer);

      // Simple pattern
      for (let i = 0; i < numberOfSamples; i++) {
        view[i * numberOfChannels + 0] = i * 100;
        view[i * numberOfChannels + 1] = -i * 100;
      }

      const base64Data = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const metadata = {
        '54000100': {
          Value: [
            {
              '003A0005': { Value: [numberOfChannels] },
              '003A0010': { Value: [numberOfSamples] },
              '003A001A': { Value: [500] },
              '54001004': { Value: [16] },
              '54001006': { Value: ['SS'] },
              '003A0020': { Value: ['ECG'] },
              '003A0200': { Value: [] },
              '54001010': {
                InlineBinary: base64Data,
              },
            },
          ],
        },
      };

      const ecgModule = getECGModule(metadata);
      expect(ecgModule).not.toBeNull();
      expect(ecgModule?.waveformData.retrieveBulkData).toBeDefined();

      const channelArrays = await ecgModule!.waveformData.retrieveBulkData();

      expect(channelArrays.length).toBe(numberOfChannels);
      expect(channelArrays[0].length).toBe(numberOfSamples);
      expect(channelArrays[1].length).toBe(numberOfSamples);

      // Verify decoded data
      expect(channelArrays[0][0]).toBe(0);
      expect(channelArrays[0][1]).toBe(100);
      expect(channelArrays[1][0]).toBe(0);
      expect(channelArrays[1][1]).toBe(-100);
    });

    it('should throw error when no data source is found', async () => {
      const metadata = {
        '54000100': {
          Value: [
            {
              '003A0005': { Value: [2] },
              '003A0010': { Value: [10] },
              '003A001A': { Value: [500] },
              '003A0200': { Value: [] },
              '54001010': {}, // No data source
            },
          ],
        },
      };

      const ecgModule = getECGModule(metadata);
      expect(ecgModule).not.toBeNull();

      // The retrieveBulkData function should throw when called
      try {
        await ecgModule!.waveformData.retrieveBulkData();
        throw new Error('Expected retrieveBulkData to throw');
      } catch (error) {
        expect((error as Error).message).toContain(
          '[ECGHelpers] No data source found in WaveformData'
        );
      }
    });

    it('should handle metadata with default values', () => {
      const numberOfChannels = 1;
      const numberOfSamples = 20;

      const metadata = {
        '54000100': {
          Value: [
            {
              '003A0005': { Value: [numberOfChannels] },
              '003A0010': { Value: [numberOfSamples] },
              '003A001A': { Value: [250] },
              // Missing optional fields
              '003A0200': { Value: [] },
              '54001010': { Value: [] }, // Empty Value array
            },
          ],
        },
      };

      const result = getECGModule(metadata);

      expect(result).not.toBeNull();
      expect(result?.waveformBitsAllocated).toBe(16); // Default
      expect(result?.waveformSampleInterpretation).toBe('SS'); // Default
      expect(result?.multiplexGroupLabel).toBe('ECG'); // Default
    });

    it('should parse channel definitions correctly', () => {
      const metadata = {
        '54000100': {
          Value: [
            {
              '003A0005': { Value: [3] },
              '003A0010': { Value: [100] },
              '003A001A': { Value: [500] },
              '003A0200': {
                Value: [
                  {
                    '003A0208': {
                      Value: [{ '00080104': { Value: ['Channel A'] } }],
                    },
                  },
                  {
                    '003A0208': {
                      Value: [{ '00080104': { Value: ['Channel B'] } }],
                    },
                  },
                  {
                    // Channel without source sequence
                  },
                ],
              },
              '54001010': { Value: [] },
            },
          ],
        },
      };

      const result = getECGModule(metadata);

      expect(result?.channelDefinitionSequence.length).toBe(3);
      expect(
        result?.channelDefinitionSequence[0].channelSourceSequence?.codeMeaning
      ).toBe('Channel A');
      expect(
        result?.channelDefinitionSequence[1].channelSourceSequence?.codeMeaning
      ).toBe('Channel B');
      expect(
        result?.channelDefinitionSequence[2].channelSourceSequence?.codeMeaning
      ).toBe('Unknown');
    });
  });
});
