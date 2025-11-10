import dcmjs from 'dcmjs';
import { copySeriesTags } from '../../../helpers';

const { DicomMetaDictionary } = dcmjs.data;

/**
 * Gets the naturalized RT series metadata module, assigning default
 * values from options, and providing a reference to a predecessor if needed.
 */
export default function getRTSeriesModule(predecessorInstance, options) {
  const result = {
    SeriesInstanceUID:
      predecessorInstance?.SeriesInstanceUID || DicomMetaDictionary.uid(), // generate a new series instance uid
    SeriesNumber: options.SeriesNumber || '3100',
    SeriesDescription: options.SeriesDescription || '',
    InstanceNumber: '1',
  };
  if (predecessorInstance) {
    const seriesTags = copySeriesTags(predecessorInstance);
    Object.assign(result, seriesTags);
    seriesTags.InstanceNumber = String(1 + Number(seriesTags.InstanceNumber));
  }
  return result;
}
