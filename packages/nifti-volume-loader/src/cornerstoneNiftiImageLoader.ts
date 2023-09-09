import NiftiImageVolume from './NiftiImageVolume';
import { fetchAndAllocateNiftiVolume } from './helpers';

interface IVolumeLoader {
  promise: Promise<NiftiImageVolume>;
  cancel: () => void;
}

export default function cornerstoneNiftiImageVolumeLoader(
  volumeId: string
): IVolumeLoader {
  const niftiVolumePromise = fetchAndAllocateNiftiVolume(volumeId);

  return {
    promise: niftiVolumePromise,
    cancel: () => {
      // niftiVolumePromise.then(niftiImageVolume =>
      //   niftiImageVolume.cancelLoading()
      // );
    },
  };
}
