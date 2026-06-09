import type { NaturalizedInstance } from './types';

// VL Whole Slide Microscopy Image Storage.
const WSI_SOP_CLASS_UIDS = new Set(['1.2.840.10008.5.1.4.1.1.77.1.6']);

/** Heuristic aligned with OHIF's whole-slide microscopy SOP class handler. */
export function isWsiInstance(instance: NaturalizedInstance): boolean {
  if (WSI_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '')) {
    return true;
  }

  return instance.Modality === 'SM';
}
