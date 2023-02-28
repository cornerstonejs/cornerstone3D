/**
 * Remove invalid tags from a metadata and return a new object.
 *
 * At this time it is only removing tags that has `null` or `undefined` values
 * which is our main goal because that breaks when `naturalizeDataset(...)` is
 * called.
 *
 * Validating the tag id using regex like /^[a-fA-F0-9]{8}$/ make it run
 * +50% slower and looping through all characteres (split+every+Set or simple
 * FOR+Set) double the time it takes to run. It is currently taking +12ms/1k
 * images on average which can change depending on the machine.
 *
 * @param srcMetadata - source metadata
 * @returns new metadata object without invalid tags
 */
function removeInvalidTags(srcMetadata) {
  // Object.create(null) make it ~9% faster
  const dstMetadata = Object.create(null);
  const tagIds = Object.keys(srcMetadata);
  let tagValue;

  tagIds.forEach((tagId) => {
    tagValue = srcMetadata[tagId];

    if (tagValue !== undefined && tagValue !== null) {
      dstMetadata[tagId] = tagValue;
    }
  });

  return dstMetadata;
}

export { removeInvalidTags as default, removeInvalidTags };
