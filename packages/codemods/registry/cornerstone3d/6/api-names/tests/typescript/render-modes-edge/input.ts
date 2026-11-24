import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngine,
  Types,
  eventTarget,
  registerRenderBackend,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');
const viewport3D = renderingEngine.getViewport<VolumeViewport3D>('3D');
const slots = { image: { id: 'myOrg:image' } };

type SampledMode = Types.ActorRenderMode.VTK_SAMPLED_SLICE;

registerRenderBackend({ backend: 'myOrg:a', renderModes: slots });
registerRenderBackend({
  backend: 'myOrg:b',
  renderModes: {
    image: { id: 'myOrg:bImage' },
    volume: { id: 'myOrg:bVolume' },
    sampledVolume: { id: 'myOrg:bSampled' },
  },
  surface: 'cpu',
});

eventTarget.addEventListener(Enums.Events.RENDER_PLAN_CHANGED, (evt) => {
  const { detail } = evt as CustomEvent;

  console.log(detail.current.renderMode);
});

export async function show(mode: string, someEntry: { actorMapper?: object }) {
  await viewport3D.addDisplaySet('ct', { renderMode: 'auto' });
  await viewport3D.addDisplaySet('ct', { renderMode: mode as never });

  const entry = viewport.getActors().find((each) => each.uid === 'ct');
  const mapper = entry?.actorMapper?.mapper;

  switch (entry.actorMapper.renderMode) {
    case Types.ActorRenderMode.CPU_VOLUME:
      return mapper;
  }

  const proxy: Types.ActorMapperProxy | undefined = undefined;
  const modes = viewport.getRenderPlan().map(({ renderMode }) => renderMode);

  return [proxy, modes, someEntry.actorMapper] as unknown as SampledMode;
}
