import config from '@configuration';
import sortImageIdsByIPP from './sortImageIdsByIPP';
import limitImageIds from './limitImageIds';
import createStudyImageIds from './createStudyImageIds';

const { ctSeriesInstanceUID, ptSeriesInstanceUID, limitFrames } = config;

/**
 * Consumes the app config and fetches the metadata headers and returns a
 * stack of imageIds for pt and ct.
 *
 * If `limitFrames` is specified in the app config, return this many imageIds
 * around the middle of each stack instead.
 *
 * @returns {Object} An object with an array of `ptImageIds` and `ctImageIds`.
 */
export default async function getImageIds() {
  const imageIdPromise = createStudyImageIds();

  const imageIds = await imageIdPromise;

  let ctImageIds = imageIds.filter(imageId =>
    imageId.includes(ctSeriesInstanceUID)
  );

  ctImageIds = sortImageIdsByIPP(ctImageIds);

  let ptImageIds = imageIds.filter(imageId =>
    imageId.includes(ptSeriesInstanceUID)
  );

  ptImageIds = sortImageIdsByIPP(ptImageIds);

  if (limitFrames !== undefined && typeof limitFrames === 'number') {
    ctImageIds = limitImageIds(ctImageIds, limitFrames);
    ptImageIds = limitImageIds(ptImageIds, limitFrames);
  }

  return { ptImageIds, ctImageIds };
}
