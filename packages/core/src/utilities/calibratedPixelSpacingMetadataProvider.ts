import imageIdToURI from './imageIdToURI';
import type { IImageCalibration } from '../types/IImageCalibration';
import { MetadataModules } from '../enums';
import { clearQuery } from '../metaData';

/** Calibrated pixel spacing per imageId */
const state = new Map<string, IImageCalibration>();

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
    state.set(imageURI, payload);
    clearQuery(MetadataModules.IMAGE_PLANE, imageId);
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
      return state.get(imageURI);
    }
  },

  clear: () => {
    state.clear();
  },
};

export default metadataProvider;
