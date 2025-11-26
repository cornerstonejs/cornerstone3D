import { metaData, Enums } from '@cornerstonejs/core';

const { MetadataModules } = Enums;

/**
 * Assign only defined values in source into destination.
 * Optionally requires an existing key in the result too.
 */
export function assignDefined(dest, source, options?) {
  if (!source) {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (dest[key] === undefined && options?.requireDestinationKey) {
      continue;
    }
    dest[key] = value;
  }
}

/**
 * Creates a new instance example tag, based on the metadata key `instanceKey`
 * and using the imageId from studyExemplarImageId as the base for the study
 * information, but NOT the instance information.  This produces a valid DICOM
 * instance data, particularly when the image id refers to a very different type
 * from the new instance being created.
 *
 * @param instanceKey used to get the default data for this type of object
 * @param studyExemplarImageId - used to get the study data for this object
 * @param base - additional defaults to include in the result
 * @param options - get the predecessorImageId and include a predecessor sequence
 *     as well as putting the new object into the same series as the old one.
 *       As well for Options, any attributes defined in it as well as in the newly
 *       created object will be assigned to the newly created object.
 */
export function createInstance<T>(
  instanceKey,
  studyExemplarImageId,
  base,
  options
) {
  const { metadataProvider = metaData, predecessorImageId } = options;
  const result = <T>{};
  const instanceBase = metadataProvider.get(instanceKey, studyExemplarImageId);
  Object.assign(result, instanceBase);
  assignDefined(result, base);
  assignDefined(result, options, { requireDestinationKey: true });
  if (predecessorImageId) {
    const predecessor = metadataProvider.get(
      MetadataModules.PREDECESSOR_SEQUENCE,
      predecessorImageId
    );
    Object.assign(result, predecessor);
  }
  return result;
}
