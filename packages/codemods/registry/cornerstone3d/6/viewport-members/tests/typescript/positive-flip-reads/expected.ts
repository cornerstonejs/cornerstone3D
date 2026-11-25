import { getRenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export function flips(renderingEngineId: string, viewportId: string) {
  const viewport = getRenderingEngine(renderingEngineId).getViewport(
    viewportId
  ) as Types.IStackViewport;
  const { flipHorizontal } = viewport.getViewState();

  viewport.setViewState({ flipHorizontal: !flipHorizontal });

  const { flipVertical: vertical, flipHorizontal: horizontal } =
    viewport.getViewState();
  const flippedV = viewport.getViewState().flipVertical;
  const { flipHorizontal: h, parallelScale } = viewport.getCamera();
  const camera = viewport.getCamera();
  const { flipVertical } = viewport.getCamera({ cache: true } as never);

  return [vertical, horizontal, flippedV, h, parallelScale, camera, flipVertical];
}

export function threeD(renderingEngineId: string, viewportId: string) {
  const viewport = getRenderingEngine(renderingEngineId).getViewport(
    viewportId
  ) as Types.IVolumeViewport3D;
  const { flipHorizontal } = viewport.getCamera();

  return flipHorizontal;
}
