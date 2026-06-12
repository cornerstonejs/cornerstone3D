import type { ModuleTagEntry } from './index';

/**
 * ECG module tags. Subset of instance data used for ECG display sets.
 * Same fields as General Series + SOP Common used by the OHIF ecg-dicom extension.
 */
export const tags: ModuleTagEntry[] = [
  'StudyInstanceUID',
  'SeriesInstanceUID',
  'SeriesDescription',
  'SeriesNumber',
  'SeriesDate',
  'SeriesTime',
  'Modality',
  'SOPInstanceUID',
  'SOPClassUID',
];
