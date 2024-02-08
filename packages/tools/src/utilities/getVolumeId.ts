export const getVolumeId = (targetId: string) => {
  const str = targetId.substring('volumeId:'.length);
  if (str.startsWith('nifti:')) {
    return str;
  }
  const index = str.indexOf('?');
  return index === -1 ? str : str.substring(0, index);
};
