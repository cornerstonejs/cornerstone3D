import type Point3 from '../../types/Point3';
import type { ImageVolumeProps } from '../../types';
import type {
  DecimatedVolumeModifier,
  DecimatedVolumeModifierContext,
} from './types';

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
