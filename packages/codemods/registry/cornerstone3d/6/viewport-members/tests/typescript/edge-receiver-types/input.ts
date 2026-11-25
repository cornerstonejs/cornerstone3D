import { RenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

type OwnViewport = Types.IViewport & {
  resetCameraForResize(): void;
};

interface Shell {
  getTargetImageIdIndex(): number;
}

const renderingEngine = new RenderingEngine('engine');

export async function receivers(target: Types.IStackViewport) {
  const own = target as OwnViewport;
  const shell = target as unknown as Shell;
  const kept: OwnViewport = renderingEngine.getViewport('PT') as OwnViewport;
  const typed = renderingEngine.getViewport<OwnViewport>('MR');
  const again = shell as unknown as Types.IStackViewport;

  own.resetCameraForResize();
  shell.getTargetImageIdIndex();
  kept.resetCameraForResize();
  typed.resetCameraForResize();
  (target as unknown as Shell).getTargetImageIdIndex();
  (<Shell>(<unknown>target)).getTargetImageIdIndex();

  target.resetCameraForResize();
  again.getTargetImageIdIndex();
  (own as Types.IStackViewport).getTargetImageIdIndex();
  (target as object).resetCameraForResize();
  await renderingEngine.getViewport<Types.IStackViewport>('CT').resetCameraForResize();
}
