import imageIdToURI from './imageIdToURI';
import { IImageCalibration } from '../types';

const state: Record<string, IImageCalibration> = {}; // Calibrated pixel spacing per imageId

/**
 * Simple metadataProvider object to store metadata for calibrated spacings.
 * This can be added via cornerstone.metaData.addProvider(...) in order to store
 * and return calibrated pixel spacings when metaData type is "calibratedPixelSpacing".
 */
const metadataProvider = {
  /**
   * Adds metadata for an imageId.
   * @param imageId - the imageId for the metadata to store
   * @param payload - the payload composed of new calibrated pixel spacings
   */
  add: (imageId: string, payload: IImageCalibration): void => {
    const imageURI = imageIdToURI(imageId);
    state[imageURI] = payload;
  },

  /**
   * Returns the metadata for an imageId if it exists.
   * @param type - the type of metadata to enquire about
   * @param imageId - the imageId to enquire about
   * @returns the calibrated pixel spacings for the imageId if it exists, otherwise undefined
   */
  get: (type: string, imageId: string): IImageCalibration => {
    if (type === 'calibratedPixelSpacing') {
      const imageURI = imageIdToURI(imageId);
      return state[imageURI];
    }
  },
};

export default metadataProvider;
