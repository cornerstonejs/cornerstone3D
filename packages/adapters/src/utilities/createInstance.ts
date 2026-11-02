import { metaData, Enums } from '@cornerstonejs/core';
import { utilities as metadataUtilities } from '@cornerstonejs/metadata';

const { MetadataModules } = Enums;
const { definedAttributesOf } = metadataUtilities;

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
  Object.assign(result, instanceBase, definedAttributesOf(base));

  // An option that names an attribute the instance already carries overrides
  // that attribute. Every other option is a control value, not instance data,
  // so it must not reach the instance.
  const instance = result as Record<string, unknown>;
  for (const [key, value] of Object.entries(definedAttributesOf(options))) {
    if (instance[key] !== undefined) {
      instance[key] = value;
    }
  }

  if (predecessorImageId) {
    const predecessor = metadataProvider.get(
      MetadataModules.PREDECESSOR_SEQUENCE,
      predecessorImageId
    );
    Object.assign(result, predecessor);
  }
  return result;
}
