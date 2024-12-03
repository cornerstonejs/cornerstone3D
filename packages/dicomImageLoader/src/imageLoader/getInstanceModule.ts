/**
 * Retrieves metadata from a DICOM image and returns it as an object with capitalized keys.
 * @param imageId - the imageId
 * @param metaDataProvider - The metadata provider either wadors or wadouri
 * @param types - An array of metadata types to retrieve.
 * @returns An object containing the retrieved metadata with capitalized keys.
 */
function getInstanceModule(imageId, metaDataProvider, types) {
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

const capitalizeTag = (tag: string) =>
  tag.charAt(0).toUpperCase() + tag.slice(1);

const instanceModuleNames = [
  'multiframeModule',
  'generalSeriesModule',
  'patientStudyModule',
  'imagePlaneModule',
  'nmMultiframeGeometryModule',
  'imagePixelModule',
  'modalityLutModule',
  'voiLutModule',
  'sopCommonModule',
  'petIsotopeModule',
  'overlayPlaneModule',
  'transferSyntax',
  'petSeriesModule',
  'petImageModule',
];

export { getInstanceModule, instanceModuleNames };
