import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  enableVolumeGpuTrace,
  disableVolumeGpuTrace,
  resetVolumeGpuTrace,
  recordVolumeGpuTrace,
  summarizeVolumeGpuTrace,
  shouldSkipNearbyFramesForTrace,
  isVolumeGpuTraceEnabled,
} from '../src/utilities/volumeGpuTrace';

describe.skip('volumeGpuTrace', () => {
  beforeEach(() => {
    resetVolumeGpuTrace();
    disableVolumeGpuTrace();
  });

  afterEach(() => {
    resetVolumeGpuTrace();
    disableVolumeGpuTrace();
  });

  it('is off by default and records nothing', () => {
    expect(isVolumeGpuTraceEnabled()).toBe(false);
    recordVolumeGpuTrace({ kind: 'markFrameDirty', frameIndex: 0 });
    expect(summarizeVolumeGpuTrace().eventCount).toBe(0);
  });

  it('aggregates hot-path samples and flags full-dirty uploads', () => {
    enableVolumeGpuTrace({ logEvery: 0 });

    recordVolumeGpuTrace({
      kind: 'markFrameDirty',
      frameIndex: 0,
      textureSets: 1,
      mappedSlices: 1,
    });
    recordVolumeGpuTrace({
      kind: 'upload',
      branch: 'derived',
      durationMs: 2,
      dirtySlicesUploaded: 64,
      texSubImageW: 512,
      texSubImageH: 512,
      texSubImageDepth: 1,
    });
    recordVolumeGpuTrace({
      kind: 'mapperAlloc',
      shouldReset: true,
      dims: [512, 512, 2048],
    });
    recordVolumeGpuTrace({
      kind: 'mapperAlloc',
      shouldReset: true,
      dims: [512, 512, 2048],
    });
    recordVolumeGpuTrace({
      kind: 'mapperAlloc',
      shouldReset: true,
      dims: [512, 512, 2048],
    });

    const summary = summarizeVolumeGpuTrace();

    expect(summary.upload.maxDirtySlices).toBe(64);
    expect(summary.mapperAlloc.resetCount).toBe(3);
    expect(summary.hypotheses.some((h) => h.startsWith('full-dirty'))).toBe(
      true
    );
    expect(summary.hypotheses.some((h) => h.startsWith('texture-reset'))).toBe(
      true
    );
  });

  it('flags derived-miss when fillSliceByBoxAverage dominates', () => {
    enableVolumeGpuTrace({ logEvery: 0 });

    for (let i = 0; i < 5; i++) {
      recordVolumeGpuTrace({
        kind: 'upload',
        branch: 'fillSliceByBoxAverage',
        dirtySlicesUploaded: 1,
        durationMs: 10,
      });
    }
    recordVolumeGpuTrace({
      kind: 'upload',
      branch: 'derived',
      dirtySlicesUploaded: 1,
      durationMs: 1,
    });

    const summary = summarizeVolumeGpuTrace();
    expect(summary.hypotheses.some((h) => h.startsWith('derived-miss'))).toBe(
      true
    );
  });

  it('honors skipNearbyFrames for amplifier isolation', () => {
    enableVolumeGpuTrace({ skipNearbyFrames: true, logEvery: 0 });
    expect(shouldSkipNearbyFramesForTrace()).toBe(true);
  });
});
