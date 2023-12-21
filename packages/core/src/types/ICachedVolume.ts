import { IVolume, IVolumeLoadObject } from '../types';

interface ICachedVolume {
  volume?: IVolume;
  volumeId: string;
  volumeLoadObject: IVolumeLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
}

export default ICachedVolume;
