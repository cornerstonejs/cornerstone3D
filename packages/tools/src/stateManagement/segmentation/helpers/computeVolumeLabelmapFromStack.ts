import { internalComputeVolumeLabelmapFromStack } from '../SegmentationStateManager';

/**
 * Computes a volume segmentation from a stack of image IDs.
 *
 * @async
 * @param params - The parameters for computing the volume segmentation.
 * @param params.imageIds - An array of image IDs representing the stack.
 * @param [params.options={}] - Optional parameters for the computation.
 * @param [params.options.volumeId] - The ID to use for the created volume. If not provided, a new UUID will be generated.
 * @returns A promise that resolves to an object containing the volumeId of the created volume.
 */
export async function computeVolumeLabelmapFromStack(args) {
  return internalComputeVolumeLabelmapFromStack(args);
}
