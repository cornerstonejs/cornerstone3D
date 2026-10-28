import { Events, MetadataModules } from '../../enums';
import eventTarget from '../../eventTarget';
import cache from '../../cache/cache';
import ImageVolume from '../../cache/classes/ImageVolume';
import VoxelManager from '../../utilities/VoxelManager';
import triggerEvent from '../../utilities/triggerEvent';
import autoLoad from '../../utilities/autoLoad';
import { createAndCacheLocalImage } from '../imageLoader';
import genericMetadataProvider from '../../utilities/genericMetadataProvider';
import { loaderLog } from '../../utilities/logger';
import type {
  IImageVolume,
  Mat3,
  Metadata,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  Point3,
} from '../../types';
import {
  brickExtent,
  brickKey,
  brickOriginVoxel,
  bricksForPlane,
  brickUrl,
  enumerateBricks,
  worldPlaneToIndex,
} from './brickAddressing';
import { writeBrickIntoVolume } from './deinterleaveBrick';
import { BrickQueue, type IndexPlane } from './brickScheduler';
import type {
  BrickCoord,
  DecodeBrickFn,
  FetchBrickFn,
  ResolvedBrickLevel,
  ResolvedBrickManifest,
} from './types';

const TYPED_ARRAYS = {
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Float32Array,
} as const;

const BYTES_PER_ELEMENT: Record<string, number> = {
  Uint8Array: 1,
  Int8Array: 1,
  Uint16Array: 2,
  Int16Array: 2,
  Float32Array: 4,
};

export interface BrickVolumeControllerOptions {
  volumeId: string;
  /** Store root, e.g. `https://host/studies/.../series/.../brick/`. */
  baseUrl: string;
  manifest: ResolvedBrickManifest;
  fetchBrick: FetchBrickFn;
  decodeBrick: DecodeBrickFn;
  metadata: Metadata;
  origin: Point3;
  direction: Mat3;
  /** Voxel spacing at full resolution. */
  spacing: Point3;
  dataType: PixelDataTypedArrayString;
  /**
   * Modality LUT to apply while scattering. Bricks hold raw stored values, so
   * without this the buffer is offset by the intercept relative to what the
   * streaming frame path produces.
   */
  scaling?: { rescaleSlope: number; rescaleIntercept: number };
  /** Level fetched first, for time to first image. Defaults to the coarsest usable. */
  coarseLevel?: string;
  /**
   * Level to refine toward once the coarse fill is on screen. `null` stops
   * after the coarse pass, which is the default for now so coarse loading can
   * be validated before full-resolution traffic is enabled.
   */
  refineToLevel?: string | null;
  /** Allocate at the coarse level's extent instead of full resolution. */
  reducedExtent?: boolean;
  /** Planes on screen at mount, so the first refinement is already selective. */
  displayedPlanes?: Array<{ normalWorld: Point3; pointWorld: Point3 }>;
  /** Index into each non-spatial axis. */
  indices?: number[];
  /**
   * Coarsest levels fetched in full regardless of camera, so the volume is
   * complete at low resolution before anything view-dependent is considered.
   * Cheap: for a 512x512x174 CT the two coarsest levels are ~476 KB total.
   */
  alwaysFetchCoarsest?: number;
  /** Bricks fetched concurrently. */
  concurrency?: number;
  /** Re-render after this many bricks land. */
  renderEveryNBricks?: number;
}

interface LoadStatus {
  loaded: boolean;
  loading: boolean;
  cancelled: boolean;
  callbacks: Array<(...args: unknown[]) => void>;
}

/**
 * Live controllers by volume id.
 *
 * The volume loader contract returns a volume, not a controller, but callers
 * need the controller to feed displayed planes into the scheduler. Keyed
 * lookup keeps that possible without widening the loader's return shape.
 */
const log = loaderLog.getLogger('brickVolume');

const controllers = new Map<string, BrickVolumeController>();

/** The controller driving a brick-backed volume, if it is still loading. */
export function getBrickVolumeController(
  volumeId: string
): BrickVolumeController | undefined {
  return controllers.get(volumeId);
}

/**
 * Re-targets a brick volume's outstanding fetches at the planes on screen.
 *
 * A no-op for volumes that are not brick-backed or have finished loading, so
 * callers can wire it to a camera event unconditionally.
 */
export function setBrickVolumeDisplayedPlanes(
  volumeId: string,
  planes: Array<{ normalWorld: Point3; pointWorld: Point3 }>
): boolean {
  const controller = controllers.get(volumeId);

  if (!controller) {
    return false;
  }

  controller.setDisplayedPlanes(planes);
  return true;
}

/**
 * Owns a brick-backed volume: its buffer, its per-slice cache entries, and the
 * fetch/decode/scatter loop that fills it.
 *
 * The buffer is allocated once at full extent and refined in place. That is
 * dictated by `vtkStreamingOpenGLTexture`, which uploads per z-slice by reading
 * `cache.getImage(imageIds[i]).voxelManager.getScalarData()` — there is no
 * 3-D sub-block upload path, so bricks must land in a buffer whose z-slices are
 * exposed as individual cached images.
 */
export class BrickVolumeController {
  private readonly options: BrickVolumeControllerOptions;
  private readonly manifest: ResolvedBrickManifest;
  private readonly coarseLevel: ResolvedBrickLevel;
  private readonly targetLevel: ResolvedBrickLevel;
  /**
   * Finest level actually fetched. Distinct from {@link targetLevel}, which is
   * only the allocation extent — the buffer is always full size so it can be
   * refined in place, even when we never fetch beyond the coarse level.
   */
  private readonly fetchTarget: ResolvedBrickLevel;
  private readonly targetDimensions: Point3;
  private readonly targetSpacing: Point3;
  private readonly indices: number[];

  private buffer!: PixelDataTypedArray;
  private volume!: IImageVolume;
  private queue!: BrickQueue;
  private abort = new AbortController();

  private readonly loadStatus: LoadStatus = {
    loaded: false,
    loading: false,
    cancelled: false,
    callbacks: [],
  };

  private planes: IndexPlane[] = [];
  /**
   * Bricks already fetched or in flight, keyed by position.
   *
   * Every enqueue path filters against this, so a brick is fetched at most
   * once no matter how many viewports ask for it or how often the camera
   * moves. This is what makes it safe to let each viewport dump its own needs
   * into the pool without coordinating them.
   */
  private readonly resident = new Set<string>();
  /** Outstanding count per level, for completion logging. */
  private readonly pendingByLevel = new Map<string, number>();
  private readonly levelStarted = new Map<string, number>();
  /** Set while `drain` is running, so enqueues do not start a second loop. */
  private draining = false;
  private bricksDone = 0;
  private bricksTotal = 0;
  private sinceRender = 0;
  private decodeChain: Promise<unknown> = Promise.resolve();

  constructor(options: BrickVolumeControllerOptions) {
    this.options = options;
    this.manifest = options.manifest;
    this.indices = options.indices ?? [];

    const { levelsByName, levels } = this.manifest;

    this.coarseLevel = options.coarseLevel
      ? requireLevel(levelsByName, options.coarseLevel)
      : levels[0];

    // Full resolution unless explicitly reduced. Full extent is what makes
    // in-place refinement possible; a reduced extent can never be sharpened.
    this.targetLevel = options.reducedExtent
      ? this.coarseLevel
      : this.manifest.baseLevel;

    this.targetDimensions = this.targetLevel.dimensions;
    // Per axis, because the factors are per axis: a level reduced 8x in-plane and
    // 2x through-plane has 8x the pixel spacing but only 2x the slice spacing, and
    // collapsing that to one number renders the volume at the wrong length.
    this.targetSpacing = [0, 1, 2].map(
      (axis) => options.spacing[axis] * this.targetLevel.factors[axis]
    ) as Point3;

    this.fetchTarget = options.refineToLevel
      ? requireLevel(levelsByName, options.refineToLevel)
      : this.coarseLevel;

    controllers.set(options.volumeId, this);
  }

  /** The volume, once {@link load} has created it. */
  getVolume(): IImageVolume {
    return this.volume;
  }

  /**
   * Creates the volume, fills it from the coarse level, and — when
   * `refineToLevel` is set — continues refining in the background.
   *
   * Resolves as soon as the coarse fill is on screen; refinement does not block
   * it, since the whole point is a fast first image.
   */
  async load(): Promise<IImageVolume> {
    this.createVolume();
    this.loadStatus.loading = true;

    if (this.options.displayedPlanes?.length) {
      this.setDisplayedPlanes(this.options.displayedPlanes);
    }

    // The coarsest levels go in whole, camera or not, so there is a complete
    // low-resolution volume before anything view-dependent is considered.
    const baseline = this.baselineLevels();

    for (const level of baseline) {
      this.enqueue(level, enumerateBricks(level, this.indices));
    }

    // Resolve once the coarsest level is up — that is the first usable image.
    await this.drainUntil(baseline[0]);

    if (this.targetIsBaseline()) {
      this.finish();
      return this.volume;
    }

    // With no camera there is nothing to be selective about, and stopping at
    // the baseline would quietly ignore `refineToLevel`. Queue the rest in
    // full; once planes arrive the camera path takes over and `resident`
    // stops anything being fetched twice.
    if (!this.planes.length) {
      const { levels } = this.manifest;
      const to = levels.indexOf(this.fetchTarget);

      for (
        let i = levels.indexOf(baseline[baseline.length - 1]) + 1;
        i <= to;
        i++
      ) {
        this.enqueue(levels[i], enumerateBricks(levels[i], this.indices));
      }
    }

    // Everything else continues behind the resolved promise.
    void this.drain();

    return this.volume;
  }

  /**
   * Levels fetched in full regardless of camera, coarsest first.
   *
   * Deliberately stops short of {@link fetchTarget}: the finest level requested
   * is the expensive one and is exactly what should be camera-driven, so
   * fetching it unconditionally would defeat the point of a brick store. On a
   * short pyramid this collapses to just the coarse level.
   */
  private baselineLevels(): ResolvedBrickLevel[] {
    const { levels } = this.manifest;
    const from = levels.indexOf(this.coarseLevel);
    const count = Math.max(1, this.options.alwaysFetchCoarsest ?? 2);
    const lastUnconditional = levels.indexOf(this.fetchTarget) - 1;
    const to = Math.max(from, Math.min(from + count - 1, lastUnconditional));

    return levels.slice(from, to + 1);
  }

  private targetIsBaseline(): boolean {
    return this.fetchTarget === this.coarseLevel;
  }

  /**
   * Adds bricks not already fetched or in flight.
   *
   * Filtering against {@link resident} here is what lets every viewport enqueue
   * independently: overlapping requests collapse instead of being fetched twice.
   */
  private enqueue(level: ResolvedBrickLevel, coords: BrickCoord[]): number {
    const fresh = coords.filter((coord) => !this.resident.has(brickKey(coord)));

    if (!fresh.length) {
      return 0;
    }

    for (const coord of fresh) {
      this.resident.add(brickKey(coord));
    }

    if (!this.pendingByLevel.has(level.name)) {
      this.levelStarted.set(level.name, Date.now());
    }

    this.pendingByLevel.set(
      level.name,
      (this.pendingByLevel.get(level.name) ?? 0) + fresh.length
    );

    this.queue.add(fresh);
    this.bricksTotal += fresh.length;

    return fresh.length;
  }

  /** Records one brick as done and logs the level when it empties. */
  private settle(coord: BrickCoord): void {
    const remaining = (this.pendingByLevel.get(coord.level) ?? 1) - 1;

    if (remaining > 0) {
      this.pendingByLevel.set(coord.level, remaining);
      return;
    }

    this.pendingByLevel.delete(coord.level);

    const level = this.manifest.levelsByName.get(coord.level);
    const started = this.levelStarted.get(coord.level);
    const took = started ? Date.now() - started : 0;
    const fetched = [...this.resident].filter((key) =>
      key.startsWith(`${coord.level}/`)
    ).length;

    log.info(
      `${coord.level} complete: ${fetched}/${level?.brickCount ?? '?'} bricks ` +
        `in ${took} ms` +
        (level && fetched < level.brickCount ? ' (visible only)' : '')
    );
  }

  /**
   * Re-targets outstanding work at the planes currently on screen.
   *
   * Ordering only — the same bricks are fetched either way, just sooner.
   */
  setDisplayedPlanes(
    planes: Array<{ normalWorld: Point3; pointWorld: Point3 }>
  ): void {
    if (!this.queue) {
      return;
    }

    const geometry = {
      origin: this.options.origin,
      spacing: this.targetSpacing,
      direction: this.options.direction,
    };

    const indexPlanes: IndexPlane[] = planes.map((plane) =>
      worldPlaneToIndex(plane.normalWorld, plane.pointWorld, geometry)
    );

    this.planes = indexPlanes;
    this.queue.setPlanes(indexPlanes);

    // Everything this view needs, coarsest first. Enqueued per call rather than
    // reconciled across viewports: `resident` collapses the overlap, and the
    // queue's ordering sorts out what to fetch first, so two panes asking for
    // different levels need no coordination between them.
    const { levels } = this.manifest;
    const to = levels.indexOf(this.fetchTarget);
    let added = 0;

    for (let i = 0; i <= to; i++) {
      added += this.enqueue(levels[i], this.bricksForLevel(levels[i]));
    }

    if (added && !this.loadStatus.cancelled) {
      this.loadStatus.loaded = false;
      void this.drain();
    }
  }

  /** Stops in-flight work. Anything already written stays. */
  cancel(): void {
    controllers.delete(this.options.volumeId);
    this.loadStatus.cancelled = true;
    this.loadStatus.loading = false;
    this.loadStatus.callbacks.length = 0;
    this.queue?.clear();
    this.abort.abort();
  }

  destroy(): void {
    this.cancel();
    controllers.delete(this.options.volumeId);
    this.volume?.destroy?.();
  }

  /**
   * Registers metadata for a synthetic slice image id.
   *
   * The slices are cache-only images with an invented id, so nothing else
   * provides metadata for them. Without this, consumers that query by imageId
   * fall through to loading the id — and `loadAndCacheImage` dispatches to an
   * image loader *before* consulting the cache, so a cache-resident image still
   * throws "No image loader found for scheme". `setDefaultVolumeVOI` does
   * exactly that when deriving the default window level.
   *
   * Registering the source series' modules also means window/level comes from
   * the real DICOM rather than being computed from a slice's min/max.
   */
  private registerSliceMetadata(imageId: string, z: number): void {
    const { metadata, origin, direction } = this.options;
    const [dx, dy] = this.targetDimensions;

    genericMetadataProvider.add(imageId, {
      type: MetadataModules.VOI_LUT,
      metadata: {
        windowWidth: metadata.voiLut?.[0]?.windowWidth,
        windowCenter: metadata.voiLut?.[0]?.windowCenter,
        voiLUTFunction: metadata.VOILUTFunction,
      },
    });

    genericMetadataProvider.add(imageId, {
      type: MetadataModules.GENERAL_SERIES,
      metadata: {
        modality: metadata.Modality,
        seriesInstanceUID: metadata.SeriesInstanceUID,
      },
    });

    genericMetadataProvider.add(imageId, {
      type: MetadataModules.IMAGE_PIXEL,
      metadata: {
        samplesPerPixel: metadata.SamplesPerPixel ?? 1,
        photometricInterpretation: metadata.PhotometricInterpretation,
        rows: dy,
        columns: dx,
        bitsAllocated: metadata.BitsAllocated,
        bitsStored: metadata.BitsStored,
        highBit: metadata.HighBit,
        pixelRepresentation: metadata.PixelRepresentation,
      },
    });

    genericMetadataProvider.add(imageId, {
      type: MetadataModules.IMAGE_PLANE,
      metadata: {
        imageOrientationPatient: direction.slice(0, 6),
        rowCosines: direction.slice(0, 3),
        columnCosines: direction.slice(3, 6),
        imagePositionPatient: [
          origin[0] + direction[6] * this.targetSpacing[2] * z,
          origin[1] + direction[7] * this.targetSpacing[2] * z,
          origin[2] + direction[8] * this.targetSpacing[2] * z,
        ],
        pixelSpacing: [this.targetSpacing[1], this.targetSpacing[0]],
        rowPixelSpacing: this.targetSpacing[1],
        columnPixelSpacing: this.targetSpacing[0],
        sliceThickness: this.targetSpacing[2],
        rows: dy,
        columns: dx,
      },
    });
  }

  private createVolume(): void {
    const { volumeId, dataType, metadata, origin, direction } = this.options;
    const [dx, dy, dz] = this.targetDimensions;

    const Ctor = TYPED_ARRAYS[dataType as keyof typeof TYPED_ARRAYS];

    if (!Ctor) {
      throw new Error(`[brick] Unsupported dataType "${dataType}"`);
    }

    const sliceLength = dx * dy;
    const byteLength = sliceLength * dz * BYTES_PER_ELEMENT[dataType];

    if (!cache.isCacheable(byteLength)) {
      throw new Error(
        `[brick] Volume ${volumeId} needs ${byteLength} bytes, which exceeds ` +
          'the available cache budget'
      );
    }

    this.buffer = new Ctor(sliceLength * dz) as PixelDataTypedArray;

    // One cached image per z-slice, each a *view* onto the shared buffer.
    // `createAndCacheLocalImage` assigns the scalar data verbatim, so bricks
    // scattered into `this.buffer` are visible through these with no copying.
    const imageIds: string[] = [];

    for (let z = 0; z < dz; z++) {
      const imageId = `${volumeId}_slice_${z}`;
      imageIds.push(imageId);

      createAndCacheLocalImage(imageId, {
        scalarData: this.buffer.subarray(
          z * sliceLength,
          (z + 1) * sliceLength
        ) as PixelDataTypedArray,
        dimensions: [dx, dy],
        spacing: [this.targetSpacing[0], this.targetSpacing[1]],
        origin,
        direction,
        targetBuffer: { type: dataType },
      });

      this.registerSliceMetadata(imageId, z);
    }

    const volume = new ImageVolume({
      volumeId,
      metadata,
      dimensions: this.targetDimensions,
      spacing: this.targetSpacing,
      origin,
      direction,
      imageIds,
      dataType,
    });

    volume.voxelManager = VoxelManager.createImageVolumeVoxelManager({
      imageIds,
      dimensions: this.targetDimensions,
      numberOfComponents: 1,
      id: volumeId,
    });

    // `ImageVolume.load` is an explicit no-op stub, but render paths call
    // `volume.load(() => requestRender())` and rely on the callback. Fill it in
    // so brick-backed volumes behave like streaming ones.
    volume.loadStatus = this.loadStatus as unknown as Record<string, unknown>;
    volume.load = (callback?: (...args: unknown[]) => void) => {
      if (this.loadStatus.loaded) {
        callback?.();
        return;
      }
      if (callback) {
        this.loadStatus.callbacks.push(callback);
      }
    };

    this.volume = volume;
    this.queue = new BrickQueue(this.manifest.levelsByName);
  }

  /** Fetches and writes every brick of a level. */
  /**
   * Bricks worth fetching for a level.
   *
   * Limited to those the displayed planes cut, which is the whole point of a
   * brick store: a sagittal view needs one column of bricks, not the level. If
   * no planes have been reported there is nothing to be selective about, so
   * fall back to the whole level.
   */
  private bricksForLevel(level: ResolvedBrickLevel): BrickCoord[] {
    if (!this.planes.length) {
      return enumerateBricks(level, this.indices);
    }

    const seen = new Set<string>();
    const coords: BrickCoord[] = [];

    // `this.planes` are in full-resolution index space, but each level has its
    // own grid — a d4 voxel spans four d1 voxels. Without this division the
    // plane lands outside the coarser level's extent entirely and selects
    // nothing, so the intermediate levels silently fetch no bricks.
    const f = level.factors;

    for (const plane of this.planes) {
      const pointIJK = [0, 1, 2].map(
        (axis) => plane.pointIJK[axis] / f[axis]
      ) as Point3;

      // The normal has to be scaled by the same factors, not merely carried
      // over. Substituting base = level * f into n · (base - q) = 0 leaves
      // n[a] * f[a] as the level-space normal. With uniform factors that is a
      // pure scale and the direction survives, which is why this could be
      // skipped before; with [8, 8, 2] it is a different plane, tilted towards
      // the axis that was reduced least, and the wrong bricks get selected.
      const normalIJK = [0, 1, 2].map(
        (axis) => plane.normalIJK[axis] * f[axis]
      ) as Point3;

      for (const coord of bricksForPlane(level, normalIJK, pointIJK)) {
        const key = `${coord.kz}/${coord.ky}/${coord.kx}`;

        if (!seen.has(key)) {
          seen.add(key);
          coords.push({ ...coord, indices: this.indices });
        }
      }
    }

    return coords;
  }

  /**
   * Runs `concurrency` fetch workers over the queue.
   *
   * Fetches overlap, decodes do not: the JPEG-LS decoder is a non-re-entrant
   * singleton whose output aliases WASM heap memory, so decode-and-copy is
   * serialised through {@link decodeChain}.
   */
  /**
   * Drains the queue until it is empty, newest priorities first.
   *
   * One continuous loop rather than a wait per level: the queue already orders
   * coarse before fine, so bricks enqueued by a camera move slot into the right
   * place without the drain having to know about levels or viewports at all.
   * The level a brick belongs to is carried on the coord.
   */
  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;
    const concurrency = Math.max(1, this.options.concurrency ?? 6);

    const worker = async () => {
      for (;;) {
        if (this.loadStatus.cancelled) {
          return;
        }

        const [coord] = this.queue.take(1);

        if (!coord) {
          return;
        }

        const level = this.manifest.levelsByName.get(coord.level);

        try {
          if (level) {
            await this.loadBrick(level, coord);
          }
        } catch (error) {
          if (this.loadStatus.cancelled) {
            return;
          }
          // A missing or corrupt brick degrades resolution locally; it should
          // not fail the whole volume.
          console.warn(
            `[brick] Skipping ${brickUrl(
              this.options.baseUrl,
              this.manifest,
              coord
            )}`,
            error
          );
        } finally {
          this.settle(coord);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    } finally {
      this.draining = false;
    }

    if (this.queue.size) {
      // A camera move landed work while we were finishing; keep going.
      await this.drain();
      return;
    }

    this.finish();
  }

  /**
   * Drains only until `level` has no bricks outstanding.
   *
   * Used for the opening fetch so `load()` can resolve on the first usable
   * image while the rest continues behind it.
   */
  private async drainUntil(level: ResolvedBrickLevel): Promise<void> {
    const concurrency = Math.max(1, this.options.concurrency ?? 6);

    const worker = async () => {
      while (this.pendingByLevel.has(level.name)) {
        if (this.loadStatus.cancelled) {
          return;
        }

        const [coord] = this.queue.take(1);

        if (!coord) {
          return;
        }

        const target = this.manifest.levelsByName.get(coord.level);

        try {
          if (target) {
            await this.loadBrick(target, coord);
          }
        } catch (error) {
          if (this.loadStatus.cancelled) {
            return;
          }
          console.warn(
            `[brick] Skipping ${brickUrl(
              this.options.baseUrl,
              this.manifest,
              coord
            )}`,
            error
          );
        } finally {
          this.settle(coord);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  private async loadBrick(
    level: ResolvedBrickLevel,
    coord: BrickCoord
  ): Promise<void> {
    const url = brickUrl(this.options.baseUrl, this.manifest, coord);
    const bytes = await this.options.fetchBrick(url, this.abort.signal);

    if (this.loadStatus.cancelled) {
      return;
    }

    // Serialise decode + copy-out. The decoded pixel data is a view onto the
    // codec's heap and is invalidated by the next decode.
    const run = this.decodeChain.then(async () => {
      if (this.loadStatus.cancelled) {
        return;
      }

      const decoded = await this.options.decodeBrick(bytes, {
        signed: (this.options.metadata.PixelRepresentation ?? 0) === 1,
        bytesPerPixel: BYTES_PER_ELEMENT[this.options.dataType] ?? 2,
      });

      this.writeBrick(level, coord, decoded.pixelData);
    });

    this.decodeChain = run.catch(() => undefined);

    await run;
  }

  private writeBrick(
    level: ResolvedBrickLevel,
    coord: BrickCoord,
    pixelData: PixelDataTypedArray
  ): void {
    // Per axis: a level may be reduced by different factors on different axes, so
    // one source voxel can span 8 destination voxels in-plane and 2 through-plane.
    const factor = [0, 1, 2].map(
      (axis) => level.factors[axis] / this.targetLevel.factors[axis]
    ) as Point3;

    const extent = brickExtent(level, coord);

    const { zStart, zEnd } = writeBrickIntoVolume({
      source: pixelData,
      // What the codestream was packed at: its true extent unless the store pads
      // edge bricks out to the full brick size.
      sourceSize: this.manifest.brickPadding ? level.brickSize : extent,
      brickOrder: this.manifest.brickOrder,
      extent,
      originVoxel: brickOriginVoxel(level, coord),
      dest: this.buffer,
      destDimensions: this.targetDimensions,
      scaling: this.options.scaling,
      factor,
    });

    if (zStart >= 0) {
      // Mark exactly the slices this brick touched; anything else would
      // re-upload the whole texture on every brick.
      for (let z = zStart; z <= zEnd; z++) {
        this.volume.vtkOpenGLTexture?.setUpdatedFrame?.(z);
      }
    }

    this.bricksDone += 1;
    this.sinceRender += 1;

    this.notifyModified();
  }

  private notifyModified(): void {
    triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, {
      volumeId: this.options.volumeId,
      FrameOfReferenceUID: this.options.metadata.FrameOfReferenceUID,
      numberOfFrames: this.bricksTotal,
      framesProcessed: this.bricksDone,
    });

    const every = Math.max(1, this.options.renderEveryNBricks ?? 8);

    if (this.sinceRender >= every) {
      this.sinceRender = 0;
      this.volume.modified();
      autoLoad(this.options.volumeId);
    }
  }

  private finish(): void {
    if (this.loadStatus.loaded || this.loadStatus.cancelled) {
      return;
    }

    this.loadStatus.loaded = true;
    this.loadStatus.loading = false;

    // Nothing left to re-prioritise once every brick has landed.
    controllers.delete(this.options.volumeId);

    this.volume.modified();
    autoLoad(this.options.volumeId);

    const callbacks = [...this.loadStatus.callbacks];
    this.loadStatus.callbacks.length = 0;

    for (const callback of callbacks) {
      callback({ volumeId: this.options.volumeId });
    }

    triggerEvent(eventTarget, Events.IMAGE_VOLUME_LOADING_COMPLETED, {
      volumeId: this.options.volumeId,
      FrameOfReferenceUID: this.options.metadata.FrameOfReferenceUID,
    });
  }
}

function requireLevel(
  levels: Map<string, ResolvedBrickLevel>,
  name: string
): ResolvedBrickLevel {
  const level = levels.get(name);

  if (!level) {
    throw new Error(
      `[brick] Manifest has no level "${name}" (has ${[...levels.keys()].join(
        ', '
      )})`
    );
  }

  return level;
}
