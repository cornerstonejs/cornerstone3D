import { FrameStatus } from '../enums';
import { IImage, IImageLoadObject } from '../types';

interface ICachedImage {
  image?: IImage;
  imageId: string;
  imageLoadObject: IImageLoadObject;
  loaded: boolean;
  sharedCacheKey?: string;
  timeStamp: number;
  sizeInBytes: number;
  // The status values can be compared to store lower loss versions
  status?: FrameStatus;
}

export default ICachedImage;
