import { internalConvertStackToVolumeSegmentation } from '../SegmentationStateManager';
import { triggerSegmentationModified } from '../triggerSegmentationEvents';

/**
 * Converts a stack-based segmentation to a volume-based segmentation.
 *
 * @param params - The parameters for the conversion.
 * @param params.segmentationId - The segmentationId to convert.
 * @param [params.options] - The conversion options.
 * @param params.options.viewportId - The new viewportId to use for the segmentation.
 * @param [params.options.volumeId] - the new volumeId to use for the segmentation. If not provided, a new ID will be generated.
 * @param [params.options.newSegmentationId] - the new segmentationId to use for the segmentation. If not provided, a new ID will be generated.
 * @param [params.options.removeOriginal] - Whether or not to remove the original segmentation. Defaults to true.
 *
 * @returns A promise that resolves when the conversion is complete.
 */
export async function convertStackToVolumeSegmentation(args) {
  const result = internalConvertStackToVolumeSegmentation(args);
  triggerSegmentationModified(args.segmentationId);
  return result;
}
