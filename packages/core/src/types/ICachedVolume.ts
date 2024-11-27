import type IImageVolume from './IImageVolume';
import type { IVolumeLoadObject } from './ILoadObject';

interface ICachedVolume {
  volume?: IImageVolume;
  volumeId: string;
  volumeLoadObject: IVolumeLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
}

export type { ICachedVolume as default };
