import { metaData, Enums } from '@cornerstonejs/core';

const { MetadataModules } = Enums;

/**
 * Assign only defined values in source into destination.
 * Optionally requires an existing key in the result too.
 */
export function assignDefined(dest, source, options?) {
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
 * Updates base to add the previous options and to make reference to the
 * previous instance in the new instance, over-riding values in options.
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
  if (predecessorImageId) {
    const predecessor = metadataProvider.get(
      MetadataModules.PREDECESSOR_SEQUENCE,
      predecessorImageId
    );
    Object.assign(result, predecessor);
  }
  assignDefined(result, base);
  assignDefined(result, options, { requireDestinationKey: true });
  if (base.OtherPatientIDs !== undefined && !base.OtherPatientIDs?.length) {
    delete base.OtherPatientIDs;
  }
  return result;
}
