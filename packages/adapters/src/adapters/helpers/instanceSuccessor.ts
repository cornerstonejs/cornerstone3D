import dcmjs from 'dcmjs';

import { copySeriesTags } from './copySeriesTags';

const { DicomMetaDictionary } = dcmjs.data;

export const INSTANCE_DEFAULTS = {
  SeriesNumber: '3201',
  InstanceNumber: '1',
  OperatorsName: '',
  ReferringPhysicianName: '',
  SpecificCharacterSet: 'ISO_IR 192',
  Manufacturer: 'cs3d',
  SOPInstanceUID: null,
};

/**
 * Updates base to add the previous options and to make reference to the
 * previous instance in the new instance, over-riding values in options.
 */
export function instanceSuccessor(base, previous, options) {
  const SOPInstanceUID = options?.SOPInstanceUID || DicomMetaDictionary.uid();

  if (previous) {
    Object.assign(base, copySeriesTags(previous));
    base.InstanceNumber = String(1 + Number(base.InstanceNumber || 0));
    base.PredecessorDocumentsSequence = {
      ReferencedStudyInstanceUID:
        options?.StudyInstanceUID || base.StudyInstanceUID,
      ReferencedSeriesSequence: {
        ReferencedSeriesInstanceUID:
          options?.SeriesInstanceUID || base.SeriesInstanceUID,
        ReferencedSOPSequence: {
          ReferencedSOPClassUID: options?.SOPClassUID || base.SOPClassUID,
          ReferencedSOPInstanceUID: SOPInstanceUID,
        },
      },
    };
  }
  if (options) {
    for (const [key, value] of Object.entries(base)) {
      if (options[key] !== undefined) {
        base[key] = options[key];
      }
    }
  }
  base.SOPInstanceUID ||= SOPInstanceUID;

  if (base.OtherPatientIDs !== undefined && !base.OtherPatientIDs?.length) {
    delete base.OtherPatientIDs;
  }
  return base;
}
