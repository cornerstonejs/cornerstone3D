import { describe, it, expect } from '@jest/globals';
import * as core from '../src/index';
import { PlanarRenderModeId } from '../src/RenderingEngine/Viewports/Planar/planarRenderModeIds';

/**
 * The render modes are private in 6.0: `viewport.getRenderPlan()` says how a
 * display set is drawn. `ActorRenderMode` is not a value of the package, and
 * the ids of the built-in render modes are the private ids of
 * `PlanarRenderModeId`.
 */
describe('Render modes that 6.0 made private', () => {
  it('exports no ActorRenderMode and no PlanarRenderModeId from the package', () => {
    expect(core).not.toHaveProperty('ActorRenderMode');
    expect(core).not.toHaveProperty('PlanarRenderModeId');
    expect(core.Enums).not.toHaveProperty('ActorRenderMode');
  });

  it('names the built-in render modes by what draws and how the slice is made', () => {
    expect(Object.values(PlanarRenderModeId).sort()).toEqual([
      'canvasCpuSlice',
      'canvasFrame',
      'vtkCpuSlice',
      'vtkFrame',
      'vtkGpuVolumeSlice',
    ]);
  });
});
