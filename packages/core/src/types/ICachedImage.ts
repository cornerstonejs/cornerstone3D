import { IImage, IImageLoadObject } from '../types/index.js';

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
