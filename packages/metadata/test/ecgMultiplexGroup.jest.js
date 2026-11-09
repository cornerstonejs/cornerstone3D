import { getMetaData } from '../src/metaData';
import { registerDefaultProviders } from '../src/registerDefaultProviders';
import { setCacheData } from '../src/utilities/metadataProvider/cacheData';
import { MetadataModules } from '../src/enums';

const BASE = 'wadors:https://example.com/studies/1/series/2/instances/3';

const group = (label, samples) => ({
  MultiplexGroupLabel: label,
  NumberOfWaveformChannels: 1,
  NumberOfWaveformSamples: samples,
  SamplingFrequency: 500,
  ChannelDefinitionSequence: [{}],
  WaveformData: { Value: new Int16Array(samples).buffer },
});

describe('ECG multiplex group of an image id', () => {
  beforeAll(() => {
    registerDefaultProviders();
    setCacheData(MetadataModules.NATURALIZED, BASE, {
      SOPInstanceUID: '3',
      WaveformSequence: [group('MEDIAN', 600), group('RHYTHM', 5000)],
    });
  });

  const read = (imageId) => ({
    label: getMetaData(MetadataModules.ECG, imageId)?.multiplexGroupLabel,
    samples: getMetaData(MetadataModules.ECG, imageId)?.numberOfWaveformSamples,
    calibrated: getMetaData(MetadataModules.CALIBRATION, imageId)
      ?.sequenceOfUltrasoundRegions?.[0]?.regionLocationMaxX1,
  });

  it('shows the default group for an image id with no frame', () => {
    expect(read(BASE)).toEqual({
      label: 'RHYTHM',
      samples: 5000,
      calibrated: 5000,
    });
  });

  it('shows group N - 1 for frame N, with the calibration of the same group', () => {
    expect(read(`${BASE}/frames/1`)).toEqual({
      label: 'MEDIAN',
      samples: 600,
      calibrated: 600,
    });
  });
});
