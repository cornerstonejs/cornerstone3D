export const getVolumeId = (targetId: string) => {
  if (targetId.includes('nifti:')) {
    return targetId.split(/volumeId:/)[1];
  }
  return targetId.split(/volumeId:|\?/)[1];
};
