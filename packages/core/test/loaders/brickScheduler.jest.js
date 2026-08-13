import {
  BrickQueue,
  levelRank,
  prioritiseBricks,
  scoreBrick,
} from '../../src/loaders/brick/brickScheduler';
import { parseBrickManifest } from '../../src/loaders/brick/brickManifest';
import { enumerateBricks } from '../../src/loaders/brick/brickAddressing';

const BRICK_SIZE = [64, 64, 64];
const TRANSFER_SYNTAX = '1.2.840.10008.1.2.4.80';

const manifest = parseBrickManifest({
  axes: [
    { name: 'x', type: 'space', size: 512, subsample: true },
    { name: 'y', type: 'space', size: 512, subsample: true },
    { name: 'z', type: 'space', size: 2048, subsample: true },
  ],
  brickSize: BRICK_SIZE,
  levels: ['d1'],
  transferSyntaxUID: TRANSFER_SYNTAX,
});

const levels = manifest.levelsByName;
const level = levels.get('d1');

/** A uniform ladder, for the level-rank cases that need several levels at once. */
const ladder = parseBrickManifest({
  axes: [
    { name: 'x', type: 'space', size: 64, subsample: true },
    { name: 'y', type: 'space', size: 64, subsample: true },
    { name: 'z', type: 'space', size: 64, subsample: true },
  ],
  brickSize: [4, 4, 4],
  levels: ['d1', 'd2', 'd4', 'd8'],
  transferSyntaxUID: TRANSFER_SYNTAX,
});

/**
 * The Juno geometry: 5mm slices against 1mm pixels, so the ladder reduces
 * in-plane first and the coarsest level is one non-cubic brick.
 */
const anisotropic = parseBrickManifest({
  axes: [
    { name: 'x', type: 'space', size: 512, subsample: true },
    { name: 'y', type: 'space', size: 512, subsample: true },
    { name: 'z', type: 'space', size: 174, subsample: true },
  ],
  brickSize: BRICK_SIZE,
  brickPadding: false,
  levels: [
    { name: 'd1', size: [512, 512, 174], brickSize: [64, 64, 64] },
    { name: 'd4_4_1', size: [128, 128, 174], brickSize: [64, 64, 64] },
    { name: 'd8_8_2', size: [64, 64, 87], brickSize: [64, 64, 87] },
  ],
  transferSyntaxUID: TRANSFER_SYNTAX,
});

const sagittalAt = (x) => ({ normalIJK: [1, 0, 0], pointIJK: [x, 256, 1024] });
const axialAt = (z) => ({ normalIJK: [0, 0, 1], pointIJK: [256, 256, z] });

describe('scoreBrick', () => {
  it('scores a brick cut by the plane as zero', () => {
    const { distance } = scoreBrick(
      { level: 'd1', kx: 4, ky: 0, kz: 0 },
      { levels, planes: [sagittalAt(256)] }
    );

    expect(distance).toBe(0);
  });

  it('scores by surface distance for bricks the plane misses', () => {
    const near = scoreBrick(
      { level: 'd1', kx: 5, ky: 0, kz: 0 },
      { levels, planes: [sagittalAt(256)] }
    );
    const far = scoreBrick(
      { level: 'd1', kx: 7, ky: 0, kz: 0 },
      { levels, planes: [sagittalAt(256)] }
    );

    expect(near.distance).toBeGreaterThan(0);
    expect(far.distance).toBeGreaterThan(near.distance);
  });

  it('treats every brick equally when nothing is displayed', () => {
    const { distance } = scoreBrick(
      { level: 'd1', kx: 7, ky: 7, kz: 31 },
      { levels, planes: [] }
    );

    expect(distance).toBe(0);
  });

  it('ignores a degenerate plane normal', () => {
    const { distance } = scoreBrick(
      { level: 'd1', kx: 7, ky: 0, kz: 0 },
      {
        levels,
        planes: [{ normalIJK: [0, 0, 0], pointIJK: [0, 0, 0] }],
      }
    );

    expect(distance).toBe(0);
  });

  it('treats a brick from an unknown level as unscored rather than throwing', () => {
    const { distance } = scoreBrick(
      { level: 'd99', kx: 0, ky: 0, kz: 0 },
      { levels, planes: [sagittalAt(256)] }
    );

    expect(distance).toBe(0);
  });

  it('scales a coarse brick"s extent by its factors, not just its centre', () => {
    // A d4_4_1 brick is 64 voxels wide at 4x, so it spans 256 base voxels: a
    // sagittal plane at x=200 cuts kx=0, whose centre sits at base x=126.
    // Scoring the extent unscaled would make the half-width 32 instead of 128 and
    // report the plane as 42 voxels away, losing the brick its priority.
    const { distance } = scoreBrick(
      { level: 'd4_4_1', kx: 0, ky: 0, kz: 0 },
      {
        levels: anisotropic.levelsByName,
        planes: [{ normalIJK: [1, 0, 0], pointIJK: [200, 64, 87] }],
      }
    );

    expect(distance).toBe(0);
  });
});

describe('level rank', () => {
  const ladderLevels = ladder.levelsByName;

  it('sorts coarse levels ahead of fine ones', () => {
    expect(levelRank(ladderLevels.get('d8'))).toBeLessThan(
      levelRank(ladderLevels.get('d4'))
    );
    expect(levelRank(ladderLevels.get('d4'))).toBeLessThan(
      levelRank(ladderLevels.get('d1'))
    );
  });

  it('ranks anisotropic levels by size, which no single factor could express', () => {
    const names = anisotropic.levels.map((entry) => entry.name);

    // parseBrickManifest sorts coarsest first, and d8_8_2 is coarsest despite
    // reducing z by only 2.
    expect(names).toEqual(['d8_8_2', 'd4_4_1', 'd1']);
    expect(levelRank(anisotropic.levelsByName.get('d8_8_2'))).toBeLessThan(
      levelRank(anisotropic.levelsByName.get('d4_4_1'))
    );
  });

  it('puts every coarse brick before any fine brick, whatever the geometry', () => {
    // The case this exists for: a second panel comes on screen mid-refine and
    // queues its d1 bricks. Without a level rank those interleave with the d4
    // bricks already in flight and the image sharpens in patches.
    const fine = { level: 'd1', kx: 0, ky: 0, kz: 0 };
    const coarseFarAway = { level: 'd4', kx: 3, ky: 3, kz: 3 };

    const ordered = prioritiseBricks([fine, coarseFarAway], {
      levels: ladderLevels,
      planes: [{ normalIJK: [0, 0, 1], pointIJK: [0, 0, 0] }],
    });

    expect(ordered.map((b) => b.level)).toEqual(['d4', 'd1']);
  });

  it('still orders by visibility within a level', () => {
    const near = { level: 'd1', kx: 0, ky: 0, kz: 0 };
    const far = { level: 'd1', kx: 0, ky: 0, kz: 8 };

    const ordered = prioritiseBricks([far, near], {
      levels: ladderLevels,
      planes: [{ normalIJK: [0, 0, 1], pointIJK: [0, 0, 0] }],
    });

    expect(ordered[0]).toBe(near);
  });
});

describe('prioritiseBricks', () => {
  const all = enumerateBricks(level);

  it('puts the displayed sagittal slab first', () => {
    const ordered = prioritiseBricks(all, {
      levels,
      planes: [sagittalAt(256)],
    });

    // 8 ky x 32 kz bricks share kx = 4.
    const slab = ordered.slice(0, 8 * 32);
    expect(new Set(slab.map((b) => b.kx))).toEqual(new Set([4]));
  });

  it('sharpens the middle of the view before its corners', () => {
    const ordered = prioritiseBricks(all, {
      levels,
      planes: [sagittalAt(256)],
    });

    // Within the slab, the brick nearest the focal point leads.
    expect(ordered[0]).toMatchObject({ kx: 4, ky: 4, kz: 16 });
  });

  it('serves several displayed orientations at once', () => {
    const ordered = prioritiseBricks(all, {
      levels,
      planes: [sagittalAt(256), axialAt(1024)],
    });

    // Everything scoring zero belongs to one slab or the other.
    const zeroScored = ordered.filter(
      (b) =>
        scoreBrick(b, {
          levels,
          planes: [sagittalAt(256), axialAt(1024)],
        }).distance === 0
    );

    expect(zeroScored.every((b) => b.kx === 4 || b.kz === 16)).toBe(true);
    expect(ordered.slice(0, zeroScored.length)).toEqual(zeroScored);
  });

  it('leaves order untouched when no plane is displayed', () => {
    const ordered = prioritiseBricks(all, {
      levels,
      planes: [],
    });

    expect(ordered).toEqual(all);
  });

  it('does not mutate its input', () => {
    const input = enumerateBricks(level);
    const snapshot = [...input];

    prioritiseBricks(input, {
      levels,
      planes: [sagittalAt(256)],
    });

    expect(input).toEqual(snapshot);
  });
});

describe('BrickQueue', () => {
  it('de-duplicates and tracks size', () => {
    const queue = new BrickQueue(levels);
    const coord = { level: 'd1', kx: 1, ky: 1, kz: 1 };

    queue.add([coord, { ...coord }]);

    expect(queue.size).toBe(1);
    expect(queue.has(coord)).toBe(true);
  });

  it('hands out bricks in priority order and removes them', () => {
    const queue = new BrickQueue(levels, [sagittalAt(256)]);
    queue.add(enumerateBricks(level));

    const first = queue.take(10);

    expect(first).toHaveLength(10);
    expect(first.every((b) => b.kx === 4)).toBe(true);
    expect(queue.size).toBe(level.brickCount - 10);
    expect(queue.has(first[0])).toBe(false);
  });

  it('re-orders what is left when the camera moves', () => {
    const queue = new BrickQueue(levels, [sagittalAt(64)]);
    queue.add(enumerateBricks(level));

    expect(queue.take(1)[0].kx).toBe(1);

    // Scrolling to a different sagittal position re-targets the queue.
    queue.setPlanes([sagittalAt(448)]);
    expect(queue.take(1)[0].kx).toBe(7);
  });

  it('drops completed bricks so they are never re-issued', () => {
    const queue = new BrickQueue(levels);
    const coord = { level: 'd1', kx: 2, ky: 2, kz: 2 };

    queue.add([coord]);
    queue.complete(coord);

    expect(queue.size).toBe(0);
    expect(queue.take(5)).toEqual([]);
  });

  it('clears everything on cancellation', () => {
    const queue = new BrickQueue(levels, [sagittalAt(256)]);
    queue.add(enumerateBricks(level));

    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.take(1)).toEqual([]);
  });
});
