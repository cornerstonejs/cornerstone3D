import { IImage } from '../../types';
import { metaData } from '../..';
import getValidVOILUTFunction from './getValidVOILUTFunction';

export default function getImagePixelModule(image: IImage) {
  const imageId = image.imageId;

  const {
    pixelRepresentation,
    bitsAllocated,
    bitsStored,
    highBit,
    photometricInterpretation,
    samplesPerPixel,
  } = metaData.get('imagePixelModule', imageId);

  // we can grab the window center and width from the image object
  // since it the loader already has used the metadata provider
  // to get the values
  const { windowWidth, windowCenter, voiLUTFunction } = image;

  const { modality } = metaData.get('generalSeriesModule', imageId);
  const voiLUTFunctionEnum = getValidVOILUTFunction(voiLUTFunction);

  return {
    bitsAllocated,
    bitsStored,
    samplesPerPixel,
    highBit,
    photometricInterpretation,
    pixelRepresentation,
    windowWidth,
    windowCenter,
    modality,
    voiLUTFunction: voiLUTFunctionEnum,
  };
}
