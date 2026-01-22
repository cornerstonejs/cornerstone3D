import type { ImageVolumeProps } from '../../types';
import type {
  DecimatedVolumeModifier,
  DecimatedVolumeModifierContext,
} from './types';

/**
 * Runs every modifier sequentially and returns the final props.
 */
export function applyDecimatedVolumeModifiers(
  baseProps: ImageVolumeProps,
  modifiers: DecimatedVolumeModifier[],
  context: DecimatedVolumeModifierContext
): ImageVolumeProps {
  return modifiers.reduce(
    (currentProps, modifier) => modifier.apply(currentProps, context),
    baseProps
  );
}
