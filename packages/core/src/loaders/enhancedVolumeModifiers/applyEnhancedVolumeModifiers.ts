import type { ImageVolumeProps } from '../../types';
import type {
  EnhancedVolumeModifier,
  EnhancedVolumeModifierContext,
} from './types';

/**
 * Runs every modifier sequentially and returns the final props.
 */
export function applyEnhancedVolumeModifiers(
  baseProps: ImageVolumeProps,
  modifiers: EnhancedVolumeModifier[],
  context: EnhancedVolumeModifierContext
): ImageVolumeProps {
  return modifiers.reduce(
    (currentProps, modifier) => modifier.apply(currentProps, context),
    baseProps
  );
}
