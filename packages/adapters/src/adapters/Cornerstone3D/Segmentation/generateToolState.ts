import { data as dcmjsData, utilities as dcmjsUtilities } from 'dcmjs';
import { generateToolState as generateToolStateCornerstoneLegacy } from '../../Cornerstone/Segmentation';
import { unpackPixelData } from '../../Cornerstone/Segmentation_4X';
import { createLabelmapsFromBufferInternal } from './labelmapImagesFromBuffer';

const { DicomMessage, DicomMetaDictionary } = dcmjsData;
const { decode: dcmjsDecode } = dcmjsUtilities.compression;
const maxBytesPerChunk = 199000000;

/**
 * Decodes a SEG DICOM array buffer into a naturalized dataset and a getPixelData() function.
 * Used when the caller has the buffer (e.g. OHIF) and needs to populate metadata and pass
 * uncompressed pixel data as options.segImage until a SEG-capable image loader is available.
 *
 * @param arrayBuffer - Raw SEG DICOM array buffer
 * @returns { dataset, getPixelData } - dataset is naturalized; getPixelData() returns unpacked pixel data (array or single TypedArray)
 */
export function decodeSEGBufferToNaturalizedAndPixelData(
  arrayBuffer: ArrayBuffer
): {
  dataset: Record<string, unknown>;
  getPixelData: () => Uint8Array | Uint16Array | (Uint8Array | Uint16Array)[];
} {
  const dicomData = DicomMessage.readFile(arrayBuffer);
  const dataset = DicomMetaDictionary.naturalizeDataset(
    dicomData.dict
  ) as Record<string, unknown>;
  (dataset as Record<string, unknown>)._meta =
    DicomMetaDictionary.namifyDataset(dicomData.meta);

  const transferSyntax = (
    dataset._meta as { TransferSyntaxUID?: { Value?: string[] } }
  )?.TransferSyntaxUID?.Value?.[0];
  let pixelDataChunks:
    | Uint8Array[]
    | Uint16Array[]
    | (Uint8Array | Uint16Array)[];

  if (transferSyntax === '1.2.840.10008.1.2.5') {
    const rleEncodedFrames = Array.isArray(dataset.PixelData)
      ? dataset.PixelData
      : [dataset.PixelData];
    const decoded = dcmjsDecode(
      rleEncodedFrames,
      dataset.Rows as number,
      dataset.Columns as number
    );
    pixelDataChunks = [decoded];
  } else {
    const chunks = unpackPixelData(
      dataset as Parameters<typeof unpackPixelData>[0],
      { maxBytesPerChunk }
    );
    if (!chunks) {
      throw new Error('Fractional segmentations are not yet supported');
    }
    pixelDataChunks = Array.isArray(chunks) ? chunks : [chunks];
  }

  return {
    dataset,
    getPixelData: () =>
      pixelDataChunks.length === 1 ? pixelDataChunks[0] : pixelDataChunks,
  };
}

/**
 * generateToolState - Given a set of cornerstoneTools imageIds and a Segmentation buffer,
 * derive cornerstoneTools toolState and brush metadata.
 *
 * @param   imageIds - An array of the imageIds.
 * @param   arrayBuffer - The SEG arrayBuffer.
 * @param   skipOverlapping - skip checks for overlapping segs, default value false.
 * @param   tolerance - default value 1.e-3.
 *
 * @returns a list of array buffer for each labelMap
 *  an object from which the segment metadata can be derived
 *  list containing the track of segments per frame
 *  list containing the track of segments per frame for each labelMap (available only for the overlapping case).
 */
function generateToolState(
  imageIds,
  arrayBuffer,
  metadataProvider,
  skipOverlapping = false,
  tolerance = 1e-3,
  cs3dVersion = 4
) {
  return generateToolStateCornerstoneLegacy(
    imageIds,
    arrayBuffer,
    metadataProvider,
    skipOverlapping,
    tolerance,
    cs3dVersion
  );
}

/**
 * Creates a segmentation tool state from a set of image IDs and a SEG instance loaded via its imageId.
 * The naturalized SEG dataset must be available from metadataProvider.get('instance', segImageId)
 * (e.g. dataset or instanceMeta.dataset). Uncompressed pixel data is obtained via imageLoader.loadImage(segImageId).
 *
 * @param referencedImageIds - An array of referenced image IDs e.g., CT, MR etc.
 * @param segImageId - Image ID for the SEG instance (loadable via imageLoader; instance metadata must be registered).
 * @param options - { metadataProvider, tolerance }
 *
 * @returns An object containing:
 *          - `labelMapImages`: Array of label map images for each label map.
 *          - `segMetadata`: Metadata related to the segmentation segments.
 *          - `segmentsOnFrame`: 2D array tracking segments per frame.
 *          - `centroids`: Map of centroid coordinates for each segment.
 *          - `overlappingSegments`: Boolean indicating if segments are overlapping.
 *
 * @throws Will throw an error if instance metadata is missing or if the loaded image has no getPixelData().
 */
function createFromDICOMSegBuffer(
  referencedImageIds,
  segImageId,
  { metadataProvider, tolerance = 1e-3 }
) {
  return createLabelmapsFromBufferInternal(
    referencedImageIds,
    segImageId,
    metadataProvider,
    {
      tolerance,
    }
  );
}

export { generateToolState, createFromDICOMSegBuffer };
