import { IImageVolume, IVolumeLoadObject } from '../types/index.js';

interface ICachedVolume {
  volume?: IImageVolume;
  volumeId: string;
  volumeLoadObject: IVolumeLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
}

export default ICachedVolume;
