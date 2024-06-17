/**
 * Retrieves the volume ID from a target ID. Target Id is not only
 * volumeId but might include other information, but it starts with volumeId.
 *
 * @param targetId - The target ID from which to extract the volume ID.
 * @returns The volume ID extracted from the target ID.
 */
export const getVolumeId = (targetId: string) => {
  const prefix = 'volumeId:';
  const str = targetId.includes(prefix)
    ? targetId.substring(prefix.length)
    : targetId;

  const index = str.indexOf('?');
  return index === -1 ? str : str.substring(0, index);
};
