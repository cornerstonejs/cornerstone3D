import { packedIndex } from '../../src/loaders/brick/deinterleaveBrick';
import { levelFactors } from '../../src/loaders/brick/brickManifest';

/**
 * Builds an in-memory brick store from a synthetic volume.
 *
 * Lets the loader be exercised end to end with no network, no WASM and no
 * dependency on the generator in static-dicomweb. The "codestream" is just the
 * packed voxels, so `decodeBrick` reinterprets rather than decompresses — the
 * packing, addressing, scatter and upsample paths are all still real.
 *
 * Levels may be bare names (`'d2'`), per-axis names (`'d8_8_2'`), or specs
 * carrying their own `brickSize`, which is how a coarse level small enough to be
 * one request is written.
 */
export function buildBrickStoreFixture({
  dimensions = [16, 16, 16],
  brickSize = [8, 8, 8],
  levels = ['d1', 'd2'],
  brickOrder = 'z-minor',
  /**
   * Whether edge bricks are padded out to the full brick size. The generator
   * writes them unpadded; the padded path is kept so the version 1 layout stays
   * covered.
   */
  brickPadding = false,
  value = (x, y, z) => 1 + x + y * 16 + z * 256,
  baseUrl = 'https://host/series/1/brick/',
} = {}) {
  const [dx, dy, dz] = dimensions;

  // Full-resolution source, which assertions compare against.
  const source = new Uint16Array(dx * dy * dz);
  for (let z = 0; z < dz; z++) {
    for (let y = 0; y < dy; y++) {
      for (let x = 0; x < dx; x++) {
        source[x + y * dx + z * dx * dy] = value(x, y, z);
      }
    }
  }

  const specs = levels.map((entry) => {
    const spec = typeof entry === 'string' ? { name: entry } : { ...entry };
    const factors = spec.factors ?? levelFactors(spec.name);
    const size =
      spec.size ??
      [dx, dy, dz].map((base, axis) =>
        Math.max(1, Math.ceil(base / factors[axis]))
      );

    return {
      ...spec,
      factors,
      size,
      brickSize: spec.brickSize ?? brickSize,
    };
  });

  const levelData = new Map();

  // Box-filtered reduction, matching what the generator must do. Decimating
  // instead would alias, which is a correctness bug rather than a quality one.
  // The box is per axis, so a level that reduces only in-plane averages 2x2x1.
  for (const spec of specs) {
    const [fx, fy, fz] = spec.factors;
    const [ldx, ldy, ldz] = spec.size;
    const data = new Uint16Array(ldx * ldy * ldz);

    for (let z = 0; z < ldz; z++) {
      for (let y = 0; y < ldy; y++) {
        for (let x = 0; x < ldx; x++) {
          let sum = 0;
          let count = 0;

          for (let sz = z * fz; sz < Math.min((z + 1) * fz, dz); sz++) {
            for (let sy = y * fy; sy < Math.min((y + 1) * fy, dy); sy++) {
              for (let sx = x * fx; sx < Math.min((x + 1) * fx, dx); sx++) {
                sum += source[sx + sy * dx + sz * dx * dy];
                count += 1;
              }
            }
          }

          data[x + y * ldx + z * ldx * ldy] = count
            ? Math.round(sum / count)
            : 0;
        }
      }
    }

    levelData.set(spec.name, { dimensions: spec.size, data });
  }

  const manifest = {
    version: 2,
    axes: [
      { name: 'x', type: 'space', size: dx, subsample: true },
      { name: 'y', type: 'space', size: dy, subsample: true },
      { name: 'z', type: 'space', size: dz, subsample: true },
    ],
    brickSize,
    brickOrder,
    brickPadding,
    levels: specs.map((spec) => ({
      name: spec.name,
      factors: spec.factors,
      size: spec.size,
      brickSize: spec.brickSize,
    })),
    transferSyntaxUID: '1.2.840.10008.1.2.4.80',
  };

  // url -> { bytes, extent }
  const store = new Map();
  const requested = [];

  store.set(`${baseUrl}manifest.json`, {
    bytes: new TextEncoder().encode(JSON.stringify(manifest)),
  });

  for (const spec of specs) {
    const { data } = levelData.get(spec.name);
    const ldims = spec.size;
    const bsize = spec.brickSize;
    const grid = [0, 1, 2].map((axis) => Math.ceil(ldims[axis] / bsize[axis]));

    for (let kz = 0; kz < grid[2]; kz++) {
      for (let ky = 0; ky < grid[1]; ky++) {
        for (let kx = 0; kx < grid[0]; kx++) {
          const origin = [kx * bsize[0], ky * bsize[1], kz * bsize[2]];
          const extent = [0, 1, 2].map((axis) =>
            Math.min(bsize[axis], ldims[axis] - origin[axis])
          );
          // The dimensions the codestream is packed at: the brick's true extent,
          // or the full brick size when the store pads its edges.
          const packedSize = brickPadding ? bsize : extent;
          const packed = new Uint16Array(
            packedSize[0] * packedSize[1] * packedSize[2]
          );

          for (let bz = 0; bz < extent[2]; bz++) {
            for (let by = 0; by < extent[1]; by++) {
              for (let bx = 0; bx < extent[0]; bx++) {
                const sx = origin[0] + bx;
                const sy = origin[1] + by;
                const sz = origin[2] + bz;

                packed[packedIndex(bx, by, bz, packedSize, brickOrder)] =
                  data[sx + sy * ldims[0] + sz * ldims[0] * ldims[1]];
              }
            }
          }

          store.set(
            `${baseUrl}${spec.name}/k${String(kz).padStart(3, '0')}/y${ky}x${kx}.jls`,
            {
              bytes: new Uint8Array(packed.buffer.slice(0)),
              extent: packedSize,
            }
          );
        }
      }
    }
  }

  const fetchBrick = async (url) => {
    requested.push(url);

    const entry = store.get(url);

    if (!entry) {
      throw new Error(`fixture has no object at ${url}`);
    }

    return entry.bytes;
  };

  const decodeBrick = async (bytes) => ({
    pixelData: new Uint16Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / 2
    ),
    // Only the sample count is meaningful to the loader, which takes the packed
    // shape from the manifest; report something consistent regardless.
    columns: brickSize[0],
    rows: bytes.byteLength / 2 / brickSize[0],
  });

  return {
    baseUrl,
    manifest,
    source,
    dimensions,
    levelData,
    store,
    fetchBrick,
    decodeBrick,
    /** URLs requested so far, for asserting fetch order. */
    requested,
    /** Brick URLs only, in request order. */
    brickRequests: () => requested.filter((u) => u.endsWith('.jls')),
  };
}
