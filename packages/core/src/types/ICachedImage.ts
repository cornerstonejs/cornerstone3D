import type IImage from './IImage';
import type { IImageLoadObject } from './ILoadObject';

interface ICachedImage {
  /**
   * The image to use for this instance image right now.
   * This might be a lower resolution image, with appropriate indicators
   * set in the image instance object.
   */
  image?: IImage;
  imageId: string;
  /**
   * The image load object being used for this instance image.
   * This may be null if the image isn't actually being loaded right now, even
   * though there might be an image instance associated with it.
   */
  imageLoadObject?: IImageLoadObject;
  loaded: boolean;
  sharedCacheKey?: string;
  timeStamp: number;
  sizeInBytes: number;
}

export type { ICachedImage as default };
