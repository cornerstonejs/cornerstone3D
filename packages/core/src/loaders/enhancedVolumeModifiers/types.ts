import type { ImageVolumeProps } from '../../types';
import type Point3 from '../../types/Point3';

namespace points {
  export type points3 = Point3;
}

/**
 * Shared options for enhanced volume modifiers.
 */
export interface EnhancedVolumeLoaderOptions {
  ijkDecimation?: points.points3;
}

/**
 * Context provided to each modifier in the chain.
 */
export interface EnhancedVolumeModifierContext {
  volumeId: string;
  imageIds: string[];
  options: EnhancedVolumeLoaderOptions;
}

/**
 * A modifier can transform any aspect of an ImageVolumeProps payload.
 */
export interface EnhancedVolumeModifier {
  name: string;
  apply(
    volumeProps: ImageVolumeProps,
    context: EnhancedVolumeModifierContext
  ): ImageVolumeProps;
}
