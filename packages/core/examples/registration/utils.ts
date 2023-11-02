import { createImageIdsAndCacheMetaData } from '../../../../utils/demo/helpers';

const imageIdsCache = new Map();

/**
 * Get the current date/time ("YYYY-MM-DD hh:mm:ss.SSS")
 */
export function getFormatedDateTime() {
  const now = new Date();
  const day = `0${now.getDate()}`.slice(-2);
  const month = `0${now.getMonth() + 1}`.slice(-2);
  const year = now.getFullYear();
  const hours = `0${now.getHours()}`.slice(-2);
  const minutes = `0${now.getMinutes()}`.slice(-2);
  const seconds = `0${now.getSeconds()}`.slice(-2);
  const ms = `00${now.getMilliseconds()}`.slice(-3);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Converts a JavaScript object to a JSON string ignoring circular references
 * @param obj - The object to convert to a JSON string
 * @param space - Parameter passed to JSON.stringify() that's used to insert
 *   white space (including indentation, line break characters, etc.) into the
 *   output JSON string for readability purposes
 * @returns A JSON string representing the given object, or undefined.
 */
export function stringify(obj, space = 0) {
  const cache = new Set();
  const str = JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          // Circular reference found, discard key
          return;
        }
        // Store value in our collection
        cache.add(value);
      }
      return value;
    },
    space
  );

  return str;
}

export async function getImageIds(
  wadoRsRoot: string,
  StudyInstanceUID: string,
  SeriesInstanceUID: string
) {
  const imageIdsKey = `${StudyInstanceUID}:${SeriesInstanceUID}`;
  let imageIds = imageIdsCache.get(imageIdsKey);

  if (!imageIds) {
    imageIds = await createImageIdsAndCacheMetaData({
      wadoRsRoot,
      StudyInstanceUID,
      SeriesInstanceUID,
    });

    imageIdsCache.set(imageIdsKey, imageIds);
  }

  return imageIds;
}
