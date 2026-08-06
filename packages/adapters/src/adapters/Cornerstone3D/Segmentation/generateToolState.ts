import { generateToolState as generateToolStateCornerstoneLegacy } from '../../Cornerstone/Segmentation';
import {
  createLabelmapsFromDICOMBuffer,
  createLabelmapsFromSegImageIds,
} from './labelmapImagesFromBuffer';

/**
 * generateToolState - Given a set of cornerstoneTools imageIds and a Segmentation buffer,
 * derive cornerstoneTools toolState and brush metadata.
 *
 * Legacy API: parses the Part 10 buffer and decodes pixels from dataset PixelData,
 * then delegates to createLabelmapsFromSegImageIds with synthetic frame imageIds.
 *
 * ## Return shape (cs3dVersion === 4, the default)
 * Returns whatever {@link createLabelmapsFromDICOMBuffer} returns:
 * `{ labelMapImages, segMetadata, segmentsOnFrame, centroids, overlappingSegments }`.
 *
 * This is a **breaking change from 4.x**: the old `labelmapBufferArray` and
 * `segmentsOnFrameArray` fields are gone. Segmentation pixels are now delivered as
 * cornerstone labelmap images (`labelMapImages`) rather than a single packed
 * buffer, because the loader creates per-frame derived labelmap images via the
 * image loader (enabling compressed source images).
 *
 * ## `skipOverlapping`
 * Accepted for signature compatibility but **no longer supported on the default
 * `cs3dVersion === 4` path** — it is silently ignored there. It is still forwarded
 * to the legacy implementation on the `cs3dVersion !== 4` branch. The option only
 * ever mattered to legacy consumers before OHIF supported returning overlapping
 * segments; the v4 loader always computes overlap and returns it via
 * `overlappingSegments`, so there is nothing to skip.
 *
 * @param imageIds - Referenced source imageIds (e.g. CT/MR stack).
 * @param arrayBuffer - The Part 10 SEG `ArrayBuffer`.
 * @param metadataProvider - Metadata provider.
 * @param skipOverlapping - Legacy-only; ignored when `cs3dVersion === 4`.
 * @param tolerance - Geometry matching tolerance.
 * @param cs3dVersion - Cornerstone3D major version; `4` (default) uses the new loader.
 */
function generateToolState(
  imageIds,
  arrayBuffer,
  metadataProvider,
  skipOverlapping = false,
  tolerance = 1e-3,
  cs3dVersion = 4
) {
  if (cs3dVersion !== 4) {
    return generateToolStateCornerstoneLegacy(
      imageIds,
      arrayBuffer,
      metadataProvider,
      skipOverlapping,
      tolerance,
      cs3dVersion
    );
  }

  return createLabelmapsFromDICOMBuffer(
    imageIds,
    arrayBuffer,
    metadataProvider,
    {
      tolerance,
      parserType: 'bitmap',
    }
  );
}

/**
 * Creates labelmap images from a SEG instance via per-frame imageIds (OHIF / imageLoader path).
 *
 * Note: despite the historical `createFromDICOMSegBuffer` name, this does NOT take a
 * Part 10 ArrayBuffer. The second argument is a SEG instance imageId; pixels are
 * sourced from the provided per-frame imageIds and decoder. Use
 * {@link createLabelmapsFromDICOMBuffer} / {@link generateToolState} for the buffer path.
 *
 * @param referencedImageIds - Referenced CT/MR imageIds
 * @param segImageId - SEG instance imageId for metadata (base or frame-qualified)
 * @param options.metadataProvider - Required metadata provider
 * @param [options.frameImageIds] - Optional. The list of per-frame loadable
 *   imageIds that make up the segmentation — i.e. the frames produced when the
 *   segmentation object is loaded. Only required for data sources whose
 *   imageIds do NOT follow the DICOMweb (WADO-RS) or WADO-URI conventions; for
 *   those the per-frame list is derived automatically from `segImageId` and
 *   does not need to be passed.
 * @param [options.getFrameImageId] - Optional `(baseSegImageId, frameNumber) => frame imageId`
 *   builder, an alternative to passing the full `frameImageIds` list.
 * @param [options.decodeImageData] - Optional `(frameImageId, frameNumber) => pixel data`;
 *   defaults to the cornerstone image loader.
 * @param [options.concurrency] - Optional max number of SEG frames fetched/decoded
 *   concurrently. Defaults to the loader's own default (16) when omitted.
 */
function createFromDicomSegImageId(
  referencedImageIds,
  segImageId,
  {
    metadataProvider,
    tolerance = 1e-3,
    parserType = 'bitmap',
    frameImageIds = undefined,
    getFrameImageId = undefined,
    decodeImageData = undefined,
    concurrency = undefined,
  }
) {
  return createLabelmapsFromSegImageIds(
    referencedImageIds,
    segImageId,
    metadataProvider,
    {
      tolerance,
      parserType,
      frameImageIds,
      getFrameImageId,
      decodeImageData,
      concurrency,
    }
  );
}

/**
 * @deprecated Renamed/split in 5.x. This wrapper is kept for backward
 * compatibility and will be removed in a future major.
 *
 * It preserves the original 4.x contract — a Part 10 SEG `ArrayBuffer` as the
 * second argument — by parsing the buffer and delegating to
 * {@link createLabelmapsFromDICOMBuffer}.
 *
 * - For the buffer path, prefer {@link createLabelmapsFromDICOMBuffer} or
 *   {@link generateToolState}.
 * - For the per-frame `imageId` path (OHIF / imageLoader), use
 *   {@link createFromDicomSegImageId}, whose second argument is a SEG instance
 *   `imageId` rather than an `ArrayBuffer`.
 */
function createFromDICOMSegBuffer(
  referencedImageIds,
  arrayBuffer,
  { metadataProvider, tolerance = 1e-3 }
) {
  return createLabelmapsFromDICOMBuffer(
    referencedImageIds,
    arrayBuffer,
    metadataProvider,
    {
      tolerance,
      parserType: 'bitmap',
    }
  );
}

export {
  generateToolState,
  createFromDicomSegImageId,
  createFromDICOMSegBuffer,
  createLabelmapsFromSegImageIds,
  createLabelmapsFromDICOMBuffer,
};
