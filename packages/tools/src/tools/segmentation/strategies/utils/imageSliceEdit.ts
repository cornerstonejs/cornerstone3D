import type { InitializedOperationData } from '../BrushStrategy';

/**
 * True when the edit indexes one image slice, as a 2D brush in a stack
 * viewport does. A 3D strategy in a stack viewport (a sphere) edits the
 * segmentation volume instead, and then indexes the volume. A volume edit has
 * no labelmap image id.
 */
function isImageSliceEdit(operationData: InitializedOperationData): boolean {
  const dimensions = operationData.segmentationVoxelManager?.dimensions;

  return !!operationData.imageId && (dimensions?.[2] ?? 1) <= 1;
}

export { isImageSliceEdit };
