import type { Types } from '@cornerstonejs/core';

export type PolySegConversionOptions = {
  segmentIndices?: number[];
  segmentationRepresentationUID?: string;
  viewport?: Types.IStackViewport | Types.IVolumeViewport;
};
