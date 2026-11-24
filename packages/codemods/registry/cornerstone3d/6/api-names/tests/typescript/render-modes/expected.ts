import type { PlanarViewport, Types, VolumeViewport3D } from '@cornerstonejs/core';
import {
  ActorRenderMode,
  RenderingEngine,
  registerRenderBackend,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');
const viewport3D = renderingEngine.getViewport<VolumeViewport3D>('3D');

registerRenderBackend({
  backend: 'myOrg:webgpu',
  renderModes: {
    frame: { id: 'myOrg:webgpuImage' },
    gpuVolume: { id: 'myOrg:webgpuVolume' },
    cpu: { id: 'myOrg:webgpuSampled' },
  },
});

registerRenderBackend({
  backend: 'myOrg:canvas',
  renderModes: {
    frame: { id: 'myOrg:canvasImage' },
    cpu: { id: 'myOrg:canvasVolume' },
  },
  surface: 'cpu',
});

export async function show(entry: Types.ActorEntry) {
  await viewport3D.addDisplaySet('surface');
  await viewport3D.addDisplaySet('ct', {
    role: 'source',
  });
  await viewport3D.setDisplaySets({
    displaySetId: 'ct',
  });

  const mapper = entry.actor.getMapper();
  const actor = viewport.getDefaultActor().actor;

  viewport.getActors().forEach((actorEntry) => {
    actorEntry.actor.getMapper()?.modified();
  });

  if (entry.actorMapper.renderMode === ActorRenderMode.VTK_SAMPLED_SLICE) {
    return mapper;
  }

  const layer = viewport.getRenderPlan()[0];

  return [actor, layer.renderMode === 'vtkVolumeSlice', layer.renderMode];
}
