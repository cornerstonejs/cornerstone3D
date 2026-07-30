import { utilities } from '@cornerstonejs/metadata';

const { addDicomPart10Instance } = utilities;

type Part10Input =
  | ArrayBuffer
  | Uint8Array
  | (() => ArrayBuffer | Uint8Array | Promise<ArrayBuffer | Uint8Array>);

/**
 * Registers a full Part 10 multiframe instance into the NATURALIZED metadata
 * registry (the single uniform frame registry) so that subsequent per-frame
 * image loads — WADO-RS (`loadImageFromCompressedFrameRegistry`) and WADO-URI
 * (`loadImageFromNaturalizedMetadata`) — are served from the registry's
 * compressed frame data instead of issuing one network request per frame.
 *
 * Parsing is done by `addDicomPart10Instance`, which uses the dcmjs
 * AsyncDicomReader; the decode path for each frame is unchanged.
 *
 * @param baseImageId - The instance imageId. Frame qualifiers (`/frames/N`,
 *   `?frame=N`, `&frame=N`) are normalized away by the registry, so passing a
 *   base or a frame imageId resolves to the same instance key.
 * @param part10 - The Part 10 `ArrayBuffer`/`Uint8Array`, or a (possibly async)
 *   resolver returning it. A resolver lets the fetch start lazily and be
 *   raced against a deadline by the caller.
 * @returns A promise that resolves once the instance is parsed and registered.
 */
export function prefetchPart10Instance(
  baseImageId: string,
  part10: Part10Input
) {
  return addDicomPart10Instance(baseImageId, part10);
}

export default prefetchPart10Instance;
