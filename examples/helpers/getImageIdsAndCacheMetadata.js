import config from './../config/default';
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

  let ptImageIds = imageIds.filter(imageId =>
    imageId.includes(ptSeriesInstanceUID)
  );

  if (limitFrames !== undefined && typeof limitFrames === 'number') {
    // Only sort imageIds for this example to get a subsection of the volume for
    // testing. Do not need to sort otherwise as the the imageCache will do this when creating volumes.
    ptImageIds = sortImageIdsByIPP(ptImageIds);
    ctImageIds = sortImageIdsByIPP(ctImageIds);

    ctImageIds = limitImageIds(ctImageIds, limitFrames);
    ptImageIds = limitImageIds(ptImageIds, limitFrames);
  }

  return { ptImageIds, ctImageIds };
}
