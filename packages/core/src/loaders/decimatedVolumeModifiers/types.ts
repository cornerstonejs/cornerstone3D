import type { ImageVolumeProps } from '../../types';
import type Point3 from '../../types/Point3';

export namespace points {
  export type points3 = Point3;
}

/**
 * Shared options for decimated volume modifiers.
 */
export interface DecimatedVolumeLoaderOptions {
  ijkDecimation?: points.points3;
}

/**
 * Context provided to each modifier in the chain.
 */
export interface DecimatedVolumeModifierContext {
  volumeId: string;
  imageIds: string[];
  options: DecimatedVolumeLoaderOptions;
}

/**
 * A modifier can transform any aspect of an ImageVolumeProps payload.
 */
export interface DecimatedVolumeModifier {
  name: string;
  apply(
    volumeProps: ImageVolumeProps,
    context: DecimatedVolumeModifierContext
  ): ImageVolumeProps;
}
