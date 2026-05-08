import type IBaseStreamingImageVolume from './IBaseStreamingImageVolume';
import type IImageVolume from './IImageVolume';
import type { IVolumeLoadObject } from './ILoadObject';

interface ICachedVolume {
  volume?: IImageVolume | IBaseStreamingImageVolume;
  volumeId: string;
  volumeLoadObject: IVolumeLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
}

export type { ICachedVolume as default };
