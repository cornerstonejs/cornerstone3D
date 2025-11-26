import type { ImageVolumeProps } from '../../types';

/**
 * Shared options for enhanced volume modifiers.
 */
export interface EnhancedVolumeLoaderOptions {
  ijkDecimation?: [number, number, number];
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
