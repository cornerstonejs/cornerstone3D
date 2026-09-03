import type { Point3 } from '../../types';
import type {
  BrickCoord,
  ResolvedBrickLevel,
  ResolvedBrickManifest,
} from './types';

/** File extension for stored bricks. JPEG-LS, per the generator contract. */
const BRICK_EXTENSION = '.jls';

/** Stable string form of a brick coordinate, for maps and de-duplication. */
export function brickKey(coord: BrickCoord): string {
  const indices = coord.indices?.length ? `${coord.indices.join(',')}/` : '';
  return `${coord.level}/${indices}${coord.kz}/${coord.ky}/${coord.kx}`;
}

/**
 * Builds the path of one brick relative to the store root.
 *
 * Layout is `{level}/{index components}/{k###}/y{ky}x{kx}.jls`, where `k` is
 * the brick index along z. Index components are emitted only for non-spatial
 * axes, so a plain 3D series has none — this must match the generator.
 *
 * @param manifest - Resolved manifest, for the indexed-axis count.
 * @param coord - The brick to address.
 * @returns Path relative to the store root, with no leading slash.
 */
export function brickPath(
  manifest: ResolvedBrickManifest,
  coord: BrickCoord
): string {
  const expected = manifest.indexedAxes.length;
  const indices = coord.indices ?? [];

  if (indices.length !== expected) {
    throw new Error(
      `[brick] Expected ${expected} non-spatial index/indices for this store, ` +
        `got ${indices.length}`
    );
  }

  const indexPath = indices
    .map((value, i) => {
      const axis = manifest.indexedAxes[i];
      if (!Number.isInteger(value) || value < 0 || value >= axis.size) {
        throw new Error(
          `[brick] Index ${value} out of range for axis "${axis.name}" ` +
            `(size ${axis.size})`
        );
      }
      return `${axis.name}${String(value).padStart(3, '0')}`;
    })
    .join('/');

  const k = `k${String(coord.kz).padStart(3, '0')}`;
  const leaf = `y${coord.ky}x${coord.kx}${BRICK_EXTENSION}`;

  return [coord.level, indexPath, k, leaf].filter(Boolean).join('/');
}

/**
 * Resolves a brick to an absolute URL.
 *
 * @param baseUrl - Store root, e.g. `https://host/studies/.../series/.../brick/`.
 * @param manifest - Resolved manifest.
 * @param coord - The brick to address.
 */
export function brickUrl(
  baseUrl: string,
  manifest: ResolvedBrickManifest,
  coord: BrickCoord
): string {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${root}${brickPath(manifest, coord)}`;
}

/** Voxel coordinate of a brick's origin, at its own level's resolution. */
export function brickOriginVoxel(
  level: ResolvedBrickLevel,
  coord: BrickCoord
): Point3 {
  const { brickSize } = level;

  return [
    coord.kx * brickSize[0],
    coord.ky * brickSize[1],
    coord.kz * brickSize[2],
  ];
}

/**
 * Occupied extent of a brick, clipped at the volume edge.
 *
 * An edge brick covers fewer voxels than the level's brick size, and is stored
 * at exactly this extent rather than padded out, so this is both what a writer
 * must scatter and the shape the codestream decodes to.
 */
export function brickExtent(
  level: ResolvedBrickLevel,
  coord: BrickCoord
): Point3 {
  const { brickSize } = level;
  const origin = brickOriginVoxel(level, coord);

  return [
    Math.max(0, Math.min(brickSize[0], level.dimensions[0] - origin[0])),
    Math.max(0, Math.min(brickSize[1], level.dimensions[1] - origin[1])),
    Math.max(0, Math.min(brickSize[2], level.dimensions[2] - origin[2])),
  ];
}

/**
 * Every brick in a level, for one non-spatial index combination.
 *
 * Iterates z-slowest so sequential consumption walks the volume in slab order,
 * which is also the order that touches the fewest z-slices at a time.
 */
export function enumerateBricks(
  level: ResolvedBrickLevel,
  indices: number[] = []
): BrickCoord[] {
  const coords: BrickCoord[] = [];
  const [nx, ny, nz] = level.brickGrid;

  for (let kz = 0; kz < nz; kz++) {
    for (let ky = 0; ky < ny; ky++) {
      for (let kx = 0; kx < nx; kx++) {
        coords.push({ level: level.name, kx, ky, kz, indices });
      }
    }
  }

  return coords;
}

/**
 * Bricks intersected by a plane, expressed in this level's index space.
 *
 * Uses the standard plane/AABB separating-axis test: a box intersects the plane
 * when the distance from its centre is within the box's projection radius onto
 * the normal. That works for oblique planes as well as orthogonal ones, so no
 * special-casing is needed.
 *
 * @param level - Level whose brick grid is being tested.
 * @param normalIJK - Plane normal in index space (see `worldPlaneToIndex`).
 * @param pointIJK - Any point on the plane, in index space.
 * @param toleranceVoxels - Extra slab half-thickness, in voxels.
 */
export function bricksForPlane(
  level: ResolvedBrickLevel,
  normalIJK: Point3,
  pointIJK: Point3,
  toleranceVoxels = 0
): BrickCoord[] {
  const { brickSize } = level;
  const length = Math.hypot(normalIJK[0], normalIJK[1], normalIJK[2]);

  if (!Number.isFinite(length) || length === 0) {
    return [];
  }

  const n: Point3 = [
    normalIJK[0] / length,
    normalIJK[1] / length,
    normalIJK[2] / length,
  ];

  // Projection radius of a brick-sized box onto the normal. Constant for all
  // interior bricks; edge bricks are smaller, so this over-selects slightly
  // rather than missing them.
  const radius =
    0.5 *
      (Math.abs(n[0]) * brickSize[0] +
        Math.abs(n[1]) * brickSize[1] +
        Math.abs(n[2]) * brickSize[2]) +
    toleranceVoxels;

  // Voxel centres sit on integer indices (DICOM places the origin at the centre
  // of voxel 0), so a brick starting at `origin` spans [origin - 0.5,
  // origin + size - 0.5] and its centre is `origin + (size - 1) / 2`. Using
  // `origin + size / 2` instead makes a plane lying exactly on a brick boundary
  // graze both neighbours and select two slabs where one is correct.
  const half: Point3 = [
    (brickSize[0] - 1) / 2,
    (brickSize[1] - 1) / 2,
    (brickSize[2] - 1) / 2,
  ];

  const matches: BrickCoord[] = [];
  const [nx, ny, nz] = level.brickGrid;

  for (let kz = 0; kz < nz; kz++) {
    for (let ky = 0; ky < ny; ky++) {
      for (let kx = 0; kx < nx; kx++) {
        const centre: Point3 = [
          kx * brickSize[0] + half[0],
          ky * brickSize[1] + half[1],
          kz * brickSize[2] + half[2],
        ];

        const distance =
          n[0] * (centre[0] - pointIJK[0]) +
          n[1] * (centre[1] - pointIJK[1]) +
          n[2] * (centre[2] - pointIJK[2]);

        if (Math.abs(distance) <= radius) {
          matches.push({ level: level.name, kx, ky, kz });
        }
      }
    }
  }

  return matches;
}

/**
 * Converts a world-space plane into the index space of a level.
 *
 * A world plane `n · (x - p) = 0` with `x = origin + D · S · idx` becomes
 * `(S · Dᵀ · n) · idx = n · (p - origin)`, so the index-space normal is the
 * world normal projected onto the direction columns and scaled by spacing.
 * Ignoring the spacing term is the classic bug here — it makes oblique planes
 * select the wrong bricks on anisotropic volumes.
 *
 * @param normalWorld - Plane normal in world/patient space.
 * @param pointWorld - A point on the plane, in world space.
 * @param geometry - Volume geometry at the level being addressed.
 */
export function worldPlaneToIndex(
  normalWorld: Point3,
  pointWorld: Point3,
  geometry: {
    origin: Point3;
    spacing: Point3;
    /**
     * Row-major 3x3 direction cosines: [ix,iy,iz, jx,jy,jz, kx,ky,kz].
     * `ArrayLike` so both `Mat3` forms — tuple and `Float32Array` — are accepted.
     */
    direction: ArrayLike<number>;
  }
): { normalIJK: Point3; pointIJK: Point3 } {
  const { origin, spacing, direction } = geometry;

  const axis = (i: number): Point3 => [
    direction[i * 3],
    direction[i * 3 + 1],
    direction[i * 3 + 2],
  ];

  const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const normalIJK: Point3 = [
    dot(axis(0), normalWorld) * spacing[0],
    dot(axis(1), normalWorld) * spacing[1],
    dot(axis(2), normalWorld) * spacing[2],
  ];

  const delta: Point3 = [
    pointWorld[0] - origin[0],
    pointWorld[1] - origin[1],
    pointWorld[2] - origin[2],
  ];

  const pointIJK: Point3 = [
    dot(axis(0), delta) / spacing[0],
    dot(axis(1), delta) / spacing[1],
    dot(axis(2), delta) / spacing[2],
  ];

  return { normalIJK, pointIJK };
}
