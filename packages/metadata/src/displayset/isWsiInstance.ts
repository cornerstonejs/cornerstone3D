import { isTrue } from '../safeFunctions/values';
import type { DisplaySetContext } from './displaySetContext';
import { getContextValue } from './metadataContext';
import type { NaturalizedInstance } from './types';

/**
 * Returns true when the instance is whole slide microscopy: by default, its
 * SOP class is in `wholeSlideSopClassUids`, or its modality is `SM`.
 *
 * The test is the `isWsi` entry of `context`, else of the active metadata
 * context (`setMetadataContext`), so a customized list or expression applies,
 * and the answer is the same as in the rules.
 *
 * @param instance - the naturalized DICOM instance to classify.
 * @param context - the metadata context; defaults to the active context.
 */
export function isWsiInstance(
  instance: NaturalizedInstance,
  context?: DisplaySetContext
): boolean {
  return isTrue(getContextValue('isWsi', instance, context));
}
