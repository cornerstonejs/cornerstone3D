import { parseBrickManifest } from '../../src/loaders/brick/brickManifest';
import {
  brickPath,
  brickExtent,
  enumerateBricks,
  bricksForPlane,
} from '../../src/loaders/brick/brickAddressing';
import junoManifest from './fixtures/brickManifest.juno.json';

/**
 * Contract test against real generator output.
 *
 * The fixture is an unmodified `manifest.json` produced by static-dicomweb's
 * `alternates --brick` for the Juno CT series (512x512x174 at 0.977/0.977/5mm)
 * used by the volumeProgressive example. It exists so a change on either side of
 * the generator/loader boundary fails here rather than at runtime.
 *
 * Verified against the store on disk at generation time, by reading each
 * codestream's SOF55 marker:
 * - `d8_8_2/k000/y0x0.jls` is one 64 x 5568 image, 16-bit, single component —
 *   the whole coarse level in a single object;
 * - `d1/k000/y0x0.jls` is 64 x 4096, the full 64-cube;
 * - `d1/k002/y0x0.jls` is 64 x **2944**, i.e. 64 x (64 x 46) — the trailing z
 *   brick holds 46 slices and is stored at that extent rather than padded;
 * - 205 bricks total: 192 + 12 + 1.
 */
describe('brick generator contract', () => {
  const manifest = parseBrickManifest(junoManifest);

  it('parses real generator output', () => {
    expect(manifest.brickSize).toEqual([64, 64, 64]);
    expect(manifest.brickOrder).toBe('z-minor');
    // JPEG-LS lossless, not HTJ2K.
    expect(manifest.transferSyntaxUID).toBe('1.2.840.10008.1.2.4.80');
    expect(manifest.baseDimensions).toEqual([512, 512, 174]);
    expect(manifest.indexedAxes).toHaveLength(0);
    // Version 2 stores bricks unpadded, which is what sizes each decode.
    expect(manifest.brickPadding).toBe(false);
  });

  it('agrees with the generator on every level geometry', () => {
    // Declared sizes and brick grids must survive the parser's cross-check,
    // which recomputes the grid from size and the level's own brickSize.
    expect(
      manifest.levels.map((l) => [
        l.name,
        l.dimensions,
        l.brickSize,
        l.brickGrid,
      ])
    ).toEqual([
      ['d8_8_2', [64, 64, 87], [64, 64, 87], [1, 1, 1]],
      ['d4_4_1', [128, 128, 174], [64, 64, 64], [2, 2, 3]],
      ['d1', [512, 512, 174], [64, 64, 64], [8, 8, 3]],
    ]);
  });

  it('reduces in-plane before through-plane, because the slices are 5mm', () => {
    // 0.977mm pixels against 5mm slices is 5.1:1, so halving z as hard as x and y
    // would leave the coarse level with 22 slices over 870mm. The ladder brings
    // the fine axes in first instead, and only reduces z once they have caught up.
    expect(manifest.levelsByName.get('d4_4_1').factors).toEqual([4, 4, 1]);
    expect(manifest.levelsByName.get('d8_8_2').factors).toEqual([8, 8, 2]);

    // Which is to say the coarse level is near-isotropic in mm rather than in
    // voxels: 7.8 / 7.8 / 10 instead of 7.8 / 7.8 / 40.
    const spacing = junoManifest.spacing;
    const coarse = manifest.levelsByName.get('d8_8_2');
    const coarseSpacing = coarse.factors.map((f, axis) => f * spacing[axis]);

    expect(coarseSpacing[0]).toBeCloseTo(7.8125);
    expect(coarseSpacing[2]).toBeCloseTo(10);
  });

  it('resolves the full-resolution level by its factors, not by the name d1', () => {
    expect(manifest.baseLevel.name).toBe('d1');
    expect(manifest.baseLevel.factors).toEqual([1, 1, 1]);
  });

  it('orders levels coarsest first even though no single factor says so', () => {
    // d8_8_2 reduces z by only 2 but is much the smallest level, and fetch order
    // follows size.
    expect(manifest.levels.map((l) => l.voxelCount)).toEqual([
      64 * 64 * 87,
      128 * 128 * 174,
      512 * 512 * 174,
    ]);
  });

  it('addresses bricks at the paths the generator wrote', () => {
    expect(brickPath(manifest, { level: 'd8_8_2', kx: 0, ky: 0, kz: 0 })).toBe(
      'd8_8_2/k000/y0x0.jls'
    );
    expect(brickPath(manifest, { level: 'd1', kx: 7, ky: 0, kz: 0 })).toBe(
      'd1/k000/y0x7.jls'
    );
    // A brick confirmed present on disk, mid-volume.
    expect(brickPath(manifest, { level: 'd1', kx: 4, ky: 4, kz: 1 })).toBe(
      'd1/k001/y4x4.jls'
    );
  });

  it('sizes each decode from the level, since bricks are no longer all 64 x 4096', () => {
    const packed = (levelName, coord) => {
      const level = manifest.levelsByName.get(levelName);
      const [ex, ey, ez] = brickExtent(level, { level: levelName, ...coord });
      return { columns: ex, rows: ey * ez };
    };

    // The whole coarse level as one image, matching the SOF55 read off disk.
    expect(packed('d8_8_2', { kx: 0, ky: 0, kz: 0 })).toEqual({
      columns: 64,
      rows: 5568,
    });
    expect(packed('d1', { kx: 0, ky: 0, kz: 0 })).toEqual({
      columns: 64,
      rows: 4096,
    });
    // 174 slices over 3 bricks of 64: the last holds 46, and is stored at that
    // extent. Assuming 4096 rows here would decode 28% padding that is not there.
    expect(packed('d1', { kx: 0, ky: 0, kz: 2 })).toEqual({
      columns: 64,
      rows: 2944,
    });
  });

  it('clips the trailing z brick to the slices it actually holds', () => {
    const d1 = manifest.levelsByName.get('d1');

    expect(brickExtent(d1, { level: 'd1', kx: 0, ky: 0, kz: 2 })).toEqual([
      64, 64, 46,
    ]);

    expect(enumerateBricks(d1)).toHaveLength(192);
  });

  it('holds the whole coarse level in a single brick', () => {
    const coarse = manifest.levelsByName.get('d8_8_2');

    expect(coarse.brickCount).toBe(1);
    expect(enumerateBricks(coarse)).toHaveLength(1);
    // Which is the point: one request, and every orientation is displayable.
    expect(
      brickExtent(coarse, { level: 'd8_8_2', kx: 0, ky: 0, kz: 0 })
    ).toEqual([64, 64, 87]);
  });

  it('accounts for every brick the generator reported writing', () => {
    const total = manifest.levels.reduce(
      (sum, level) => sum + level.brickCount,
      0
    );

    expect(total).toBe(205);
  });

  it('selects one k-slab for axial and one column for sagittal', () => {
    const d1 = manifest.levelsByName.get('d1');
    const centre = [256, 256, 87];

    const axial = bricksForPlane(d1, [0, 0, 1], centre);
    expect(new Set(axial.map((b) => b.kz))).toEqual(new Set([1]));
    expect(axial).toHaveLength(64);

    const sagittal = bricksForPlane(d1, [1, 0, 0], centre);
    expect(new Set(sagittal.map((b) => b.kx))).toEqual(new Set([4]));
    // 8 ky x 3 kz — the whole depth, but only one column of x.
    expect(sagittal).toHaveLength(24);
    // The saving that justifies the store: an eighth of the level.
    expect(sagittal.length / d1.brickCount).toBeCloseTo(1 / 8);
  });
});
