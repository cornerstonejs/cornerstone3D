import {
  packedIndex,
  writeBrickIntoVolume,
} from '../../src/loaders/brick/deinterleaveBrick';

const BRICK = [4, 4, 4];

/**
 * Packs a 3D brick into the 2D layout a codestream would hold, so tests
 * exercise the same ordering the generator writes.
 */
const packBrick = (values, brickSize, brickOrder) => {
  const packed = new Uint16Array(brickSize[0] * brickSize[1] * brickSize[2]);

  for (let z = 0; z < brickSize[2]; z++) {
    for (let y = 0; y < brickSize[1]; y++) {
      for (let x = 0; x < brickSize[0]; x++) {
        packed[packedIndex(x, y, z, brickSize, brickOrder)] =
          values(x, y, z) ?? 0;
      }
    }
  }

  return packed;
};

/** Distinct value per voxel so any mis-ordering shows up as a mismatch. */
const rampValue = (x, y, z) => 1 + x + y * 10 + z * 100;

describe('packedIndex', () => {
  it('puts the through-plane axis on the fast vertical direction for z-minor', () => {
    // Row r = y * bz + z, so (x, y, z) and (x, y, z+1) are adjacent rows and
    // the JPEG-LS predictor's above-neighbour is a true 3D neighbour.
    const a = packedIndex(2, 1, 0, BRICK, 'z-minor');
    const b = packedIndex(2, 1, 1, BRICK, 'z-minor');

    expect(b - a).toBe(BRICK[0]);
  });

  it('puts the in-plane axis on the vertical direction for plane-major', () => {
    const a = packedIndex(2, 0, 1, BRICK, 'plane-major');
    const b = packedIndex(2, 1, 1, BRICK, 'plane-major');

    expect(b - a).toBe(BRICK[0]);
  });

  it('is a bijection over the brick for both orders', () => {
    for (const order of ['z-minor', 'plane-major']) {
      const seen = new Set();
      for (let z = 0; z < BRICK[2]; z++) {
        for (let y = 0; y < BRICK[1]; y++) {
          for (let x = 0; x < BRICK[0]; x++) {
            seen.add(packedIndex(x, y, z, BRICK, order));
          }
        }
      }
      expect(seen.size).toBe(BRICK[0] * BRICK[1] * BRICK[2]);
    }
  });
});

describe('modality LUT', () => {
  // Bricks hold raw stored values. A CT with RescaleIntercept -1024 is 0..4095
  // on disk but must be -1024..3071 HU in the volume; skipping this leaves
  // every voxel offset, so air sits mid-window and the image renders uniformly
  // grey with no black background.
  const sourceSize = [2, 2, 2];
  const source = new Uint16Array(2 * (2 * 2));
  // Stored value 24 is roughly air for a 12-bit CT with intercept -1024.
  source.fill(24);

  const scatter = (scaling) => {
    const dest = new Int16Array(2 * 2 * 2);
    writeBrickIntoVolume({
      source,
      sourceSize,
      brickOrder: 'z-minor',
      extent: [2, 2, 2],
      originVoxel: [0, 0, 0],
      dest,
      destDimensions: [2, 2, 2],
      scaling,
    });
    return dest;
  };

  it('applies slope and intercept', () => {
    expect(
      Array.from(scatter({ rescaleSlope: 1, rescaleIntercept: -1024 }))
    ).toEqual(new Array(8).fill(-1000));
  });

  it('leaves values untouched when absent or identity', () => {
    expect(Array.from(scatter(undefined))).toEqual(new Array(8).fill(24));
    expect(
      Array.from(scatter({ rescaleSlope: 1, rescaleIntercept: 0 }))
    ).toEqual(new Array(8).fill(24));
  });

  it('applies a non-unit slope', () => {
    expect(
      Array.from(scatter({ rescaleSlope: 2, rescaleIntercept: -100 }))
    ).toEqual(new Array(8).fill(-52));
  });
});

describe('writeBrickIntoVolume', () => {
  it.each(['z-minor', 'plane-major'])(
    'round-trips a brick at matching resolution (%s)',
    (brickOrder) => {
      const destDimensions = [4, 4, 4];
      const dest = new Uint16Array(64);

      const result = writeBrickIntoVolume({
        source: packBrick(rampValue, BRICK, brickOrder),
        sourceSize: BRICK,
        brickOrder,
        extent: [4, 4, 4],
        originVoxel: [0, 0, 0],
        dest,
        destDimensions,
      });

      expect(result.voxelsWritten).toBe(64);
      expect(result.zStart).toBe(0);
      expect(result.zEnd).toBe(3);

      for (let z = 0; z < 4; z++) {
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            expect(dest[x + y * 4 + z * 16]).toBe(rampValue(x, y, z));
          }
        }
      }
    }
  );

  it('places a brick at its origin without touching neighbours', () => {
    const destDimensions = [8, 8, 8];
    const dest = new Uint16Array(512);

    const result = writeBrickIntoVolume({
      source: packBrick(() => 7, BRICK, 'z-minor'),
      sourceSize: BRICK,
      brickOrder: 'z-minor',
      extent: [4, 4, 4],
      originVoxel: [4, 4, 4],
      dest,
      destDimensions,
    });

    expect(result.zStart).toBe(4);
    expect(result.zEnd).toBe(7);
    // The written octant is filled...
    expect(dest[4 + 4 * 8 + 4 * 64]).toBe(7);
    expect(dest[7 + 7 * 8 + 7 * 64]).toBe(7);
    // ...and nothing else is.
    expect(dest[0]).toBe(0);
    expect(dest[3 + 3 * 8 + 3 * 64]).toBe(0);
    expect(dest.reduce((n, v) => n + (v === 7 ? 1 : 0), 0)).toBe(64);
  });

  it('writes only the occupied extent of an edge brick', () => {
    // Volume is 6 wide, brick is 4, so the second brick holds just 2 columns.
    const destDimensions = [6, 4, 4];
    const dest = new Uint16Array(96);

    const result = writeBrickIntoVolume({
      source: packBrick(() => 5, BRICK, 'z-minor'),
      sourceSize: BRICK,
      brickOrder: 'z-minor',
      extent: [2, 4, 4],
      originVoxel: [4, 0, 0],
      dest,
      destDimensions,
    });

    expect(result.voxelsWritten).toBe(2 * 4 * 4);
    expect(dest[4]).toBe(5);
    expect(dest[5]).toBe(5);
    // Column 3 belongs to the first brick and must be untouched.
    expect(dest[3]).toBe(0);
  });

  it('nearest-upsamples a coarse brick into a full-extent buffer', () => {
    const destDimensions = [8, 8, 8];
    const dest = new Uint16Array(512);

    const result = writeBrickIntoVolume({
      source: packBrick(rampValue, BRICK, 'z-minor'),
      sourceSize: BRICK,
      brickOrder: 'z-minor',
      extent: [4, 4, 4],
      originVoxel: [0, 0, 0],
      dest,
      destDimensions,
      factor: [2, 2, 2],
    });

    expect(result.voxelsWritten).toBe(512);
    expect(result.zStart).toBe(0);
    expect(result.zEnd).toBe(7);

    // Every 2x2x2 destination block holds one source value.
    for (let z = 0; z < 8; z++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const expected = rampValue(x >> 1, y >> 1, z >> 1);
          expect(dest[x + y * 8 + z * 64]).toBe(expected);
        }
      }
    }
  });

  it('clips an upsampled coarse level that overhangs the base dimensions', () => {
    // A ceil-rounded coarse level covers 8 voxels once upsampled, but the
    // volume is only 7 -> the overhang must be dropped, not wrapped.
    const destDimensions = [7, 7, 7];
    const dest = new Uint16Array(343);

    const result = writeBrickIntoVolume({
      source: packBrick(() => 9, BRICK, 'z-minor'),
      sourceSize: BRICK,
      brickOrder: 'z-minor',
      extent: [4, 4, 4],
      originVoxel: [0, 0, 0],
      dest,
      destDimensions,
      factor: [2, 2, 2],
    });

    expect(result.zEnd).toBe(6);
    expect(dest.every((v) => v === 9)).toBe(true);
    expect(result.voxelsWritten).toBe(343);
  });

  it('reports nothing written for a degenerate extent', () => {
    const dest = new Uint16Array(64);
    const result = writeBrickIntoVolume({
      source: new Uint16Array(64),
      sourceSize: BRICK,
      brickOrder: 'z-minor',
      extent: [0, 4, 4],
      originVoxel: [0, 0, 0],
      dest,
      destDimensions: [4, 4, 4],
    });

    expect(result).toEqual({ voxelsWritten: 0, zStart: -1, zEnd: -1 });
    expect(dest.every((v) => v === 0)).toBe(true);
  });

  it('drops a brick whose origin is outside the destination', () => {
    const dest = new Uint16Array(64);
    const result = writeBrickIntoVolume({
      source: packBrick(() => 3, BRICK, 'z-minor'),
      sourceSize: BRICK,
      brickOrder: 'z-minor',
      extent: [4, 4, 4],
      originVoxel: [8, 0, 0],
      dest,
      destDimensions: [4, 4, 4],
    });

    expect(result.voxelsWritten).toBe(0);
    expect(dest.every((v) => v === 0)).toBe(true);
  });
});

describe('unpadded and non-cubic bricks', () => {
  // Version 2 stores every brick at its true extent, so the packed row stride
  // comes from that extent rather than from the level's brick size. An edge brick
  // and a coarse level's single level-shaped brick are both non-cubic.
  for (const order of ['z-minor', 'plane-major']) {
    it(`round-trips a non-cubic brick with ${order}`, () => {
      // The Juno coarse level in miniature: as wide and tall as a brick, but
      // deeper, because the whole level is one object.
      const sourceSize = [4, 4, 7];
      const source = packBrick(rampValue, sourceSize, order);
      const dest = new Uint16Array(4 * 4 * 7);

      writeBrickIntoVolume({
        source,
        sourceSize,
        brickOrder: order,
        extent: sourceSize,
        originVoxel: [0, 0, 0],
        dest,
        destDimensions: sourceSize,
      });

      for (let z = 0; z < 7; z++) {
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            expect(dest[x + y * 4 + z * 16]).toBe(rampValue(x, y, z));
          }
        }
      }
    });

    it(`reads an unpadded edge brick at its own stride with ${order}`, () => {
      // A trailing z brick holding 2 of a possible 4 slices. Its rows are
      // y * 2 + z for z-minor, not y * 4 + z: taking the stride from the brick
      // size would read the wrong row for every y > 0.
      const sourceSize = [4, 4, 2];
      const source = packBrick(rampValue, sourceSize, order);
      const dest = new Uint16Array(4 * 4 * 4);

      writeBrickIntoVolume({
        source,
        sourceSize,
        brickOrder: order,
        extent: sourceSize,
        originVoxel: [0, 0, 2],
        dest,
        destDimensions: [4, 4, 4],
      });

      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          expect(dest[x + y * 4 + 2 * 16]).toBe(rampValue(x, y, 0));
          expect(dest[x + y * 4 + 3 * 16]).toBe(rampValue(x, y, 1));
        }
      }
    });
  }

  it('upsamples by a different factor on each axis', () => {
    // A d8_8_2-style level written into a full-extent buffer: 2x in-plane and
    // 1x through-plane here, so one source voxel becomes a 2x2x1 block. Applying
    // a single factor to all three axes would write every other slice wrong.
    const sourceSize = [2, 2, 2];
    const source = packBrick(rampValue, sourceSize, 'z-minor');
    const dest = new Uint16Array(4 * 4 * 2);

    writeBrickIntoVolume({
      source,
      sourceSize,
      brickOrder: 'z-minor',
      extent: sourceSize,
      originVoxel: [0, 0, 0],
      dest,
      destDimensions: [4, 4, 2],
      factor: [2, 2, 1],
    });

    for (let z = 0; z < 2; z++) {
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          expect(dest[x + y * 4 + z * 16]).toBe(
            rampValue(Math.floor(x / 2), Math.floor(y / 2), z)
          );
        }
      }
    }
  });
});
