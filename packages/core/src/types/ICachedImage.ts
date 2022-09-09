import { IImage, IImageLoadObject } from '../types';

interface ICachedImage {
  image?: IImage;
  imageId: string;
  imageLoadObject: IImageLoadObject;
  loaded: boolean;
  sharedCacheKey?: string;
  timeStamp: number;
  sizeInBytes: number;
  imageLoaderId: string;
}

export default ICachedImage;
