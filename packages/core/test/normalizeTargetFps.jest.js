import {
  normalizeTargetFps,
  VOLUME_3D_DEFAULT_TARGET_FPS,
  VOLUME_3D_MAX_TARGET_FPS,
  VOLUME_3D_MIN_TARGET_FPS,
} from '../src/RenderingEngine/helpers/fpsBudgetController';

describe('normalizeTargetFps', () => {
  it('clamps sub-1 rounded values to the minimum so targetMs stays finite', () => {
    expect(normalizeTargetFps(0.1)).toBe(VOLUME_3D_MIN_TARGET_FPS);
    expect(normalizeTargetFps(0.4)).toBe(VOLUME_3D_MIN_TARGET_FPS);
  });

  it('returns the default for non-positive or non-finite input', () => {
    expect(normalizeTargetFps(0)).toBe(VOLUME_3D_DEFAULT_TARGET_FPS);
    expect(normalizeTargetFps(-5)).toBe(VOLUME_3D_DEFAULT_TARGET_FPS);
    expect(normalizeTargetFps(NaN)).toBe(VOLUME_3D_DEFAULT_TARGET_FPS);
    expect(normalizeTargetFps(Infinity)).toBe(VOLUME_3D_DEFAULT_TARGET_FPS);
    expect(normalizeTargetFps('nope')).toBe(VOLUME_3D_DEFAULT_TARGET_FPS);
  });

  it('clamps values above the maximum', () => {
    expect(normalizeTargetFps(100)).toBe(VOLUME_3D_MAX_TARGET_FPS);
    expect(normalizeTargetFps(60.6)).toBe(VOLUME_3D_MAX_TARGET_FPS);
  });

  it('rounds finite values within range', () => {
    expect(normalizeTargetFps(15.4)).toBe(15);
    expect(normalizeTargetFps(15.6)).toBe(16);
    expect(normalizeTargetFps(1)).toBe(VOLUME_3D_MIN_TARGET_FPS);
    expect(normalizeTargetFps(60)).toBe(VOLUME_3D_MAX_TARGET_FPS);
  });
});
