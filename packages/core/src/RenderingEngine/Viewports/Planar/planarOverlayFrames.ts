import { vec3 } from 'gl-matrix';
import ImageQualityStatus from '../../../enums/ImageQualityStatus';
import type { BoundsIJK, IImageVolume, Point3 } from '../../../types';
import { transformWorldToIndexContinuous } from '../../../utilities/transformWorldToIndex';

/**
 * What an overlay layer of a volume may draw of the plane of the view:
 *
 * - `'ready'`: every frame that the plane reads (the frames that a linear
 *   sample between frames reads, and every frame of the slab) holds data of
 *   its own position;
 * - `'nearest'`: the plane lies along the frames with no slab, and the frame
 *   nearest to it, within half a slice, holds data of its own position while
 *   the other frame of a linear sample does not; a reader that can sample on
 *   that frame alone draws it, any other draws nothing;
 * - `'empty'`: a frame within half a slice of the plane holds no data of its
 *   own position, so the layer draws nothing.
 */
export type PlanarOverlayFrameState = 'ready' | 'nearest' | 'empty';

/** The tolerance of a frame index that lies on a frame. */
const FRAME_INDEX_EPSILON = 1e-3;

/** The tolerance of a plane that lies along the frames. */
const PARALLEL_EPSILON = 1e-6;

/**
 * The lowest quality of the data of a frame of its own position.
 *
 * A progressive load (the interleaved retrieve stages) first fills a frame
 * with a copy of the image of a frame near it: `FAR_REPLICATE` up to
 * `ADJACENT_REPLICATE`, a copy of a frame one slice away or more. Such a copy
 * is the coarse preview of a source, and it is another slice for an overlay.
 * Every quality from `SUBRESOLUTION` up is data of the frame itself.
 */
const OWN_FRAME_QUALITY = ImageQualityStatus.SUBRESOLUTION;

/** The world corners of the box of the voxel centres of a volume. */
function getVolumeCorners(volume: IImageVolume): Point3[] {
  const [columns, rows, frames] = volume.dimensions;
  const corners: Point3[] = [];

  for (const k of [0, frames - 1]) {
    for (const j of [0, rows - 1]) {
      for (const i of [0, columns - 1]) {
        corners.push(volume.imageData.indexToWorld([i, j, k]) as Point3);
      }
    }
  }

  return corners;
}

/**
 * The range of continuous frame indices (k) that a plane, and the slab
 * around it, meets in a volume.
 *
 * A plane along the frames meets one index. Any other plane meets the frame
 * indices of the corners of the volume box projected onto it, which hold the
 * part of the plane inside the volume.
 */
function getFrameIndexRange(
  volume: IImageVolume,
  focalPoint: Point3,
  viewPlaneNormal: Point3,
  slabThickness: number
): [number, number] {
  const { direction, imageData, spacing } = volume;
  const normal = vec3.normalize(
    vec3.create(),
    viewPlaneNormal as unknown as vec3
  );
  const frameAxis = vec3.fromValues(direction[6], direction[7], direction[8]);
  const cosine = Math.abs(vec3.dot(normal, frameAxis));
  const slabFrames = ((slabThickness / 2) * cosine) / spacing[2];
  let low: number;
  let high: number;

  if (cosine > 1 - PARALLEL_EPSILON) {
    low = high = transformWorldToIndexContinuous(imageData, focalPoint)[2];
  } else {
    low = Infinity;
    high = -Infinity;

    for (const corner of getVolumeCorners(volume)) {
      const distance = vec3.dot(
        vec3.subtract(
          vec3.create(),
          corner as unknown as vec3,
          focalPoint as unknown as vec3
        ),
        normal
      );
      const projected = vec3.scaleAndAdd(
        vec3.create(),
        corner as unknown as vec3,
        normal,
        -distance
      );
      const k = transformWorldToIndexContinuous(imageData, [
        projected[0],
        projected[1],
        projected[2],
      ])[2];

      low = Math.min(low, k);
      high = Math.max(high, k);
    }
  }

  return [low - slabFrames, high + slabFrames];
}

/** The region of the frames `from` to `to` of a volume. */
function boundsOfFrames(
  volume: IImageVolume,
  from: number,
  to: number
): BoundsIJK {
  return [
    [0, volume.dimensions[0] - 1],
    [0, volume.dimensions[1] - 1],
    [from, to],
  ];
}

/**
 * Whether every frame from `from` to `to` holds data of its own position,
 * by the record of the deliveries of the volume: a volume that states no
 * deliveries (a volume that does not stream, a labelmap) holds every frame.
 */
function holdsOwnFrames(
  volume: IImageVolume,
  from: number,
  to: number
): boolean {
  const record = volume.getVoxelQuality?.({
    region: boundsOfFrames(volume, from, to),
  });

  return (
    !record || (record.missing === 0 && record.status >= OWN_FRAME_QUALITY)
  );
}

/** The largest number of frames of a plane that a delivery key states. */
const MAX_KEYED_FRAMES = 4;

/**
 * The frames that a plane, and the slab around it, reads of a volume that
 * records its deliveries: the continuous frame indices `low` to `high` that
 * it meets, the frames `first` to `last` that a sample reads, or `outside`
 * when the plane misses the volume. Undefined for a volume that records no
 * deliveries or a camera without a plane.
 */
function getPlaneFrames(
  volume: IImageVolume,
  camera: { focalPoint?: Point3; viewPlaneNormal?: Point3 } | undefined,
  slabThickness: number
):
  | { outside: boolean; first: number; last: number; low: number; high: number }
  | undefined {
  if (
    !camera?.focalPoint ||
    !camera.viewPlaneNormal ||
    !volume?.imageData ||
    !volume.getVoxelQuality
  ) {
    return;
  }

  const frames = volume.dimensions[2];
  const [low, high] = getFrameIndexRange(
    volume,
    camera.focalPoint,
    camera.viewPlaneNormal,
    slabThickness
  );

  return {
    outside: high < -0.5 || low > frames - 0.5,
    first: Math.max(0, Math.floor(low + FRAME_INDEX_EPSILON)),
    last: Math.min(frames - 1, Math.ceil(high - FRAME_INDEX_EPSILON)),
    low,
    high,
  };
}

/**
 * A key of the deliveries of the frames that a plane reads of a streaming
 * volume: the record of each frame (its quality and whether data is
 * missing). While the key stays the same, a sample of the plane gives the
 * same picture, as a frame holds new data only with a new record. Undefined
 * where no key is kept: a volume that records no deliveries, or a plane that
 * reads more than MAX_KEYED_FRAMES frames (a sagittal, coronal or oblique
 * plane, a thick slab), whose picture changes with most deliveries.
 *
 * @param volume - The volume of the layer
 * @param camera - The plane of the view
 * @param slabThickness - The slab of the layer, in world units, or 0
 */
export function getPlanarFrameDeliveryKey(
  volume: IImageVolume,
  camera: { focalPoint?: Point3; viewPlaneNormal?: Point3 } | undefined,
  slabThickness = 0
): string | undefined {
  const planeFrames = getPlaneFrames(volume, camera, slabThickness);

  if (!planeFrames) {
    return;
  }

  if (planeFrames.outside) {
    return 'outside';
  }

  const { first, last } = planeFrames;

  if (last - first + 1 > MAX_KEYED_FRAMES) {
    return;
  }

  const records: string[] = [];

  for (let frame = first; frame <= last; frame++) {
    const record = volume.getVoxelQuality({
      region: boundsOfFrames(volume, frame, frame),
    });

    if (!record) {
      return;
    }

    records.push(`${frame}:${record.status}:${record.missing}`);
  }

  return records.join('|');
}

/**
 * What an overlay layer of a volume may draw of the plane of a camera (see
 * {@link PlanarOverlayFrameState}).
 *
 * The rule of an overlay is that it never shows a slice other than the one on
 * the plane of the source. A frame that holds a copy of another frame while
 * the volume streams is not data of that plane, so the layer draws nothing
 * where it would read such a frame, until a frame of its own position, of any
 * quality, arrives. A source keeps the copies: they are its coarse preview.
 *
 * @param volume - The volume of the layer
 * @param camera - The plane of the view
 * @param slabThickness - The slab of the layer, in world units, or 0
 */
export function getPlanarOverlayFrameState(
  volume: IImageVolume,
  camera: { focalPoint?: Point3; viewPlaneNormal?: Point3 } | undefined,
  slabThickness = 0
): PlanarOverlayFrameState {
  const planeFrames = getPlaneFrames(volume, camera, slabThickness);

  if (!planeFrames || planeFrames.outside) {
    return 'ready';
  }

  const { first, last, low, high } = planeFrames;
  const frames = volume.dimensions[2];

  if (holdsOwnFrames(volume, first, last)) {
    return 'ready';
  }

  const nearest = Math.min(frames - 1, Math.max(0, Math.round(low)));

  if (
    low === high &&
    slabThickness === 0 &&
    holdsOwnFrames(volume, nearest, nearest)
  ) {
    return 'nearest';
  }

  return 'empty';
}
