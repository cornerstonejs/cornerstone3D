export const getVolumeId = (targetId: string) => {
  const prefix = 'volumeId:';
  const str = targetId.includes(prefix)
    ? targetId.substring(prefix.length)
    : targetId;

  if (str.startsWith('nifti:')) {
    return str;
  }

  const index = str.indexOf('?');
  return index === -1 ? str : str.substring(0, index);
};
