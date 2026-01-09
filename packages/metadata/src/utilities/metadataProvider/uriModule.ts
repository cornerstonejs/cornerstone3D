import { MetadataModules } from '../../enums/MetadataModules';
import { addTypedProvider } from '../../metaData';

export interface UriModule {
  baseImageId: string;
  frameNumber?: number;
  framesString?: string;
  remaining?: string;
  sopInstanceUID?: string;
  seriesInstanceUID?: string;
  studyInstanceUID?: string;
}

export const frameRangeExtractor =
  /(\/frames\/|[&?]frameNumber=|[&?]frame=)([^/&?]*)(.*)/i;

export function getUriModule(imageId) {
  const framesMatch = imageId.match(frameRangeExtractor);
  if (!framesMatch) {
    return;
  }
  const baseImageId = imageId.substring(0, framesMatch.index);
  const framesString = framesMatch[2];
  const frameNumber = parseFloat(framesString);
  const remaining = framesMatch[3];

  return {
    baseImageId,
    frameNumber,
    framesString,
    remaining,
  };
}

export function uriModuleProvider(next, imageId, data, options) {
  return getUriModule(imageId) || next(imageId, data, options);
}

addTypedProvider(MetadataModules.URI_MODULE, uriModuleProvider);

export default getUriModule;
