import {
  resolveFixedSampleDistanceFactor,
  VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR,
} from '../src/RenderingEngine/helpers/volume3DTargetFps';

describe('resolveFixedSampleDistanceFactor', () => {
  it('returns the default for missing, non-positive, or non-finite input', () => {
    expect(resolveFixedSampleDistanceFactor()).toBe(
      VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR
    );
    expect(resolveFixedSampleDistanceFactor(undefined)).toBe(
      VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR
    );
    expect(resolveFixedSampleDistanceFactor(0)).toBe(
      VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR
    );
    expect(resolveFixedSampleDistanceFactor(-1)).toBe(
      VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR
    );
    expect(resolveFixedSampleDistanceFactor(NaN)).toBe(
      VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR
    );
    expect(resolveFixedSampleDistanceFactor(Infinity)).toBe(
      VOLUME_3D_DEFAULT_INTERACTIVE_SAMPLE_DISTANCE_FACTOR
    );
  });

  it('returns finite positive factors unchanged', () => {
    expect(resolveFixedSampleDistanceFactor(1)).toBe(1);
    expect(resolveFixedSampleDistanceFactor(2)).toBe(2);
    expect(resolveFixedSampleDistanceFactor(4.5)).toBe(4.5);
  });
});
