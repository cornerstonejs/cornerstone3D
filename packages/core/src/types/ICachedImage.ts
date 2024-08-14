import type IImage from './IImage';
import type { IImageLoadObject } from './ILoadObject';

interface ICachedImage {
  image?: IImage;
  imageId: string;
  imageLoadObject: IImageLoadObject;
  loaded: boolean;
  sharedCacheKey?: string;
  timeStamp: number;
  sizeInBytes: number;
}

export default ICachedImage;
