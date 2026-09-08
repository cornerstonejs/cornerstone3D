/**
 * Ambient declarations for vtk.js WebGPU modules, which ship without type
 * definitions. Kept intentionally loose (the WebGPU view API is accessed
 * through a small wrapper in webgpuViewportRenderWindow.ts).
 */
declare module '@kitware/vtk.js/Rendering/WebGPU/RenderWindow' {
  const vtkWebGPURenderWindow: {
    newInstance(initialValues?: Record<string, unknown>): unknown;
  };
  export default vtkWebGPURenderWindow;
}

declare module '@kitware/vtk.js/Rendering/WebGPU/Profiles/All' {
  const noop: undefined;
  export default noop;
}
