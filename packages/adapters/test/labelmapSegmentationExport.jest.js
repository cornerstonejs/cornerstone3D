import { describe, it, expect } from '@jest/globals';
import {
  toLabelmap3DArray,
  collectNonEmptyFrameIndices,
  maxSegmentValue,
  collectSegmentSequence,
} from '../src/adapters/Cornerstone3D/Segmentation/generateSegmentation';

/**
 * PR-2611 item 2f: the LABELMAP export must (a) consider ALL input labelmap3D
 * objects, not just [0], and (b) choose bit depth from the actual segment values
 * so labels > 255 are not truncated mod 256.
 */

const frame = (values) => ({
  pixelData: new Uint8Array(values),
  rows: 2,
  columns: 2,
});

const emptyFrame = () => frame([0, 0, 0, 0]);

describe('toLabelmap3DArray', () => {
  it('wraps a single labelmap3D', () => {
    const lm = { labelmaps2D: [] };
    expect(toLabelmap3DArray(lm)).toEqual([lm]);
  });

  it('passes an array through, dropping falsy entries', () => {
    const a = { labelmaps2D: [] };
    const b = { labelmaps2D: [] };
    expect(toLabelmap3DArray([a, null, b, undefined])).toEqual([a, b]);
  });

  it('returns [] for nullish input', () => {
    expect(toLabelmap3DArray(undefined)).toEqual([]);
    expect(toLabelmap3DArray(null)).toEqual([]);
  });
});

describe('collectNonEmptyFrameIndices', () => {
  it('unions non-empty frames across all labelmap3D inputs', () => {
    // labelmap A has a segment on frame 0; labelmap B on frame 2.
    const a = {
      labelmaps2D: [frame([1, 0, 0, 0]), emptyFrame(), emptyFrame()],
    };
    const b = {
      labelmaps2D: [emptyFrame(), emptyFrame(), frame([0, 0, 0, 2])],
    };
    expect(collectNonEmptyFrameIndices([a, b])).toEqual([0, 2]);
  });

  it('ignores empty and pixel-less frames', () => {
    const a = {
      labelmaps2D: [emptyFrame(), { rows: 2, columns: 2 }, frame([3, 0, 0, 0])],
    };
    expect(collectNonEmptyFrameIndices([a])).toEqual([2]);
  });
});

describe('maxSegmentValue', () => {
  it('finds the largest value across labelmaps and frames (detects > 255)', () => {
    const a = { labelmaps2D: [frame([1, 2, 0, 0])] };
    // A real 16-bit labelmap with a label > 255 must be detected as such.
    const big = {
      labelmaps2D: [
        { pixelData: new Uint16Array([0, 260, 0, 0]), rows: 2, columns: 2 },
      ],
    };
    expect(maxSegmentValue([a], [0])).toBe(2);
    expect(maxSegmentValue([a, big], [0])).toBe(260);
    expect(maxSegmentValue([a, big], [0]) > 255).toBe(true);
  });

  it('returns 0 when there are no frames', () => {
    expect(maxSegmentValue([{ labelmaps2D: [] }], [])).toBe(0);
  });
});

describe('collectSegmentSequence', () => {
  it('unions segment metadata across labelmaps ascending by SegmentNumber', () => {
    const a = { metadata: [null, { SegmentNumber: 1, SegmentLabel: 'a' }] };
    const b = {
      metadata: [null, null, { SegmentNumber: 2, SegmentLabel: 'b' }],
    };
    const result = collectSegmentSequence([a, b]);
    expect(result.map((s) => s.SegmentLabel)).toEqual(['a', 'b']);
  });

  it('keeps the first definition on a SegmentNumber clash', () => {
    const a = { metadata: [null, { SegmentNumber: 1, SegmentLabel: 'first' }] };
    const b = {
      metadata: [null, { SegmentNumber: 1, SegmentLabel: 'second' }],
    };
    expect(collectSegmentSequence([a, b])).toEqual([
      { SegmentNumber: 1, SegmentLabel: 'first' },
    ]);
  });
});
