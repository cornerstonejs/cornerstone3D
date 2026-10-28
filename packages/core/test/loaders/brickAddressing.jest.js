import {
  parseBrickManifest,
  levelFactors,
  brickGridFor,
  dimensionsAtFactors,
  pickCoarseLevel,
} from '../../src/loaders/brick/brickManifest';
import {
  brickKey,
  brickPath,
  brickUrl,
  brickExtent,
  brickOriginVoxel,
  enumerateBricks,
  bricksForPlane,
  worldPlaneToIndex,
} from '../../src/loaders/brick/brickAddressing';

const createManifest = (overrides = {}) => ({
  version: 1,
  axes: [
    { name: 'x', type: 'space', size: 512, subsample: true },
    { name: 'y', type: 'space', size: 512, subsample: true },
    { name: 'z', type: 'space', size: 2048, subsample: true },
  ],
  brickSize: [64, 64, 64],
  brickOrder: 'z-minor',
  levels: ['d1', 'd2', 'd4', 'd8'],
  transferSyntaxUID: '1.2.840.10008.1.2.4.80',
  ...overrides,
});

const create4DManifest = () =>
  createManifest({
    axes: [
      { name: 'x', type: 'space', size: 128, subsample: true },
      { name: 'y', type: 'space', size: 128, subsample: true },
      { name: 'z', type: 'space', size: 128, subsample: true },
      { name: 't', type: 'time', size: 20, subsample: false },
    ],
    levels: ['d1', 'd2'],
  });

describe('brickManifest', () => {
  it('parses level names into downsample factors', () => {
    expect(levelFactors('d1')).toEqual([1, 1, 1]);
    expect(levelFactors('d32')).toEqual([32, 32, 32]);
    // Per-axis form, which is what an anisotropic series produces
    expect(levelFactors('d8_8_2')).toEqual([8, 8, 2]);
    expect(levelFactors('d4_4_1')).toEqual([4, 4, 1]);
    expect(() => levelFactors('coarse')).toThrow(/d<fx>_<fy>_<fz>/);
    expect(() => levelFactors('d0')).toThrow();
    expect(() => levelFactors('d8_8')).toThrow();
  });

  it('derives dimensions and brick grids for bare level names', () => {
    const manifest = parseBrickManifest(createManifest());

    const d1 = manifest.levelsByName.get('d1');
    expect(d1.dimensions).toEqual([512, 512, 2048]);
    expect(d1.brickGrid).toEqual([8, 8, 32]);
    expect(d1.brickCount).toBe(2048);

    const d8 = manifest.levelsByName.get('d8');
    expect(d8.dimensions).toEqual([64, 64, 256]);
    expect(d8.brickGrid).toEqual([1, 1, 4]);
  });

  it('orders levels coarsest first so a walk goes coarse to fine', () => {
    const manifest = parseBrickManifest(createManifest());
    expect(manifest.levels.map((level) => level.name)).toEqual([
      'd8',
      'd4',
      'd2',
      'd1',
    ]);
  });

  it('separates spatial from indexed axes', () => {
    const manifest = parseBrickManifest(create4DManifest());
    expect(manifest.spatialAxes.map((a) => a.name)).toEqual(['x', 'y', 'z']);
    expect(manifest.indexedAxes.map((a) => a.name)).toEqual(['t']);
    expect(manifest.baseDimensions).toEqual([128, 128, 128]);
  });

  it('rejects a store whose third index is temporal rather than spatial', () => {
    const manifest = createManifest({
      axes: [
        { name: 'x', type: 'space', size: 512, subsample: true },
        { name: 'y', type: 'space', size: 512, subsample: true },
        { name: 't', type: 'time', size: 60, subsample: false },
      ],
    });

    expect(() => parseBrickManifest(manifest)).toThrow(
      /Expected exactly 3 spatial axes/
    );
  });

  it('rejects an unknown brick order and a missing transfer syntax', () => {
    expect(() =>
      parseBrickManifest(createManifest({ brickOrder: 'diagonal' }))
    ).toThrow(/Unknown brickOrder/);

    expect(() =>
      parseBrickManifest(createManifest({ transferSyntaxUID: undefined }))
    ).toThrow(/transferSyntaxUID/);
  });

  it('rejects a declared brick grid that contradicts size and brickSize', () => {
    const manifest = createManifest({
      levels: [{ name: 'd1', size: [512, 512, 2048], bricks: [8, 8, 8] }],
    });

    expect(() => parseBrickManifest(manifest)).toThrow(/brick grid/);
  });

  it('keeps a partial trailing voxel when reducing', () => {
    // 100 / 8 = 12.5 -> 13, so the tail is preserved rather than dropped.
    expect(dimensionsAtFactors([100, 100, 100], [8, 8, 8])).toEqual([
      13, 13, 13,
    ]);
    expect(brickGridFor([13, 13, 13], [64, 64, 64])).toEqual([1, 1, 1]);
  });

  it('picks the coarsest level that still has usable extent', () => {
    const manifest = parseBrickManifest(createManifest());
    expect(pickCoarseLevel(manifest, 32).name).toBe('d8');
    // Nothing qualifies at this bound, so it falls back to the finest level.
    expect(pickCoarseLevel(manifest, 4096).name).toBe('d1');
  });
});

describe('brickAddressing', () => {
  it('builds paths with no index component for a 3D series', () => {
    const manifest = parseBrickManifest(createManifest());
    const coord = { level: 'd1', kx: 3, ky: 5, kz: 16 };

    expect(brickPath(manifest, coord)).toBe('d1/k016/y5x3.jls');
    expect(brickUrl('https://host/series/1/brick', manifest, coord)).toBe(
      'https://host/series/1/brick/d1/k016/y5x3.jls'
    );
    // A trailing slash on the base must not double up.
    expect(brickUrl('https://host/series/1/brick/', manifest, coord)).toBe(
      'https://host/series/1/brick/d1/k016/y5x3.jls'
    );
  });

  it('includes one path component per non-spatial axis', () => {
    const manifest = parseBrickManifest(create4DManifest());
    const coord = { level: 'd1', kx: 1, ky: 0, kz: 1, indices: [7] };

    expect(brickPath(manifest, coord)).toBe('d1/t007/k001/y0x1.jls');
  });

  it('rejects a coordinate whose index count does not match the store', () => {
    const manifest = parseBrickManifest(create4DManifest());

    expect(() =>
      brickPath(manifest, { level: 'd1', kx: 0, ky: 0, kz: 0 })
    ).toThrow(/Expected 1 non-spatial/);

    expect(() =>
      brickPath(manifest, { level: 'd1', kx: 0, ky: 0, kz: 0, indices: [20] })
    ).toThrow(/out of range/);
  });

  it('produces stable distinct keys', () => {
    const a = brickKey({ level: 'd1', kx: 1, ky: 2, kz: 3 });
    const b = brickKey({ level: 'd1', kx: 1, ky: 2, kz: 3 });
    const c = brickKey({ level: 'd2', kx: 1, ky: 2, kz: 3 });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('clips the extent of edge bricks', () => {
    // 100 voxels of z with 64-brick depth: the second brick holds only 36.
    const manifest = parseBrickManifest(
      createManifest({
        axes: [
          { name: 'x', type: 'space', size: 100, subsample: true },
          { name: 'y', type: 'space', size: 64, subsample: true },
          { name: 'z', type: 'space', size: 100, subsample: true },
        ],
        levels: ['d1'],
      })
    );
    const level = manifest.levelsByName.get('d1');

    expect(
      brickOriginVoxel(level, { level: 'd1', kx: 1, ky: 0, kz: 1 })
    ).toEqual([64, 0, 64]);

    expect(brickExtent(level, { level: 'd1', kx: 0, ky: 0, kz: 0 })).toEqual([
      64, 64, 64,
    ]);

    expect(brickExtent(level, { level: 'd1', kx: 1, ky: 0, kz: 1 })).toEqual([
      36, 64, 36,
    ]);
  });

  it('enumerates a level z-slowest', () => {
    const manifest = parseBrickManifest(createManifest());
    const level = manifest.levelsByName.get('d8');
    const coords = enumerateBricks(level);

    expect(coords).toHaveLength(level.brickCount);
    expect(coords[0]).toMatchObject({ kx: 0, ky: 0, kz: 0 });
    expect(coords[coords.length - 1]).toMatchObject({ kx: 0, ky: 0, kz: 3 });
  });

  describe('bricksForPlane', () => {
    const manifest = parseBrickManifest(createManifest());
    const level = manifest.levelsByName.get('d1');

    it('selects a single k-slab for an axial plane', () => {
      // Axial: normal along z, through z = 1024 -> brick kz = 16.
      const hits = bricksForPlane(level, [0, 0, 1], [256, 256, 1024]);

      expect(hits).toHaveLength(64);
      expect(new Set(hits.map((h) => h.kz))).toEqual(new Set([16]));
    });

    it('selects a single kx column for a sagittal plane', () => {
      const hits = bricksForPlane(level, [1, 0, 0], [256, 256, 1024]);

      // 8 ky x 32 kz, all sharing kx = 4.
      expect(hits).toHaveLength(8 * 32);
      expect(new Set(hits.map((h) => h.kx))).toEqual(new Set([4]));
    });

    it('selects a single ky row for a coronal plane', () => {
      const hits = bricksForPlane(level, [0, 1, 0], [256, 256, 1024]);

      expect(hits).toHaveLength(8 * 32);
      expect(new Set(hits.map((h) => h.ky))).toEqual(new Set([4]));
    });

    it('handles an oblique plane without special casing', () => {
      const hits = bricksForPlane(level, [1, 1, 0], [256, 256, 1024]);

      // A 45 degree plane cuts a diagonal band, so it touches more than one
      // kx and more than one ky but far fewer than the whole level.
      expect(new Set(hits.map((h) => h.kx)).size).toBeGreaterThan(1);
      expect(hits.length).toBeLessThan(level.brickCount);
    });

    it('returns nothing for a degenerate normal', () => {
      expect(bricksForPlane(level, [0, 0, 0], [0, 0, 0])).toEqual([]);
    });

    // Voxel centres sit on integer indices, so a plane on a brick boundary
    // belongs to exactly one slab. Treating bricks as [origin, origin+size)
    // makes it graze both neighbours and doubles the fetch.
    it.each([
      ['first voxel of a brick', 1024, 16],
      ['last voxel of a brick', 1023, 15],
      ['interior of a brick', 1000, 15],
      ['volume start', 0, 0],
    ])('selects one slab at the %s', (_label, z, expectedKz) => {
      const hits = bricksForPlane(level, [0, 0, 1], [256, 256, z]);

      expect(new Set(hits.map((h) => h.kz))).toEqual(new Set([expectedKz]));
      expect(hits).toHaveLength(64);
    });
  });

  describe('worldPlaneToIndex', () => {
    it('scales the normal by spacing so anisotropy is respected', () => {
      const geometry = {
        origin: [0, 0, 0],
        spacing: [0.5, 0.5, 2],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      };

      const { normalIJK, pointIJK } = worldPlaneToIndex(
        [0, 0, 1],
        [10, 20, 40],
        geometry
      );

      // Ignoring the spacing term is the classic bug: the z component must
      // pick up the 2 mm spacing.
      expect(normalIJK).toEqual([0, 0, 2]);
      expect(pointIJK).toEqual([20, 40, 20]);
    });

    it('respects a non-identity direction matrix', () => {
      const geometry = {
        origin: [5, 0, 0],
        spacing: [1, 1, 1],
        // i axis along world -y, j along world x.
        direction: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      };

      const { normalIJK, pointIJK } = worldPlaneToIndex(
        [0, 1, 0],
        [5, 3, 0],
        geometry
      );

      expect(normalIJK).toEqual([-1, 0, 0]);
      expect(pointIJK).toEqual([-3, 0, 0]);
    });
  });
});
