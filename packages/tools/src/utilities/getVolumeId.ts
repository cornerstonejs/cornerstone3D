export const getVolumeId = (targetId: string) => {
  if (targetId.includes('volumeId:')) {
    return targetId.split(/volumeId:|\?/)[1];
  }
  return targetId;
};
