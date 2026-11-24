import type { PlanarViewport, Types, VolumeViewport3D } from '@cornerstonejs/core';
import { RenderingEngine, utilities } from '@cornerstonejs/core';
import { viewportSupportsDisplaySetPresentation } from '@cornerstonejs/core/utilities';

export { utilities };

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');

export function edges(
  displaySetId: string,
  adapter: { setDisplaySetPresentation(id: string, props: object): void }
) {
  adapter.setDisplaySetPresentation(displaySetId, { invert: true });

  let current = renderingEngine.getViewport('PT');

  current.setDisplaySetPresentation(displaySetId, { invert: true });
  current = viewport;

  const { getDisplaySetPresentation, resetDisplaySetPresentation: reset } = viewport;
  const look = viewport['setDisplaySetPresentation'](displaySetId, { opacity: 1 });
  const has = 'resetDisplaySetPresentation' in viewport;
  const viewportSupportsDisplaySetAppearance = (value: unknown) => Boolean(value);

  reset.call(viewport, displaySetId);

  return [
    getDisplaySetPresentation,
    look,
    has,
    utilities.viewportSupportsDisplaySetPresentation(current),
    viewportSupportsDisplaySetPresentation(current),
    viewportSupportsDisplaySetAppearance(current),
    viewport?.getDisplaySetPresentation?.(displaySetId),
  ];
}

let typedEngine: RenderingEngine;
let typedViewport: PlanarViewport;

function getPlanar(): Types.IViewport {
  return typedEngine.getViewport('CT');
}

export function typed(displaySetId: string, engineId: string) {
  typedEngine = renderingEngine;
  typedViewport = typedEngine.getViewport<PlanarViewport>(engineId);
  typedViewport.setDisplaySetPresentation(displaySetId, { invert: true });
  typedEngine.getViewport<VolumeViewport3D>('3D').resetDisplaySetPresentation();
  typedEngine.getViewport('CT').getDisplaySetPresentation(displaySetId);

  const planar = getPlanar();

  planar.setDisplaySetPresentation(displaySetId, { opacity: 0.5 });
}

type Look = ReturnType<PlanarViewport['getDisplaySetPresentation']>;
type Other = { getDisplaySetPresentation(): string }['getDisplaySetPresentation'];

export function spy(jestLike: { spyOn(target: object, name: string): void }): Look | Other {
  jestLike.spyOn(viewport, 'resetDisplaySetPresentation');

  return undefined;
}

type NativePlanarViewport = Types.IViewport & {
  resetDisplaySetPresentation?: (displaySetId?: string) => void;
};

export function ownTypes(target: Types.IViewport, displaySetId: string) {
  const native = target as unknown as {
    setDisplaySetPresentation(id: string, props: object): void;
  };
  const planar = target as NativePlanarViewport;

  native.setDisplaySetPresentation(displaySetId, { invert: true });
  planar.resetDisplaySetPresentation?.();
  (target as PlanarViewport).setDisplaySetPresentation(displaySetId, {});
}
