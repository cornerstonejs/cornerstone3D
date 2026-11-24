import type { BaseViewport, Types } from '@cornerstonejs/core';
import { registerRenderBackend } from '@cornerstonejs/core';

registerRenderBackend({
  backend: 'myOrg:webgpu',
  renderModes: {
    frame: { id: 'myOrg:webgpuFrame' },
    cpu: { id: 'myOrg:webgpuCpuSlice' },
    gpuVolume: { id: 'myOrg:webgpuVolumeSlice' },
  },
});

export async function show(
  viewport: BaseViewport,
  entry: Types.ActorEntry,
  layer: { renderMode: string }
) {
  await viewport.addDisplaySet('custom', { renderMode: 'myOrg:custom' });

  const mapper = entry.actor.getMapper();
  const plan = viewport.getRenderPlan?.() ?? [];
  const isVolume = entry.actor.isA('vtkVolume');

  return [mapper, plan, isVolume, layer.renderMode === 'vtkImage'];
}
