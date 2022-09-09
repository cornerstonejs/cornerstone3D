import { IImageVolume, IVolumeLoadObject } from '../types';

interface ICachedVolume {
  volume?: IImageVolume;
  volumeId: string;
  volumeLoadObject: IVolumeLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
  volumeLoaderId: string;
}

export default ICachedVolume;
