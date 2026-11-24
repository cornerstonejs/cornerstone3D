/**
 * The ids of the render modes of the built-in planar render backends. They
 * are private to core: an application reads `viewport.getRenderPlan()`,
 * whose `slice`, `draw` and `backend` say the same in public words.
 *
 * The prefix says what draws the slice (vtk.js on the GPU, or a 2D canvas),
 * the rest says how the slice is made, as `RenderPlanLayer.slice`:
 *
 * | id                  | `slice`     | `draw` |
 * | ------------------- | ----------- | ------ |
 * | `vtkFrame`          | `frame`     | `gpu`  |
 * | `vtkCpuSlice`       | `cpu`       | `gpu`  |
 * | `vtkGpuVolumeSlice` | `gpuVolume` | `gpu`  |
 * | `canvasFrame`       | `frame`     | `cpu`  |
 * | `canvasCpuSlice`    | `cpu`       | `cpu`  |
 *
 * @internal
 */
export enum PlanarRenderModeId {
  VTK_FRAME = 'vtkFrame',
  VTK_CPU_SLICE = 'vtkCpuSlice',
  VTK_GPU_VOLUME_SLICE = 'vtkGpuVolumeSlice',
  CANVAS_FRAME = 'canvasFrame',
  CANVAS_CPU_SLICE = 'canvasCpuSlice',
}
