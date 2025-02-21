import type { Types } from '@cornerstonejs/core';

export type PolySegConversionOptions = {
  segmentIndices?: number[];
  segmentationId?: string;
  viewport?: Types.IStackViewport | Types.IVolumeViewport;
};
