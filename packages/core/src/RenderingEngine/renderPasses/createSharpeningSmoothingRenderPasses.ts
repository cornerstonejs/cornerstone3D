import { createSharpeningRenderPass } from './sharpeningRenderPass';
import { createSmoothingRenderPass } from './smoothingRenderPass';

/** The sharpening and the smoothing of a picture, as a presentation takes them. */
export interface SharpeningSmoothing {
  sharpening?: number;
  smoothing?: number;
}

/**
 * The render passes of a sharpening and a smoothing, as the legacy viewports
 * give them: the smoothing pass first, then the sharpening pass, each when
 * its number is above 0. vtk.js draws each pass of a view on its own, so when
 * both are given the picture shows the last one, the sharpening.
 *
 * @param settings - The sharpening and the smoothing.
 * @returns The render passes, or null when there is none.
 */
export function createSharpeningSmoothingRenderPasses({
  sharpening = 0,
  smoothing = 0,
}: SharpeningSmoothing): ReturnType<typeof createSmoothingRenderPass>[] | null {
  const renderPasses = [];

  if (smoothing > 0) {
    renderPasses.push(createSmoothingRenderPass(smoothing));
  }

  if (sharpening > 0) {
    renderPasses.push(createSharpeningRenderPass(sharpening));
  }

  return renderPasses.length ? renderPasses : null;
}
