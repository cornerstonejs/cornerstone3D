import type { Types } from '@cornerstonejs/core';

export async function mount(viewport: Types.IViewport, ids: string[], is3D: boolean) {
  const entries = ids.map((displaySetId) => ({
    displaySetId,
    options: is3D ? { renderMode: 'vtkVolume3d' } : { role: 'overlay' },
  }));

  await viewport.setDisplaySets(...entries);
}
