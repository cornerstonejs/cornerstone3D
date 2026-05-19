import type { NaturalizedInstance } from './types';

const ECG_SOP_CLASS_UIDS = new Set([
  '1.2.840.10008.5.1.4.1.1.9.1.1',
  '1.2.840.10008.5.1.4.1.1.9.1.2',
  '1.2.840.10008.5.1.4.1.1.9.1.3',
  '1.2.840.10008.5.1.4.1.1.9.2.1',
  '1.2.840.10008.5.1.4.1.1.9.3.1',
]);

export function isEcgInstance(instance: NaturalizedInstance): boolean {
  return ECG_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '');
}
