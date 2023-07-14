/**
 * Retrieves metadata from a DICOM image and returns it as an object with capitalized keys.
 * @param imageId - the imageId
 * @param metaDataProvider - The metadata provider either wadors or wadouri
 * @param types - An array of metadata types to retrieve.
 * @returns An object containing the retrieved metadata with capitalized keys.
 */
function getDatasetModule(
  imageId: string,
  metaDataProvider: any,
  types: string[]
): object;
function getDatasetModule(imageId, metaDataProvider, types) {
  const result = {};
  for (const t of types) {
    try {
      const data = metaDataProvider(t, imageId);
      if (data) {
        const capitalizedData = {};
        for (const key in data) {
          if (key in data) {
            // each tag should get capitalized to match dcmjs style. Todo: move all of the tags to dcmjs style
            const capitalizedKey = capitalizeTag(key);
            capitalizedData[capitalizedKey] = data[key];
          }
        }
        Object.assign(result, capitalizedData);
      }
    } catch (error) {
      console.error(`Error retrieving ${t} data:`, error);
    }
  }

  return result;
}

function capitalizeTag(tag) {
  const parts = tag.split(/([0-9]+)/);
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export { getDatasetModule };
