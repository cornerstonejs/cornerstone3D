import { registerVolumeLoader } from './volumeLoader';
import { generateVolumePropsFromImageIds } from '../utilities/generateVolumePropsFromImageIds';
import getScalingParameters from '../utilities/getScalingParameters';
import type {
  IImageVolume,
  Mat3,
  Metadata,
  PixelDataTypedArrayString,
  Point3,
} from '../types';
import { BRICK_LOADER_SCHEME, parseBrickVolumeId } from './brick/brickMetadata';
import { parseBrickManifest } from './brick/brickManifest';
import { createBrickFetcher } from './brick/brickFetch';
import { BrickVolumeController } from './brick/brickVolume';
import type { BrickManifest, DecodeBrickFn, FetchBrickFn } from './brick/types';

export interface BrickVolumeLoaderOptions {
  /** Instances of the source series, used to derive geometry and metadata. */
  imageIds?: string[];
  /** Explicit geometry, taking precedence over `imageIds`. */
  metadata?: Metadata;
  origin?: Point3;
  spacing?: Point3;
  direction?: Mat3;
  dataType?: PixelDataTypedArrayString;
  /**
   * Modality LUT, overriding what the source instances declare. Bricks store
   * raw values, so this is applied while scattering to match the frame path.
   */
  scaling?: { rescaleSlope: number; rescaleIntercept: number };
  /** Level fetched first. Defaults to the coarsest level in the manifest. */
  coarseLevel?: string;
  /** Level to refine toward once the coarse image is up. `null` to stop there. */
  refineToLevel?: string | null;
  /** Allocate at the coarse extent rather than full resolution. */
  reducedExtent?: boolean;
  /** Coarsest levels fetched in full regardless of camera. Defaults to 2. */
  alwaysFetchCoarsest?: number;
  /** Planes on screen at mount, so the first refinement is already selective. */
  displayedPlanes?: Array<{ normalWorld: Point3; pointWorld: Point3 }>;
  /** Index into each non-spatial axis, for 4D/5D stores. */
  indices?: number[];
  concurrency?: number;
  renderEveryNBricks?: number;
  /** Overridable for tests; defaults to a de-duplicating `fetch` wrapper. */
  fetchBrick?: FetchBrickFn;
  /**
   * Required. Decoding is injected so `core` keeps no dependency on the codec
   * packages — bind it to `decoders.JPEGLS` from `dicomImageLoader`.
   */
  decodeBrick?: DecodeBrickFn;
  /** Pre-fetched manifest, skipping the network round trip. */
  manifest?: BrickManifest;
}

interface BrickVolumeLoadObject {
  promise: Promise<IImageVolume>;
  cancel: () => void;
  /**
   * Same as `cancel`. `IVolumeLoadObject` names it `cancelFn` and
   * `cache._decacheVolume` calls that name, but every in-tree loader returns
   * only `cancel` — so the cache's cancel path silently no-ops for them.
   * Returning both makes cancellation on purge actually work.
   */
  cancelFn: () => void;
  decache: () => void;
}

const DEFAULT_METADATA: Metadata = {
  BitsAllocated: 16,
  BitsStored: 16,
  SamplesPerPixel: 1,
  HighBit: 15,
  PhotometricInterpretation: 'MONOCHROME2',
  PixelRepresentation: 0,
  ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
  PixelSpacing: [1, 1],
  Columns: 0,
  Rows: 0,
  FrameOfReferenceUID: '',
  Modality: 'CT',
  // A usable window matters beyond appearance: with no VOI in metadata,
  // `setDefaultVolumeVOI` falls back to loading the middle slice by imageId,
  // and the synthetic slice ids have no image loader. Real series override
  // this from `generateVolumePropsFromImageIds`.
  voiLut: [{ windowWidth: 400, windowCenter: 40 }],
  VOILUTFunction: 'LINEAR',
} as unknown as Metadata;

/**
 * Resolves volume geometry, preferring real DICOM metadata over defaults.
 *
 * A brick store carries pixels only — orientation, spacing, frame of reference
 * and rescale all stay authoritative in the DICOM instance — so the source
 * series is the right place to read geometry from whenever it is available.
 */
function resolveGeometry(
  volumeId: string,
  options: BrickVolumeLoaderOptions
): {
  metadata: Metadata;
  origin: Point3;
  spacing: Point3;
  direction: Mat3;
  dataType: PixelDataTypedArrayString;
  scaling?: { rescaleSlope: number; rescaleIntercept: number };
} {
  if (options.imageIds?.length) {
    const props = generateVolumePropsFromImageIds(options.imageIds, volumeId);

    // The modality LUT lives with the source instances, not in the brick store,
    // and must be applied on the way in so the buffer matches what the frame
    // path produces. `_determineDataType` has already widened the type to
    // Int16Array when the intercept is negative, so there is room for it.
    const middle = options.imageIds[Math.floor(options.imageIds.length / 2)];
    const { rescaleSlope, rescaleIntercept } = getScalingParameters(middle);

    return {
      metadata: options.metadata ?? props.metadata,
      origin: options.origin ?? (props.origin as Point3),
      spacing: options.spacing ?? (props.spacing as Point3),
      direction: options.direction ?? (props.direction as Mat3),
      dataType: options.dataType ?? props.dataType,
      scaling: options.scaling ?? { rescaleSlope, rescaleIntercept },
    };
  }

  return {
    metadata: options.metadata ?? DEFAULT_METADATA,
    origin: options.origin ?? [0, 0, 0],
    spacing: options.spacing ?? [1, 1, 1],
    direction: options.direction ?? [1, 0, 0, 0, 1, 0, 0, 0, 1],
    dataType: options.dataType ?? 'Uint16Array',
    scaling: options.scaling,
  };
}

/**
 * Volume loader for hierarchical brick stores.
 *
 * The volume id is `brick:<store root>`, e.g.
 * `brick:https://host/studies/{study}/series/{series}/brick/`.
 *
 * Loading is two-phase: a coarse level is fetched first so something is on
 * screen in one request, then — when `refineToLevel` is set — finer bricks are
 * fetched in an order driven by whatever planes the viewports are displaying.
 * The promise resolves after the coarse phase; refinement continues behind it.
 */
export function brickVolumeLoader(
  volumeId: string,
  options: BrickVolumeLoaderOptions = {}
): BrickVolumeLoadObject {
  if (!options.decodeBrick) {
    throw new Error(
      '[brick] options.decodeBrick is required — bind it to decoders.JPEGLS ' +
        'from @cornerstonejs/dicom-image-loader'
    );
  }

  const baseUrl = parseBrickVolumeId(volumeId);
  const fetchBrick = options.fetchBrick ?? createBrickFetcher();

  let controller: BrickVolumeController | undefined;

  const promise = (async () => {
    const rawManifest =
      options.manifest ??
      (JSON.parse(
        new TextDecoder().decode(
          await fetchBrick(
            `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}manifest.json`
          )
        )
      ) as BrickManifest);

    const manifest = parseBrickManifest(rawManifest);
    const geometry = resolveGeometry(volumeId, options);

    controller = new BrickVolumeController({
      volumeId,
      baseUrl,
      manifest,
      fetchBrick,
      decodeBrick: options.decodeBrick,
      coarseLevel: options.coarseLevel,
      refineToLevel: options.refineToLevel ?? null,
      reducedExtent: options.reducedExtent,
      displayedPlanes: options.displayedPlanes,
      alwaysFetchCoarsest: options.alwaysFetchCoarsest,
      indices: options.indices,
      concurrency: options.concurrency,
      renderEveryNBricks: options.renderEveryNBricks,
      ...geometry,
    });

    return controller.load();
  })();

  const cancel = () => controller?.cancel();

  return {
    promise,
    cancel,
    cancelFn: cancel,
    decache: () => controller?.destroy(),
  };
}

/** Registers {@link brickVolumeLoader} for the `brick:` scheme. */
export function registerBrickVolumeLoader(
  defaults: Pick<BrickVolumeLoaderOptions, 'decodeBrick' | 'fetchBrick'> = {}
): void {
  registerVolumeLoader(BRICK_LOADER_SCHEME, ((
    volumeId: string,
    options: BrickVolumeLoaderOptions = {}
  ) =>
    brickVolumeLoader(volumeId, {
      ...defaults,
      ...options,
    })) as Parameters<typeof registerVolumeLoader>[1]);
}

export default brickVolumeLoader;
