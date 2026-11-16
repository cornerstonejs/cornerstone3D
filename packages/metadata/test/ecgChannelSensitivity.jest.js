import {
  buildEcgModuleFromInstance,
  ECG_DEFAULT_MV_PER_UNIT,
} from '../src/utilities/metadataProvider/ecgFromInstance';

function makeInstance(channelDefinitions) {
  return {
    WaveformSequence: [
      {
        NumberOfWaveformChannels: channelDefinitions.length,
        NumberOfWaveformSamples: 5000,
        SamplingFrequency: 500,
        WaveformBitsAllocated: 16,
        WaveformSampleInterpretation: 'SS',
        MultiplexGroupLabel: 'ECG',
        ChannelDefinitionSequence: channelDefinitions,
        WaveformData: {},
      },
    ],
  };
}

function makeChannel(name, sensitivity) {
  return {
    ChannelSourceSequence: [{ CodeMeaning: name }],
    ...sensitivity,
  };
}

const IMAGE_ID = 'wadors:https://example.org/dicomweb/studies/1.2.3';

function mvPerUnitOf(sensitivity) {
  const module = buildEcgModuleFromInstance(
    makeInstance([makeChannel('Lead I', sensitivity)]),
    IMAGE_ID
  );

  return module.channelDefinitionSequence[0].mvPerUnit;
}

describe('ECG channel sensitivity', () => {
  it('converts microvolts for each unit into millivolts', () => {
    expect(
      mvPerUnitOf({
        ChannelSensitivity: 1,
        ChannelSensitivityCorrectionFactor: 1,
        ChannelSensitivityUnitsSequence: [{ CodeValue: 'uV' }],
      })
    ).toBeCloseTo(0.001, 9);
  });

  it('keeps millivolts for each unit unchanged', () => {
    expect(
      mvPerUnitOf({
        ChannelSensitivity: 1,
        ChannelSensitivityCorrectionFactor: 1,
        ChannelSensitivityUnitsSequence: [{ CodeValue: 'mV' }],
      })
    ).toBeCloseTo(1, 9);
  });

  it('applies the correction factor', () => {
    expect(
      mvPerUnitOf({
        ChannelSensitivity: 2.5,
        ChannelSensitivityCorrectionFactor: 2,
        ChannelSensitivityUnitsSequence: [{ CodeValue: 'uV' }],
      })
    ).toBeCloseTo(0.005, 9);
  });

  it('reads the code meaning when the code value is absent', () => {
    expect(
      mvPerUnitOf({
        ChannelSensitivity: 1,
        ChannelSensitivityUnitsSequence: [{ CodeMeaning: 'MV' }],
      })
    ).toBeCloseTo(1, 9);
  });

  it('treats a missing correction factor as 1', () => {
    expect(
      mvPerUnitOf({
        ChannelSensitivity: 5,
        ChannelSensitivityUnitsSequence: [{ CodeValue: 'uV' }],
      })
    ).toBeCloseTo(0.005, 9);
  });

  it('falls back to the default when the sensitivity is absent', () => {
    expect(mvPerUnitOf({})).toBe(ECG_DEFAULT_MV_PER_UNIT);
  });

  it('falls back to the default for an unknown unit code', () => {
    expect(
      mvPerUnitOf({
        ChannelSensitivity: 1,
        ChannelSensitivityUnitsSequence: [{ CodeValue: 'cm' }],
      })
    ).toBe(ECG_DEFAULT_MV_PER_UNIT);
  });

  it('gives every channel its own value', () => {
    const module = buildEcgModuleFromInstance(
      makeInstance([
        makeChannel('Lead I', {
          ChannelSensitivity: 1,
          ChannelSensitivityUnitsSequence: [{ CodeValue: 'uV' }],
        }),
        makeChannel('Lead II', {
          ChannelSensitivity: 1,
          ChannelSensitivityUnitsSequence: [{ CodeValue: 'mV' }],
        }),
      ]),
      IMAGE_ID
    );

    expect(module.channelDefinitionSequence[0].mvPerUnit).toBeCloseTo(0.001, 9);
    expect(module.channelDefinitionSequence[1].mvPerUnit).toBeCloseTo(1, 9);
  });
});
