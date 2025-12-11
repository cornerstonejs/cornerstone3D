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
  console.log('[applyEnhancedVolumeModifiers] Starting modifier chain:', {
    modifierCount: modifiers.length,
    modifierNames: modifiers.map((m) => m.name),
    volumeId: context.volumeId,
  });

  return modifiers.reduce((currentProps, modifier, index) => {
    console.log(
      `[applyEnhancedVolumeModifiers] Applying modifier ${index + 1}/${modifiers.length}: ${modifier.name}`
    );
    const result = modifier.apply(currentProps, context);
    console.log(
      `[applyEnhancedVolumeModifiers] Modifier ${modifier.name} completed`
    );
    return result;
  }, baseProps);
}
