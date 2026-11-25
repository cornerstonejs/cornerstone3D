import { describe, it, expect } from '@jest/globals';
import {
  probeAdaptiveRegionCore,
  resolveAdaptiveBandAtTolerance,
} from '../../../src/utilities/segmentation/growCut/intensityRange/adaptiveRegionIntensityRange';

const WIDTH = 100;
const HEIGHT = 100;
const DEPTH = 3;

/**
 * Builds a synthetic slice-replicated volume accessor. `paint` receives (i, j)
 * and returns the scalar for every k.
 */
function makeVolume(paint) {
  const slice = new Float32Array(WIDTH * HEIGHT);
  for (let j = 0; j < HEIGHT; j++) {
    for (let i = 0; i < WIDTH; i++) {
      slice[j * WIDTH + i] = paint(i, j);
    }
  }
  return {
    dimensions: [WIDTH, HEIGHT, DEPTH],
    getScalar: (i, j, _k) => slice[j * WIDTH + i],
  };
}

function probeAt(volume, i, j, extra = {}) {
  return probeAdaptiveRegionCore({
    dimensions: volume.dimensions,
    getScalar: volume.getScalar,
    ijkClick: [i, j, 1],
    ...extra,
  });
}

const BG = 10;
const FG = 200;

function squareVolume({ cx, cy, half, fg = FG, bg = BG, noise = 0 }) {
  let n = 0;
  return makeVolume((i, j) => {
    const inside = Math.abs(i - cx) <= half && Math.abs(j - cy) <= half;
    const base = inside ? fg : bg;
    if (!noise) {
      return base;
    }
    // Deterministic pseudo-noise so tests are reproducible.
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return base + ((n % (2 * noise + 1)) - noise);
  });
}

describe('probeAdaptiveRegionCore', () => {
  it('finds a meaningful region when clicking inside a distinct square', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10 });
    const result = probeAt(volume, 50, 50);

    expect(result.viable).toBe(true);
    expect(result.reason).toBe('ok');
    // 21x21 square = 441 in-plane pixels.
    expect(result.regionSizePx).toBe(441);
    expect(result.range).not.toBeNull();
    expect(result.range.min).toBeLessThanOrEqual(FG);
    expect(result.range.max).toBeGreaterThanOrEqual(FG);
    // The one-sided threshold must not reach the background value.
    expect(result.range.min).toBeGreaterThan(BG);
  });

  it('accepts an edge click and snaps the seed inward', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10 });
    // Square spans i,j in [40, 60]; click exactly on the right edge pixel.
    const result = probeAt(volume, 60, 50);

    expect(result.viable).toBe(true);
    // Clicked pixel is part of the region; the seed may sit further inside.
    const [si, sj] = result.range.ijkStart;
    expect(Math.abs(si - 50)).toBeLessThanOrEqual(10);
    expect(Math.abs(sj - 50)).toBeLessThanOrEqual(10);
    expect(result.range.min).toBeGreaterThan(BG);
  });

  it('blocks clicks on the surroundings of a region (off-target)', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10 });
    // 2px outside the right edge: a region is nearby (seed snap reaches it)
    // but the pointer itself is on background — must NOT show plus.
    const result = probeAt(volume, 62, 50);

    expect(result.viable).toBe(false);
    expect(result.reason).toBe('off-target');
    expect(result.range).toBeNull();
  });

  it('never excludes the hottest core (one-sided band, no holes)', () => {
    // Lesion with a mid-intensity shell and a much hotter core (PET-style).
    const volume = makeVolume((i, j) => {
      const d = Math.max(Math.abs(i - 50), Math.abs(j - 50));
      if (d <= 4) {
        return 250; // hot core
      }
      if (d <= 10) {
        return 150; // shell
      }
      return BG;
    });
    // Click on the shell, far from the core.
    const result = probeAt(volume, 41, 50);

    expect(result.viable).toBe(true);
    // Whole lesion including the 9x9 core: 21x21 = 441 pixels.
    expect(result.regionSizePx).toBe(441);
    // Upper side is unbounded so a hotter core can never become a hole.
    expect(result.range.max).toBe(Infinity);
    expect(result.range.min).toBeGreaterThan(BG);
    expect(result.range.min).toBeLessThanOrEqual(150);
  });

  it('segments dark regions on bright background (negative polarity)', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10, fg: 20, bg: 200 });
    const result = probeAt(volume, 50, 50);

    expect(result.viable).toBe(true);
    expect(result.regionSizePx).toBe(441);
    expect(result.range.diagnostics.adaptive.polarity).toBe(-1);
    // Included side is "darker": no lower limit, threshold below background.
    expect(result.range.min).toBe(-Infinity);
    expect(result.range.max).toBeGreaterThanOrEqual(20);
    expect(result.range.max).toBeLessThan(200);
  });

  it('reports flat-region on uniform background', () => {
    const volume = squareVolume({ cx: 20, cy: 20, half: 5 });
    // Far away from the square, everything nearby and on the ring is BG.
    const result = probeAt(volume, 75, 75);

    expect(result.viable).toBe(false);
    expect(result.reason).toBe('flat-region');
    expect(result.range).toBeNull();
  });

  it('rejects a speck of a few pixels as too small', () => {
    const volume = makeVolume((i, j) => (i === 50 && j === 50 ? FG : BG));
    const result = probeAt(volume, 50, 50);

    expect(result.viable).toBe(false);
    expect(result.reason).toBe('too-small');
  });

  it('does not block large regions by physical size (no maximum rule)', () => {
    // 41x41 px at 4mm spacing = 26896 mm² — big, but bounded and coherent.
    // Lesion-ness is judged by shape (tool-level 3D gate), never by size.
    const volume = squareVolume({ cx: 50, cy: 50, half: 20 });
    const atOneMm = probeAt(volume, 50, 50, { inPlaneSpacing: [1, 1] });
    const atFourMm = probeAt(volume, 50, 50, { inPlaneSpacing: [4, 4] });

    expect(atOneMm.viable).toBe(true);
    expect(atFourMm.viable).toBe(true);
    expect(atFourMm.regionAreaMm2).toBeGreaterThan(6000);
  });

  it('rejects a region flooding most of the analysis window as unbounded', () => {
    // 83x83 = 6889 pixels > 60% of the 100x100 window: no visible boundary.
    const volume = squareVolume({ cx: 50, cy: 50, half: 41 });
    const result = probeAt(volume, 50, 50);

    expect(result.viable).toBe(false);
    expect(result.reason).toBe('unbounded');
  });

  it('tolerates noise inside the region and still bounds it', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10, noise: 8 });
    const result = probeAt(volume, 50, 50);

    expect(result.viable).toBe(true);
    // Most of the 441 square pixels should be captured despite noise.
    expect(result.regionSizePx).toBeGreaterThan(300);
    expect(result.range.min).toBeGreaterThan(BG + 8);
  });

  it('does not leak into a separated brighter structure', () => {
    const volume = makeVolume((i, j) => {
      if (Math.abs(i - 40) <= 8 && Math.abs(j - 50) <= 8) {
        return 120; // dimmer target
      }
      if (Math.abs(i - 62) <= 8 && Math.abs(j - 50) <= 8) {
        return 240; // brighter neighbor (separated by background)
      }
      return BG;
    });
    const result = probeAt(volume, 40, 50);

    expect(result.viable).toBe(true);
    // 17x17 target only — the brighter neighbor is not connected.
    expect(result.regionSizePx).toBe(289);
    expect(result.range.min).toBeGreaterThan(BG);
    expect(result.range.min).toBeLessThanOrEqual(120);
  });

  it('maps the threshold back to raw values through a linear VOI', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10 });
    const result = probeAt(volume, 50, 50, {
      voiMapping: { voiRange: { lower: 0, upper: 400 } },
    });

    expect(result.viable).toBe(true);
    expect(result.range.min).toBeLessThanOrEqual(FG);
    expect(result.range.max).toBeGreaterThanOrEqual(FG);
    expect(result.range.min).toBeGreaterThan(BG);
  });

  it('honors an inverted VOI display', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10 });
    const result = probeAt(volume, 50, 50, {
      voiMapping: { voiRange: { lower: 0, upper: 400 }, invert: true },
    });

    expect(result.viable).toBe(true);
    expect(result.range.min).toBeLessThanOrEqual(FG);
    expect(result.range.max).toBeGreaterThanOrEqual(FG);
    expect(result.range.min).toBeGreaterThan(BG);
  });

  it('widens the band with toleranceScale (legacy expand)', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10, noise: 8 });
    const base = probeAt(volume, 50, 50);
    const expanded = probeAt(volume, 50, 50, { toleranceScale: 1.5 });

    expect(base.viable).toBe(true);
    expect(expanded.viable).toBe(true);
    expect(expanded.toleranceBytes).toBeGreaterThan(base.toleranceBytes);
  });

  it('returns an expand context whose growth curve supports stepping', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10, noise: 8 });
    const result = probeAt(volume, 50, 50);

    expect(result.viable).toBe(true);
    const context = result.expandContext;
    expect(context).toBeDefined();
    expect(context.chosenToleranceBytes).toBe(result.toleranceBytes);
    expect(context.growthCurve.length).toBeGreaterThan(0);
    expect(context.polarity).toBe(1);

    // Rebuilding the band at the chosen tolerance matches the click's band.
    const sameBand = resolveAdaptiveBandAtTolerance(
      context,
      context.chosenToleranceBytes
    );
    expect(sameBand.min).toBeCloseTo(result.range.min, 10);
    expect(sameBand.max).toBe(result.range.max);

    // A deeper tolerance lowers the threshold (wider region for polarity +1).
    const wider = resolveAdaptiveBandAtTolerance(
      context,
      context.chosenToleranceBytes + 20
    );
    expect(wider.min).toBeLessThan(sameBand.min);
  });

  it('reports outside-volume for clicks off the grid', () => {
    const volume = squareVolume({ cx: 50, cy: 50, half: 10 });
    const result = probeAt(volume, -5, 50);

    expect(result.viable).toBe(false);
    expect(result.reason).toBe('outside-volume');
  });
});
