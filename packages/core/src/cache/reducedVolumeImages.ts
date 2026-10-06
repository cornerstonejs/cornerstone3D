import cache from './cache';
import VoxelStatistics from '../enums/VoxelStatistics';
import VoxelManager from '../utilities/VoxelManager';
import { createAndCacheLocalImage } from '../loaders/imageLoader';
import { getConstructorFromType } from '../utilities/getBufferConfiguration';
import { coreLog } from '../utilities/logger';
import type {
  IImage,
  IVoxelManager,
  Mat3,
  PixelDataTypedArrayString,
  Point2,
  Point3,
  RGB,
  VoxelGrid,
  VoxelStatistic,
} from '../types';

const log = coreLog.getLogger('cache', 'reducedVolumeImages');

/** The scheme of the image id of a reduced slice. */
export const REDUCED_IMAGE_SCHEME = 'reduced';

/**
 * The form of the image id of a reduced slice.
 *
 * THE SIZE COMES BEFORE THE STATISTIC, AND THAT ORDER IS REQUIRED.
 * `imageIdToURI` strips one scheme prefix when a second scheme-like prefix
 * follows it, so `reduced:average:wadors:https://…` would give the URI of the
 * SOURCE image and collide with it in `cache.getCachedImageBasedOnImageURI`.
 * A size starts with a digit, which no scheme does, so the strip does not
 * happen and a reduced slice keeps a URI of its own.
 */
const REDUCED_IMAGE_ID =
  /^reduced:(\d+)x(\d+)(?:x(\d+))?(?:@(\d+),(\d+))?:([^:]+):(.+)$/;

/** The element types that `createAndCacheLocalImage` accepts. */
const STORABLE_TYPES = new Set([
  'Uint8Array',
  'Uint16Array',
  'Int16Array',
  'Float32Array',
]);

/** What identifies one reduced slice. */
export type ReducedImageIdOptions = {
  /** The image id of the FIRST source frame that the reduced slice covers. */
  sourceImageId: string;
  /** The number of columns of the reduced slice. */
  columns: number;
  /** The number of rows of the reduced slice. */
  rows: number;
  /** The number of source frames that the reduced slice covers. One by default. */
  frames?: number;
  /**
   * The first source column and row that the reduced slice covers, for one
   * brick of the plane. `[0, 0]` by default.
   */
  inPlaneOffset?: [number, number];
  /** The statistic that the reduced slice holds. `average` by default. */
  statistic?: VoxelStatistic;
};

/** What a caller states to get the images of one reduced representation. */
export type ReducedImagesOptions = {
  /** The grid of the reduced representation. */
  grid: VoxelGrid;
  /** The image ids of the source representation, one for each of its frames. */
  sourceImageIds: string[];
  /** The box size of each axis that takes the source to this grid. */
  factors: Point3;
  /** The first source voxel of the region, for the derivation of one brick. */
  sourceOffset?: Point3;
  /** The statistic that the reduced slices hold. `average` by default. */
  statistic?: VoxelStatistic;
  /** The element type of the voxels, which the source gives. */
  dataType: PixelDataTypedArrayString;
  /** The number of components of one voxel. One by default. */
  numberOfComponents?: number;
  /**
   * The volume that holds this representation. The image cache exempts an image
   * of a volume from its own eviction, and a reduced slice takes the same
   * exemption, because a texture reads it for as long as the volume lives.
   */
  sharedCacheKey?: string;
  /** The frame of reference of the volume. */
  frameOfReferenceUID?: string;
  /** The identifier of the voxel manager. */
  id?: string;
};

/** The store of one reduced representation, which the image cache holds. */
export type ReducedImages = {
  /** The image id of each slice of the reduced grid, in the order of the grid. */
  imageIds: string[];
  /** The voxel manager over those images. */
  voxelManager: IVoxelManager<number> | IVoxelManager<RGB>;
};

/**
 * The image id of one reduced slice.
 *
 * The id names the source, the size of the reduced slice and the statistic, so
 * two volumes that share a frame share the reduced slice that the frame
 * produces, and a `minimum` slice never collides with an `average` slice of the
 * same size.
 *
 * A reduction of the k axis makes one reduced slice from several source frames.
 * The id then names the FIRST of those frames and states how many frames the
 * slice covers, which identifies the set, because the frames of a volume are
 * ordered.
 *
 * A brick that starts away from the first column or row also names that start,
 * so two bricks of one plane never share a reduced slice.
 */
export function reducedImageId({
  sourceImageId,
  columns,
  rows,
  frames = 1,
  inPlaneOffset = [0, 0],
  statistic = VoxelStatistics.Average,
}: ReducedImageIdOptions): string {
  const [offsetI, offsetJ] = inPlaneOffset;
  const size =
    (frames > 1 ? `${columns}x${rows}x${frames}` : `${columns}x${rows}`) +
    (offsetI || offsetJ ? `@${offsetI},${offsetJ}` : '');

  return `${REDUCED_IMAGE_SCHEME}:${size}:${statistic}:${sourceImageId}`;
}

/** States whether an image id names a reduced slice. */
export function isReducedImageId(imageId: string): boolean {
  return REDUCED_IMAGE_ID.test(imageId ?? '');
}

/**
 * The parts of the image id of a reduced slice, which a fidelity readout and a
 * log message use to state what a viewport really draws.
 *
 * @returns the parts, or `undefined` when the id names no reduced slice
 */
export function parseReducedImageId(
  imageId: string
): Required<ReducedImageIdOptions> | undefined {
  const match = REDUCED_IMAGE_ID.exec(imageId ?? '');

  if (!match) {
    return undefined;
  }

  return {
    columns: Number(match[1]),
    rows: Number(match[2]),
    frames: match[3] ? Number(match[3]) : 1,
    inPlaneOffset: [Number(match[4] ?? 0), Number(match[5] ?? 0)],
    statistic: match[6] as VoxelStatistic,
    sourceImageId: match[7],
  };
}

/**
 * The images of one reduced representation, which the IMAGE CACHE holds.
 *
 * One image holds one slice of the reduced grid, exactly as one image holds one
 * frame of the volume, so the reduced voxels are counted, evicted and shared by
 * the one cache that already holds the full-resolution voxels. The voxel
 * manager over those images is the same kind of voxel manager that the volume
 * itself uses, and it owns no array.
 *
 * An image that the cache already holds comes back as it is, so a second
 * viewport that asks for the same reduction finds the same voxels and derives
 * nothing again.
 *
 * @returns the store, or `undefined` when the cache cannot hold this
 * representation, and the caller then falls back to an array of its own
 */
export function provideReducedImages({
  grid,
  sourceImageIds,
  factors,
  sourceOffset = [0, 0, 0],
  statistic = VoxelStatistics.Average,
  dataType,
  numberOfComponents = 1,
  sharedCacheKey,
  frameOfReferenceUID,
  id,
}: ReducedImagesOptions): ReducedImages | undefined {
  const [columns, rows, depth] = grid.dimensions;
  const frameFactor = Math.max(Math.round(factors[2]), 1);

  if (!STORABLE_TYPES.has(dataType)) {
    log.warn(
      `the image cache holds no image of ${dataType}, so the reduced representation keeps an array of its own`
    );

    return undefined;
  }

  if (!sourceImageIds?.length) {
    return undefined;
  }

  const imageIds: string[] = [];

  for (let slice = 0; slice < depth; slice++) {
    const firstFrame = sourceOffset[2] + slice * frameFactor;

    if (firstFrame >= sourceImageIds.length) {
      log.warn(
        `the reduced grid of ${depth} slices asks for the source frame ${firstFrame}, and the source holds ${sourceImageIds.length} frames`
      );

      return undefined;
    }

    const frames = Math.min(frameFactor, sourceImageIds.length - firstFrame);
    const imageId = reducedImageId({
      sourceImageId: sourceImageIds[firstFrame],
      columns,
      rows,
      frames,
      inPlaneOffset: [sourceOffset[0], sourceOffset[1]],
      statistic,
    });

    if (!cache.getImage(imageId)) {
      const image = createReducedImage({
        imageId,
        grid,
        slice,
        dataType,
        numberOfComponents,
        sharedCacheKey,
        frameOfReferenceUID,
        referencedImageId: sourceImageIds[firstFrame],
      });

      if (!image) {
        return undefined;
      }
    } else if (sharedCacheKey) {
      cache.setImageSharedCacheKey(imageId, sharedCacheKey);
    }

    imageIds.push(imageId);
  }

  return {
    imageIds,
    voxelManager: VoxelManager.createImageVolumeVoxelManager({
      dimensions: grid.dimensions,
      imageIds,
      numberOfComponents,
      id,
      dataType,
    }),
  };
}

/**
 * Builds one reduced slice and puts it in the image cache.
 *
 * The buffer starts at zero, and the derivation writes the boxes for which the
 * source already holds voxels. A box that the source cannot give yet keeps the
 * zero, and `refreshDerivedFrames` writes it when the source data arrives.
 *
 * `minPixelValue` and `maxPixelValue` of the image therefore describe the
 * buffer of zeroes, and nothing updates them as the derivation writes. No
 * reduced slice belongs to `ImageVolume.imageIds`, so `setDefaultVolumeVOI` and
 * the other readers of the frames of a volume never see one, and a reader that
 * needs the range of the reduced data reads the quality record of the
 * representation instead.
 *
 * @returns the image, or `undefined` when the cache refuses it
 */
function createReducedImage({
  imageId,
  grid,
  slice,
  dataType,
  numberOfComponents,
  sharedCacheKey,
  frameOfReferenceUID,
  referencedImageId,
}: {
  imageId: string;
  grid: VoxelGrid;
  slice: number;
  dataType: PixelDataTypedArrayString;
  numberOfComponents: number;
  sharedCacheKey?: string;
  frameOfReferenceUID?: string;
  referencedImageId: string;
}): IImage | undefined {
  const [columns, rows] = grid.dimensions;
  // The element type of an IMAGE, and not of a volume buffer. A volume buffer
  // widens an Int16Array to a Float32Array for the sake of the texture, and a
  // reduced slice must keep the type that the source frames hold.
  const Constructor = getConstructorFromType(dataType, false);

  try {
    return createAndCacheLocalImage(imageId, {
      scalarData: new Constructor(columns * rows * numberOfComponents),
      dimensions: [columns, rows] as Point2,
      spacing: [grid.spacing[0], grid.spacing[1]] as Point2,
      // The k axis of the grid carries the position of this slice, and the
      // origin of the grid already carries the half-voxel offset of the box
      // average, so a consumer that transforms through the image plane of this
      // slice gets the right position with no new code.
      origin: originOfSlice(grid, slice),
      // `createAndCacheLocalImage` reads the first three numbers as the row
      // cosines and the next three as the column cosines, so the whole
      // direction of the grid states the plane of this slice.
      direction: Array.from(grid.direction) as unknown as Mat3,
      frameOfReferenceUID,
      referencedImageId,
      targetBuffer: { type: dataType },
      // The image cache exempts an image that a volume holds from its own
      // eviction, and this image is held for as long as that volume lives.
      onCacheAdd: (image: IImage) => {
        image.sharedCacheKey = sharedCacheKey;
      },
    });
  } catch (error) {
    log.warn(`the image cache refused the reduced slice ${imageId}`, error);

    return undefined;
  }
}

/** The position of the first voxel of one slice of a grid. */
function originOfSlice(grid: VoxelGrid, slice: number): Point3 {
  const distance = grid.spacing[2] * slice;

  return [
    grid.origin[0] + grid.direction[6] * distance,
    grid.origin[1] + grid.direction[7] * distance,
    grid.origin[2] + grid.direction[8] * distance,
  ] as Point3;
}
