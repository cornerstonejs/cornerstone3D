import type { Types } from '@cornerstonejs/core';
import { CornerstoneWadoLoaderIImage } from './CornerstoneWadoLoaderIImage';

export interface CornerstoneWadoLoaderIImageLoadObject
  extends Types.IImageLoadObject {
  promise: Promise<CornerstoneWadoLoaderIImage>;
  decache?: () => void;
}
