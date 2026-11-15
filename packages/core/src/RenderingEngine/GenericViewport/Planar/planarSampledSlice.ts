import { vec3 } from 'gl-matrix';
import BlendModes from '../../../enums/BlendModes';
import InterpolationType from '../../../enums/InterpolationType';
import type {
  ICamera,
  IDynamicImageVolume,
  IImageVolume,
  PixelDataTypedArray,
  Point2,
  Point3,
} from '../../../types';
import {
  getExactSliceAxis,
  getVolumeSliceGeometry,
} from '../../../utilities/volumeSliceGeometry';
import type { VolumeSliceGeometry } from '../../../utilities/volumeSliceGeometry';
import {
  getSlabSampleOffsets,
  sampleVolumeSlice,
} from '../../../utilities/sampleVolumeSlice';
import type { VolumeSliceSlab } from '../../../utilities/sampleVolumeSlice';
import type { PlanarDataPresentation } from './PlanarViewportTypes';
import { resolveSlabThickness } from './planarVolumeSliceBlendMode';
import { canvasToWorldPlanarViewState } from './planarAdapterCoordinateTransforms';
import { MAX_CPU_SLICE_SAMPLES } from './PlanarRenderPathDecisionService';

const POSITION_TOLERANCE = 1e-6;
const DIRECTION_TOLERANCE = 1e-9;

/**
 * The largest width or height of a slice of the screen grid, in samples. A
 * canvas side with more device pixels is sampled with this many samples, each
 * a little larger than a device pixel, and the GPU enlarges them.
 */
export const MAX_SCREEN_SLICE_SIZE = 2048;

/**
 * Two screen grids whose samples lie closer than this fraction of a pixel are
 * the same grid. The spacing difference counts once per pixel, so over a
 * 2048 pixel row the samples still move less than 0.002 of a pixel.
 */
const SCREEN_GRID_TOLERANCE = 1e-6;

/**
 * The number of neighbour slices on each side of the slice on screen that a
 * sampler keeps and prefetches: 3, so that a scroll of up to three slices in
 * either direction finds its slice ready.
 */
export const SAMPLED_SLICE_PREFETCH_NEIGHBOURS = 3;

/**
 * The most slices that one sampler keeps: the slice on screen and its
 * neighbours on both sides.
 */
export const SAMPLED_SLICE_CACHE_SIZE =
  2 * SAMPLED_SLICE_PREFETCH_NEIGHBOURS + 1;

/**
 * The most voxel samples that one prefetch may take: 1 million, about 10 ms at
 * the 8 to 12 ns per sample measured for sampleVolumeGrid, so that one idle
 * callback stays short. It is the number of pixels of the slice times the
 * number of slab samples of each pixel. A plain slice of a 512 x 512 CT (0.26
 * million) or a slab of 3 samples of it is prefetched; a thicker slab, or a
 * very large oblique slice, is sampled only when the view asks for it.
 */
export const MAX_PREFETCH_SLICE_SAMPLES = 1_000_000;

/** The most pixel arrays of dropped slices that a sampler keeps for reuse. */
const MAX_SPARE_PIXEL_ARRAYS = 2;

/**
 * The inputs of one sample, apart from the plane. A change of any of them
 * samples again. Zoom, pan, rotation in the plane, window level, colormap and
 * opacity are not inputs, so they never sample.
 */
export type PlanarSampledSliceInputs = {
  /** NEAREST samples the nearest voxel, any other type samples linearly. */
  interpolationType: InterpolationType;
  /** The slab around the plane, or undefined for a plain slice. */
  slab?: VolumeSliceSlab;
  /** The active time point (dimension group) of a dynamic volume. */
  timePoint?: number;
};

/**
 * A slice of a volume sampled on the CPU, in world coordinates. It is a plain
 * object with no vtk.js types, so the step that draws it can be replaced
 * without a change to the sampling.
 */
export type PlanarSampledSlice = {
  /** The pixels, row by row, in the array type of the volume. */
  pixelData: PixelDataTypedArray;
  width: number;
  height: number;
  /** World position of the centre of the first pixel. */
  origin: Point3;
  /** Unit vector along a row. */
  xDirection: Point3;
  /** Unit vector from one row to the next. */
  yDirection: Point3;
  /** Unit vector along the view plane normal. */
  zDirection: Point3;
  /** World size of one pixel along x and along y. */
  spacing: Point2;
  /** The lowest and the highest value of the pixels. */
  min: number;
  max: number;
  /**
   * True when every pixel lies inside the faces of the volume: the slice of a
   * view whose normal follows a volume axis, one pixel per voxel. Drawn as
   * an image whose edges are half a pixel outside the outer pixel centres,
   * it ends on the faces of the volume by itself, as the cut of the GPU
   * volume path does, and needs no clip planes.
   */
  insideVolume: boolean;
  /** The inputs that this slice was sampled for. */
  sampledFor: PlanarSampledSliceInputs & { sliceIndex: number };
};

/** A plane that keeps the side its normal points to. */
export type PlanarSliceClipPlane = {
  origin: Point3;
  normal: Point3;
};

type SliceCamera = Pick<ICamera, 'focalPoint' | 'viewPlaneNormal' | 'viewUp'>;

/**
 * The camera that places the screen grid: the camera of the renderer, with
 * its parallel scale and its presentation scale.
 */
export type PlanarScreenCamera = Parameters<
  typeof canvasToWorldPlanarViewState
>[0]['camera'];

/**
 * The counts of a sampler, for tests and for an example page. A hit is a
 * request for a new slice on screen that the cache served; a miss is one that
 * had to sample. A request for the slice already on screen (zoom, pan,
 * presentation) counts as neither.
 */
export type PlanarSliceCacheStatistics = {
  hits: number;
  misses: number;
  /** Neighbour slices sampled ahead of a scroll. */
  prefetched: number;
  /** Samples of an oblique slice on the screen grid, taken at rest. */
  refined: number;
  /** The number of slices kept now, the slice of the screen grid included. */
  size: number;
  /**
   * Milliseconds that the last voxel-size sample took (a miss or a
   * prefetch), or undefined before the first one.
   */
  lastSampleMs?: number;
  /**
   * Milliseconds that the last sample on the screen grid took, or undefined
   * before the first one.
   */
  lastFineSampleMs?: number;
};

/** The options of a `PlanarSliceSampler`, set by its draw step. */
export type PlanarSliceSamplerOptions = {
  /**
   * True when the draw step enlarges a slice after it has turned the values
   * into colours, as a 2D canvas does. A linear enlargement then mixes the
   * colours of neighbour voxels, which differs from the colour of the mixed
   * value wherever the VOI clips or the colormap bends, so a linear slice
   * needs the screen grid also along a volume axis. False (the default) for
   * a draw step that enlarges the values, as the vtk.js image mapper does.
   */
  enlargesColours?: boolean;
};

/**
 * Whether one sample per screen pixel can give another picture than the
 * voxel-size slice that the draw step enlarges. That is so for an oblique
 * view. It is also so for a view along a volume axis that shows a maximum or
 * a minimum slab: the GPU volume path takes the maximum of interpolated
 * samples for each screen pixel, which differs from the enlarged maximum of
 * the voxels. A plain slice and an average slab along a volume axis give the
 * same picture either way, unless the draw step enlarges colours and the
 * slice is linear (see `PlanarSliceSamplerOptions.enlargesColours`). A
 * NEAREST slice along a volume axis, enlarged without smoothing, is the same
 * picture for both draw steps.
 */
function needsScreenGridSample(
  volume: IImageVolume,
  viewPlaneNormal: Point3,
  inputs: PlanarSampledSliceInputs,
  enlargesColours: boolean
): boolean {
  if (getExactSliceAxis(volume, viewPlaneNormal) === undefined) {
    return true;
  }

  if (
    enlargesColours &&
    inputs.interpolationType !== InterpolationType.NEAREST
  ) {
    return true;
  }

  const blendMode = inputs.slab?.blendMode;

  return (
    blendMode === BlendModes.MAXIMUM_INTENSITY_BLEND ||
    blendMode === BlendModes.MINIMUM_INTENSITY_BLEND
  );
}

/** One kept slice with the geometry it was sampled for. */
type CachedSlice = {
  geometry: VolumeSliceGeometry;
  slice: PlanarSampledSlice;
  generation: number;
};

/**
 * The sample step of the sampled slice render path. It cuts the slice of the
 * view plane out of a volume with getVolumeSliceGeometry and sampleVolumeSlice.
 *
 * It keeps a small cache: the slice on screen and up to
 * SAMPLED_SLICE_PREFETCH_NEIGHBOURS neighbours on each side along the view
 * normal, at most SAMPLED_SLICE_CACHE_SIZE slices. A slice is kept for its
 * plane and its sampling inputs. A request whose plane and inputs match a kept
 * slice, with pixels as fine or finer, returns that slice and does not sample,
 * so a change of zoom, pan or presentation costs nothing, and a scroll to a
 * prefetched neighbour costs nothing either. A change of the view normal or of
 * the inputs drops the kept slices; `invalidate` drops them for new voxel
 * data. When the cache is full, the slice farthest from the slice on screen
 * is dropped.
 *
 * Each kept slice owns its pixel array. The arrays of dropped slices are
 * reused for new samples of the same size and type, so a scroll does not
 * allocate once the cache is warm.
 *
 * A slice at rest that needs it is sampled once more on the screen grid (see
 * `sampleFiner`), which depends on how the draw step enlarges a slice
 * (`PlanarSliceSamplerOptions`). Only one such slice is kept, apart from the cache, which
 * bounds the memory to one sample per device pixel plus the voxel-size
 * slices.
 */
export class PlanarSliceSampler {
  private readonly enlargesColours: boolean;
  private entries: CachedSlice[] = [];
  private current?: CachedSlice;
  private fine?: CachedSlice;
  private shown?: PlanarSampledSlice;
  private spareArrays: PixelDataTypedArray[] = [];
  private generation = 0;
  private statistics: Omit<PlanarSliceCacheStatistics, 'size'> = {
    hits: 0,
    misses: 0,
    prefetched: 0,
    refined: 0,
  };

  constructor(options: PlanarSliceSamplerOptions = {}) {
    this.enlargesColours = options.enlargesColours ?? false;
  }

  /**
   * Returns the slice of the view plane of a camera, sampled with the given
   * inputs, or undefined when the plane does not cut the volume. The pixels
   * have about the size of a voxel. When the kept slice of the screen grid
   * was sampled for the same plane, inputs and screen grid (`screen`, see
   * `getScreenSliceGeometry`), that slice is returned in its place, so a
   * change of the presentation keeps the finer picture. A view that moved
   * gets the voxel-size slice, which the GPU places for any pan, zoom and
   * rotation.
   */
  sample(
    volume: IImageVolume,
    camera: SliceCamera | undefined,
    inputs: PlanarSampledSliceInputs,
    screen?: VolumeSliceGeometry
  ): PlanarSampledSlice | undefined {
    if (!camera?.focalPoint || !camera.viewPlaneNormal) {
      return this.shown;
    }

    const geometry = getSliceGeometry(volume, camera, inputs);

    if (!geometry) {
      this.current = undefined;
      this.shown = undefined;

      return;
    }

    this.dropOtherViews(geometry, inputs);

    const cached = this.find(geometry, inputs);

    if (cached) {
      if (cached !== this.current) {
        this.statistics.hits++;
      }

      this.current = cached;
    } else {
      this.statistics.misses++;
      this.current = this.store(volume, geometry, inputs, geometry);
    }

    const { fine } = this;

    this.shown =
      fine &&
      screen &&
      isSameScreenGrid(fine.geometry, screen) &&
      isSameCutPlane(fine.geometry, geometry)
        ? fine.slice
        : this.current.slice;

    return this.shown;
  }

  /**
   * Samples the slice on screen again on the screen grid, for a view at rest
   * that needs it: one sample at the centre of each device pixel (see
   * `getScreenSliceGeometry`). Drawn with one texel per device pixel, the
   * texture filtering of the draw step does not change the values, so the
   * picture is the one of the GPU volume path, which samples the volume once
   * per fragment. That holds for NEAREST too: a voxel-size slice enlarged on
   * the GPU shows square blocks along the slice grid, and only a sample per
   * screen pixel shows the cut through each voxel.
   *
   * It samples nothing for a view whose voxel-size slice already gives that
   * picture (see `needsScreenGridSample`), when
   * the screen grid does not lie in the plane of the slice on screen, when
   * the kept slice of the screen grid already matches, or when the sample
   * would take more than MAX_CPU_SLICE_SAMPLES voxel samples (the pixels of
   * the screen grid times the slab samples of each pixel), the limit that the
   * render path decision uses for a slab; the coarse slice then stays on
   * screen. A plain slice of the largest screen grid (2048 x 2048) is within
   * that limit. The new slice replaces the kept one.
   *
   * @returns the slice of the screen grid, or undefined when none was sampled
   */
  sampleFiner(
    volume: IImageVolume,
    camera: SliceCamera | undefined,
    inputs: PlanarSampledSliceInputs,
    screen: VolumeSliceGeometry | undefined
  ): PlanarSampledSlice | undefined {
    const { current, fine } = this;

    if (
      !current ||
      !screen ||
      current.generation !== this.generation ||
      !camera?.viewPlaneNormal ||
      !isSameInputs(current.slice.sampledFor, inputs) ||
      !needsScreenGridSample(
        volume,
        camera.viewPlaneNormal,
        inputs,
        this.enlargesColours
      ) ||
      !isSameCutPlane(current.geometry, screen)
    ) {
      return;
    }

    if (
      fine &&
      fine.generation === this.generation &&
      isSameInputs(fine.slice.sampledFor, inputs) &&
      isSameScreenGrid(fine.geometry, screen)
    ) {
      return;
    }

    const geometry: VolumeSliceGeometry = {
      ...screen,
      sliceIndex: current.geometry.sliceIndex,
    };

    if (getSampleCount(volume, geometry, inputs) > MAX_CPU_SLICE_SAMPLES) {
      return;
    }

    const length = geometry.width * geometry.height;
    const start = performance.now();

    if (fine) {
      this.addSpareArray(fine.slice.pixelData);
    }

    this.fine = this.sampleEntry(
      volume,
      geometry,
      inputs,
      this.takeSpareArray(volume, length),
      false
    );
    this.statistics.lastFineSampleMs = performance.now() - start;
    this.statistics.refined++;
    this.shown = this.fine.slice;

    return this.fine.slice;
  }

  /**
   * Samples the slice of a neighbour plane into the cache, ahead of a scroll,
   * with pixels of about the size of a voxel. It does nothing when the plane
   * is kept already, when there is no current slice with the same view normal
   * and inputs, or when the sample would take more than
   * MAX_PREFETCH_SLICE_SAMPLES voxel samples. The slice on screen does not
   * change.
   *
   * @returns true when it sampled
   */
  prefetch(
    volume: IImageVolume,
    camera: SliceCamera | undefined,
    inputs: PlanarSampledSliceInputs
  ): boolean {
    const { current } = this;

    if (
      !current ||
      current.generation !== this.generation ||
      !camera?.focalPoint ||
      !camera.viewPlaneNormal ||
      !isSameInputs(current.slice.sampledFor, inputs)
    ) {
      return false;
    }

    const geometry = getSliceGeometry(volume, camera, inputs);

    if (
      !geometry ||
      !isSameDirections(current.geometry, geometry) ||
      this.find(geometry, inputs) ||
      getSampleCount(volume, geometry, inputs) > MAX_PREFETCH_SLICE_SAMPLES
    ) {
      return false;
    }

    this.statistics.prefetched++;
    this.store(volume, geometry, inputs, current.geometry);

    return true;
  }

  /** The slice on screen, or undefined. */
  getSlice(): PlanarSampledSlice | undefined {
    return this.shown;
  }

  /** The counts of this sampler and the number of slices it keeps. */
  getStatistics(): PlanarSliceCacheStatistics {
    const kept = this.fine ? [...this.entries, this.fine] : this.entries;

    return {
      ...this.statistics,
      size: kept.filter((entry) => entry.generation === this.generation).length,
    };
  }

  /**
   * Makes every kept slice stale, so the next request samples again, for
   * example after new voxel data. Stale slices are dropped at the next
   * request.
   */
  invalidate(): void {
    this.generation++;
  }

  /** Drops the kept slices and their pixel arrays. */
  release(): void {
    this.entries = [];
    this.current = undefined;
    this.fine = undefined;
    this.shown = undefined;
    this.spareArrays = [];
    this.generation++;
  }

  /**
   * The kept slice of the plane of a geometry, sampled with the same inputs
   * and with pixels as fine or finer, if any.
   */
  private find(
    geometry: VolumeSliceGeometry,
    inputs: PlanarSampledSliceInputs
  ): CachedSlice | undefined {
    return this.entries.find(
      (entry) =>
        entry.generation === this.generation &&
        isSameInputs(entry.slice.sampledFor, inputs) &&
        isSamePlane(entry.geometry, geometry) &&
        entry.geometry.spacing[0] <= geometry.spacing[0] + POSITION_TOLERANCE &&
        entry.geometry.spacing[1] <= geometry.spacing[1] + POSITION_TOLERANCE
    );
  }

  /**
   * Drops the kept slices that a request for this geometry and these inputs
   * can never use: stale slices, slices of other inputs and slices of another
   * view direction.
   */
  private dropOtherViews(
    geometry: VolumeSliceGeometry,
    inputs: PlanarSampledSliceInputs
  ): void {
    this.entries = this.entries.filter((entry) => {
      const keep =
        entry.generation === this.generation &&
        isSameInputs(entry.slice.sampledFor, inputs) &&
        isSameDirections(entry.geometry, geometry);

      if (!keep) {
        this.addSpareArray(entry.slice.pixelData);
      }

      return keep;
    });

    if (this.current && !this.entries.includes(this.current)) {
      this.current = undefined;
    }

    const { fine } = this;

    if (
      fine &&
      !(
        fine.generation === this.generation &&
        isSameInputs(fine.slice.sampledFor, inputs) &&
        isSameCutPlane(fine.geometry, geometry)
      )
    ) {
      this.addSpareArray(fine.slice.pixelData);
      this.fine = undefined;
    }
  }

  /**
   * Samples a slice and keeps it. A kept slice of the same plane and inputs is
   * replaced. When the cache is full, the slice farthest from the plane of
   * `reference` is dropped first, and its pixel array is reused.
   */
  private store(
    volume: IImageVolume,
    geometry: VolumeSliceGeometry,
    inputs: PlanarSampledSliceInputs,
    reference: VolumeSliceGeometry
  ): CachedSlice {
    this.entries = this.entries.filter((entry) => {
      const samePlane =
        entry.generation === this.generation &&
        isSameInputs(entry.slice.sampledFor, inputs) &&
        isSamePlane(entry.geometry, geometry);

      if (samePlane) {
        this.addSpareArray(entry.slice.pixelData);
      }

      return !samePlane;
    });

    while (this.entries.length >= SAMPLED_SLICE_CACHE_SIZE) {
      this.dropFarthest(reference);
    }

    const start = performance.now();
    const entry = this.sampleEntry(
      volume,
      geometry,
      inputs,
      this.takeSpareArray(volume, geometry.width * geometry.height),
      getExactSliceAxis(volume, geometry.zDirection) !== undefined
    );

    this.statistics.lastSampleMs = performance.now() - start;
    this.entries.push(entry);

    return entry;
  }

  /** Samples the slice of a geometry into a new entry of this generation. */
  private sampleEntry(
    volume: IImageVolume,
    geometry: VolumeSliceGeometry,
    inputs: PlanarSampledSliceInputs,
    spareArray: PixelDataTypedArray | undefined,
    insideVolume: boolean
  ): CachedSlice {
    const { pixelData, min, max } = sampleVolumeSlice({
      volume,
      geometry,
      interpolationType:
        inputs.interpolationType === InterpolationType.NEAREST
          ? InterpolationType.NEAREST
          : InterpolationType.LINEAR,
      pixelData: spareArray,
      outsideValue: getOutsideValue(volume),
      slab: inputs.slab,
    });

    return {
      geometry,
      generation: this.generation,
      slice: {
        pixelData,
        width: geometry.width,
        height: geometry.height,
        origin: geometry.origin,
        xDirection: geometry.xDirection,
        yDirection: geometry.yDirection,
        zDirection: geometry.zDirection,
        spacing: geometry.spacing,
        min,
        max,
        insideVolume,
        sampledFor: { ...inputs, sliceIndex: geometry.sliceIndex },
      },
    };
  }

  /** Drops the kept slice that lies farthest from the plane of a geometry. */
  private dropFarthest(reference: VolumeSliceGeometry): void {
    let farthestIndex = 0;
    let farthestDistance = -Infinity;

    this.entries.forEach((entry, index) => {
      const distance =
        entry.generation === this.generation
          ? Math.abs(getPlaneDistance(reference, entry.geometry))
          : Infinity;

      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    });

    const [dropped] = this.entries.splice(farthestIndex, 1);

    this.addSpareArray(dropped.slice.pixelData);

    if (dropped === this.current) {
      this.current = undefined;
    }
  }

  private addSpareArray(pixelData: PixelDataTypedArray): void {
    this.spareArrays.push(pixelData);

    if (this.spareArrays.length > MAX_SPARE_PIXEL_ARRAYS) {
      this.spareArrays.shift();
    }
  }

  /** Takes a spare array of the given length and of the volume's array type. */
  private takeSpareArray(
    volume: IImageVolume,
    length: number
  ): PixelDataTypedArray | undefined {
    const ArrayType = volume.voxelManager?.getConstructor?.();
    const index = this.spareArrays.findIndex(
      (pixelData) =>
        pixelData.length === length &&
        (!ArrayType || pixelData instanceof ArrayType)
    );

    if (index < 0) {
      return;
    }

    return this.spareArrays.splice(index, 1)[0];
  }
}

/**
 * The geometry of the slice of a camera plane, with pixels of about the voxel
 * size. NEAREST puts an axis-aligned slice on the centre of its slice of
 * voxels.
 */
function getSliceGeometry(
  volume: IImageVolume,
  camera: SliceCamera,
  inputs: PlanarSampledSliceInputs
): VolumeSliceGeometry | undefined {
  return getVolumeSliceGeometry(volume, camera, {
    snapToSlice: inputs.interpolationType === InterpolationType.NEAREST,
  });
}

/**
 * The geometry of the screen grid of a camera: one sample at the centre of
 * each device pixel of the canvas, in the plane of the focal point.
 *
 * Every field comes from `canvasToWorldPlanarViewState`, the canvas to world
 * function of the planar viewports, so flips, rotation, pan, zoom and an
 * anisotropic presentation scale need no case of their own. That function
 * takes the canvas size and the canvas position in the same unit and puts
 * canvas position (0, 0) at the top left corner of the canvas, so the centre
 * of device pixel (i, j) is canvas position (i + 0.5, j + 0.5) with the size
 * in device pixels:
 * - origin: the world position of the centre of the first device pixel,
 * - xDirection and yDirection: the world directions of one device pixel to
 *   the right and one down, spacing: the world length of those steps,
 * - zDirection: the view plane normal, width x height: the canvas size.
 *
 * The origin and the steps are moved into the plane of the focal point
 * (`getStepInPlane`), so the grid lies in the same plane as the slice of
 * that plane and the sampler can tell that they match.
 *
 * A canvas side of more than `maxSize` device pixels (default
 * MAX_SCREEN_SLICE_SIZE) gets `maxSize` samples, evenly spread over the whole
 * side, each a little larger than a device pixel, and the GPU enlarges them.
 * `sliceIndex` is 0; the sampler sets it from the slice of the plane.
 *
 * @param canvasWidth - The canvas width in device pixels (`canvas.width`).
 * @param canvasHeight - The canvas height in device pixels (`canvas.height`).
 * @returns the geometry, or undefined for an empty canvas or an incomplete
 *   camera
 */
export function getScreenSliceGeometry(args: {
  camera: PlanarScreenCamera | undefined;
  canvasWidth: number;
  canvasHeight: number;
  maxSize?: number;
}): VolumeSliceGeometry | undefined {
  const {
    camera,
    canvasWidth,
    canvasHeight,
    maxSize = MAX_SCREEN_SLICE_SIZE,
  } = args;

  if (
    !camera?.focalPoint ||
    !camera.viewPlaneNormal ||
    !camera.viewUp ||
    !(camera.parallelScale > 0) ||
    !(canvasWidth >= 1) ||
    !(canvasHeight >= 1)
  ) {
    return;
  }

  const width = Math.min(Math.round(canvasWidth), maxSize);
  const height = Math.min(Math.round(canvasHeight), maxSize);
  const stepX = canvasWidth / width;
  const stepY = canvasHeight / height;
  const toWorld = (column: number, row: number) =>
    canvasToWorldPlanarViewState({
      camera,
      canvasWidth,
      canvasHeight,
      canvasPos: [(column + 0.5) * stepX, (row + 0.5) * stepY],
    });
  const normal = vec3.normalize(
    createVector(),
    camera.viewPlaneNormal as unknown as vec3
  );
  const firstPixel = toWorld(0, 0) as unknown as vec3;
  const origin = vec3.subtract(
    createVector(),
    firstPixel,
    getNormalPart(
      vec3.subtract(
        createVector(),
        firstPixel,
        camera.focalPoint as unknown as vec3
      ),
      normal
    )
  );
  const xStep = getStepInPlane(firstPixel, toWorld(width, 0), width, normal);
  const yStep = getStepInPlane(firstPixel, toWorld(0, height), height, normal);
  const spacing: Point2 = [vec3.length(xStep), vec3.length(yStep)];

  if (!(spacing[0] > 0) || !(spacing[1] > 0)) {
    return;
  }

  return {
    origin: toPoint3(origin),
    xDirection: toPoint3(vec3.scale(xStep, xStep, 1 / spacing[0])),
    yDirection: toPoint3(vec3.scale(yStep, yStep, 1 / spacing[1])),
    zDirection: toPoint3(normal),
    spacing,
    width,
    height,
    sliceIndex: 0,
  };
}

/** The part of a vector along a unit normal. */
function getNormalPart(vector: vec3, normal: vec3): vec3 {
  return vec3.scale(createVector(), normal, vec3.dot(vector, normal));
}

/**
 * The world step of one sample from `start` towards `end`, which lies `count`
 * samples away, without its part along the normal. The canvas to world
 * function builds its world points from single precision directions, which
 * puts them up to a few micrometres off the view plane; the screen grid lies
 * exactly in the plane, as the slice of the plane does.
 */
function getStepInPlane(
  start: vec3,
  end: Point3,
  count: number,
  normal: vec3
): vec3 {
  const step = vec3.scale(
    createVector(),
    vec3.subtract(createVector(), end as unknown as vec3, start),
    1 / count
  );

  return vec3.subtract(step, step, getNormalPart(step, normal));
}

/** Returns an empty vector that holds double precision numbers. */
function createVector(): vec3 {
  return [0, 0, 0] as unknown as vec3;
}

function toPoint3(vector: vec3): Point3 {
  return [vector[0], vector[1], vector[2]];
}

/** The number of voxel samples that sampling a slice takes. */
function getSampleCount(
  volume: IImageVolume,
  geometry: VolumeSliceGeometry,
  inputs: PlanarSampledSliceInputs
): number {
  const slabSamples = inputs.slab
    ? getSlabSampleOffsets(volume, inputs.slab.thickness).length
    : 1;

  return geometry.width * geometry.height * slabSamples;
}

/**
 * Whether two geometries lie in the same plane, whatever their rows and
 * columns: the same normal and no distance between the planes.
 */
function isSameCutPlane(
  previous: VolumeSliceGeometry,
  next: VolumeSliceGeometry
): boolean {
  return (
    isSamePoint(previous.zDirection, next.zDirection, DIRECTION_TOLERANCE) &&
    Math.abs(getPlaneDistance(previous, next)) <= POSITION_TOLERANCE
  );
}

/**
 * Whether two screen grids put their samples at the same world positions, up
 * to SCREEN_GRID_TOLERANCE of a pixel: the same size, pixel size, directions
 * and first pixel.
 */
function isSameScreenGrid(
  previous: VolumeSliceGeometry,
  next: VolumeSliceGeometry
): boolean {
  const pixelTolerance =
    SCREEN_GRID_TOLERANCE * Math.min(next.spacing[0], next.spacing[1]);

  return (
    previous.width === next.width &&
    previous.height === next.height &&
    Math.abs(previous.spacing[0] - next.spacing[0]) <= pixelTolerance &&
    Math.abs(previous.spacing[1] - next.spacing[1]) <= pixelTolerance &&
    isSameDirections(previous, next) &&
    isSamePoint(previous.origin, next.origin, pixelTolerance)
  );
}

/**
 * The distance along the normal of `reference` from its plane to the plane of
 * another geometry.
 */
function getPlaneDistance(
  reference: VolumeSliceGeometry,
  other: VolumeSliceGeometry
): number {
  const { origin, zDirection } = reference;

  return (
    (other.origin[0] - origin[0]) * zDirection[0] +
    (other.origin[1] - origin[1]) * zDirection[1] +
    (other.origin[2] - origin[2]) * zDirection[2]
  );
}

/** Whether two geometries have the same row, column and normal directions. */
function isSameDirections(
  previous: VolumeSliceGeometry,
  next: VolumeSliceGeometry
): boolean {
  return (
    isSamePoint(previous.xDirection, next.xDirection, DIRECTION_TOLERANCE) &&
    isSamePoint(previous.yDirection, next.yDirection, DIRECTION_TOLERANCE) &&
    isSamePoint(previous.zDirection, next.zDirection, DIRECTION_TOLERANCE)
  );
}

/**
 * Whether two geometries lie in the same plane, up to the rounding of a
 * camera that moved in its own plane. Two such geometries cut the same part of
 * the volume, whatever their pixel size. The slice index is not compared: for
 * an oblique plane it follows the focal point, which a pan moves.
 */
function isSamePlane(
  previous: VolumeSliceGeometry,
  next: VolumeSliceGeometry
): boolean {
  return (
    isSameDirections(previous, next) &&
    Math.abs(getPlaneDistance(previous, next)) <= POSITION_TOLERANCE
  );
}

/**
 * The sampling inputs that a presentation gives. NEAREST samples the nearest
 * voxel and puts an axis-aligned slice on the centre of its slice of voxels;
 * any other interpolation type samples linearly on the plane of the focal
 * point, as the GPU volume path does, whose default is linear.
 *
 * The slab follows the GPU volume path: `resolveSlabThickness` gives the
 * thickness, and a slab with no blend mode uses the average, the default slab
 * type of the vtk.js reslice mapper.
 */
export function getPlanarSampledSliceInputs(
  volume: IImageVolume,
  presentation: PlanarDataPresentation | undefined
): PlanarSampledSliceInputs {
  const thickness = resolveSlabThickness(presentation?.slabThickness);

  return {
    interpolationType:
      presentation?.interpolationType === InterpolationType.NEAREST
        ? InterpolationType.NEAREST
        : InterpolationType.LINEAR,
    slab:
      thickness > 0
        ? {
            thickness,
            blendMode:
              presentation?.blendMode ?? BlendModes.AVERAGE_INTENSITY_BLEND,
          }
        : undefined,
    timePoint: getActiveTimePoint(volume),
  };
}

/**
 * The active time point (dimension group number) of a dynamic volume, or
 * undefined for a volume with one time point.
 */
export function getActiveTimePoint(volume: IImageVolume): number | undefined {
  if (!volume.isDynamicVolume?.()) {
    return;
  }

  return (volume as unknown as IDynamicImageVolume).dimensionGroupNumber;
}

/**
 * The value of a pixel outside the volume: the lowest value of the volume, as
 * the voxel manager gives its range, or 0 when the volume has no range yet. The clipping planes hide those pixels; this value
 * is the second line of defence.
 */
export function getOutsideValue(volume: IImageVolume): number {
  const lowest = volume.voxelManager?.getRange?.()?.[0];

  return Number.isFinite(lowest) ? lowest : 0;
}

/**
 * The six planes of the faces of a volume, each keeping the inside. A face
 * lies half a voxel outside the centres of the outer voxels, which is the
 * space that the voxels cover. Each normal is perpendicular to its face also
 * when the axes of the volume are not perpendicular.
 */
export function getVolumeClipPlanes(
  volume: Pick<IImageVolume, 'dimensions' | 'direction' | 'origin' | 'spacing'>
): PlanarSliceClipPlane[] {
  const { dimensions, direction, origin, spacing } = volume;
  const axes = [0, 1, 2].map(
    (axis) =>
      [
        direction[axis * 3],
        direction[axis * 3 + 1],
        direction[axis * 3 + 2],
      ] as Point3
  );
  const planes: PlanarSliceClipPlane[] = [];

  axes.forEach((axisDirection, axis) => {
    const normal = getFaceNormal(
      axisDirection,
      axes[(axis + 1) % 3],
      axes[(axis + 2) % 3]
    );
    const lower = -0.5 * spacing[axis];
    const upper = (dimensions[axis] - 0.5) * spacing[axis];

    planes.push(
      {
        origin: offsetPoint(origin, axisDirection, lower),
        normal,
      },
      {
        origin: offsetPoint(origin, axisDirection, upper),
        normal: [-normal[0], -normal[1], -normal[2]],
      }
    );
  });

  return planes;
}

/**
 * The unit normal of the faces of one axis, perpendicular to the two other
 * axes and pointing along the axis.
 */
function getFaceNormal(
  axisDirection: Point3,
  firstOtherAxis: Point3,
  secondOtherAxis: Point3
): Point3 {
  const normal = vec3.cross(
    vec3.create(),
    firstOtherAxis as unknown as vec3,
    secondOtherAxis as unknown as vec3
  );

  if (vec3.dot(normal, axisDirection as unknown as vec3) < 0) {
    vec3.negate(normal, normal);
  }

  vec3.normalize(normal, normal);

  return [normal[0], normal[1], normal[2]];
}

function offsetPoint(
  point: Point3,
  direction: Point3,
  distance: number
): Point3 {
  return [
    point[0] + direction[0] * distance,
    point[1] + direction[1] * distance,
    point[2] + direction[2] * distance,
  ];
}

function isSamePoint(a: Point3, b: Point3, tolerance: number): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}

function isSameInputs(
  previous: PlanarSampledSliceInputs,
  next: PlanarSampledSliceInputs
): boolean {
  return (
    previous.interpolationType === next.interpolationType &&
    previous.timePoint === next.timePoint &&
    previous.slab?.thickness === next.slab?.thickness &&
    previous.slab?.blendMode === next.slab?.blendMode
  );
}
