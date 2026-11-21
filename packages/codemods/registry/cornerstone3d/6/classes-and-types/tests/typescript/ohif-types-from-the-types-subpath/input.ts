import { IStackViewport, IVolumeViewport } from '@cornerstonejs/core/types';
import type {
  ViewportProperties,
  IGenericViewport,
  ImageSliceData,
} from '@cornerstonejs/core/types';
import type { IVolumeInput } from '@cornerstonejs/core/types/IVolumeInput';
import { IECGViewport as LocalEcg } from './localTypes';

export { IWSIViewport } from '@cornerstonejs/core/types';

export function referencedImageId(
  viewport: IStackViewport | IVolumeViewport
): string {
  return viewport.id;
}

export const properties: ViewportProperties = {};

export type Generic = IGenericViewport;

export type Slice = ImageSliceData;

export type Input = IVolumeInput;

export type Local = LocalEcg;
