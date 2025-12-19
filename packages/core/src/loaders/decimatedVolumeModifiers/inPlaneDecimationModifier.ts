import type Point3 from '../../types/Point3';
import type { ImageVolumeProps } from '../../types';
import type {
  DecimatedVolumeModifier,
  DecimatedVolumeModifierContext,
} from './types';

/**
 * In-Plane Decimation Modifier
 *
 * A volume modifier that reduces the resolution of a volume in the in-plane dimensions
 * (i and j axes). 
 *
 * The modifier:
 * - Applies decimation factors from `context.options.ijkDecimation` for the i and j dimensions
 * - Calculates new column and row dimensions by dividing the original dimensions by the decimation factors
 * - Adjusts pixel spacing proportionally (spacing increases by the decimation factor)
 * - Updates DICOM metadata (Columns, Rows, PixelSpacing) to reflect the new dimensions
 * - Leaves the k dimension (slices) unchanged
 *
 * If no decimation is specified or both factors are 1, the volume properties are returned unchanged.
 *
 * @example
 * // Decimate by factor of 2 in both i and j directions
 * const context = {
 *   options: { ijkDecimation: [2, 2, 1] }
 * };
 * // Original: 512x512x100, spacing [1, 1, 1]
 * // Result: 256x256x100, spacing [2, 2, 1]
 */
export const inPlaneDecimationModifier: DecimatedVolumeModifier = {
  name: 'InPlaneDecimationModifier',
  apply(volumeProps, context) {
    const [iDecimation = 1, jDecimation = iDecimation] =
      context.options.ijkDecimation ?? [];
    const columnFactor = Math.max(1, Math.floor(iDecimation));
    const rowFactor = Math.max(1, Math.floor(jDecimation));

    if (columnFactor === 1 && rowFactor === 1) {
      return volumeProps;
    }

    const [columns, rows] = volumeProps.dimensions;

    const newColumns = Math.max(1, Math.floor(columns / columnFactor));
    const newRows = Math.max(1, Math.floor(rows / rowFactor));

    const newDimensions = [
      newColumns,
      newRows,
      volumeProps.dimensions[2],
    ] as Point3;

    const newSpacing = [
      volumeProps.spacing[0] * columnFactor,
      volumeProps.spacing[1] * rowFactor,
      volumeProps.spacing[2],
    ] as Point3;

    const metadata = {
      ...volumeProps.metadata,
      Columns: newColumns,
      Rows: newRows,
      PixelSpacing: [newSpacing[1], newSpacing[0]],
    };

    return {
      ...volumeProps,
      dimensions: newDimensions,
      spacing: newSpacing,
      metadata,
    };
  },
};
