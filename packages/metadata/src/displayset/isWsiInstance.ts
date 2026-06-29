import type { NaturalizedInstance } from './types';

// VL Whole Slide Microscopy Image Storage.
const WSI_SOP_CLASS_UIDS = new Set(['1.2.840.10008.5.1.4.1.1.77.1.6']);

/**
 * Returns true when the instance is whole-slide microscopy imaging - either the
 * VL Whole Slide Microscopy Image Storage SOP class or modality `SM`. Heuristic
 * aligned with OHIF's whole-slide microscopy SOP class handler; the default
 * split rules use it to group all microscopy levels of a series into a single
 * whole-slide display set.
 *
 * @param instance - the naturalized DICOM instance to classify.
 * @returns true if the instance is a whole-slide microscopy image.
 */
export function isWsiInstance(instance: NaturalizedInstance): boolean {
  if (WSI_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '')) {
    return true;
  }

  return instance.Modality === 'SM';
}
