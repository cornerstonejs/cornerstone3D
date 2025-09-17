import vtkConvolution2DPass from '@kitware/vtk.js/Rendering/OpenGL/Convolution2DPass';
import vtkForwardPass from '@kitware/vtk.js/Rendering/OpenGL/ForwardPass';

/**
 * Creates a GPU-based edge enhancement convolution pass for image sharpening.
 *
 * The edge enhancement works by detecting edges using a Laplacian kernel
 * and then subtracting a weighted version of these edges from the original image,
 * effectively enhancing the edges in the image.
 *
 * @param intensity - Sharpening intensity (0 = no sharpening, higher values = more sharpening)
 * @param delegates - Optional array of render passes to delegate to (usually ForwardPass)
 * @returns vtkConvolution2DPass configured for edge enhancement
 */
function createSharpeningRenderPass(sharpeningConfig: {
  enabled: boolean;
  intensity?: number;
}) {
  const { intensity = 0, enabled } = sharpeningConfig;
  let renderPass = vtkForwardPass.newInstance();

  if (enabled && intensity > 0) {
    const convolutionPass = vtkConvolution2DPass.newInstance();
    convolutionPass.setDelegates([renderPass]);
    const k = Math.max(0, intensity);

    // Edge enhancement kernel type 2 (all 8 neighbors)
    // This kernel detects edges in all directions and enhances them
    // The center value (1 + 8*k) ensures the image brightness is maintained
    // while edges are enhanced proportionally to the intensity parameter

    convolutionPass.setKernelDimension(3);
    convolutionPass.setKernel([-k, -k, -k, -k, 1 + 8 * k, -k, -k, -k, -k]);

    renderPass = convolutionPass;
  }

  return renderPass;
}

export { createSharpeningRenderPass };
