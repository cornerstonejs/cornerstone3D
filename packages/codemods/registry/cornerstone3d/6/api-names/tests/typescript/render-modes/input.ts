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
    image: { id: 'myOrg:webgpuImage' },
    volume: { id: 'myOrg:webgpuVolume' },
    sampledVolume: { id: 'myOrg:webgpuSampled' },
  },
});

registerRenderBackend({
  backend: 'myOrg:canvas',
  renderModes: {
    image: { id: 'myOrg:canvasImage' },
    volume: { id: 'myOrg:canvasVolume' },
  },
  surface: 'cpu',
});

export async function show(entry: Types.ActorEntry) {
  await viewport3D.addDisplaySet('surface', { renderMode: 'vtkGeometry3d' });
  await viewport3D.addDisplaySet('ct', {
    renderMode: 'vtkVolume3d',
    role: 'source',
  });
  await viewport3D.setDisplaySets({
    displaySetId: 'ct',
    options: { renderMode: 'vtkVolume3d' },
  });

  const mapper = entry.actorMapper.mapper;
  const actor = viewport.getDefaultActor().actorMapper.actor;

  viewport.getActors().forEach((actorEntry) => {
    actorEntry.actorMapper?.mapper?.modified();
  });

  if (entry.actorMapper.renderMode === ActorRenderMode.VTK_SAMPLED_SLICE) {
    return mapper;
  }

  const layer = viewport.getRenderPlan()[0];

  return [actor, layer.renderMode === 'vtkVolumeSlice', layer.renderMode];
}
