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
 * @returns vtkConvolution2DPass configured for edge enhancement
 */
function createSharpeningAndSmoothingRenderPass(intensity: number) {
  let renderPass = vtkForwardPass.newInstance();
  const convolutionPass = vtkConvolution2DPass.newInstance();
  convolutionPass.setDelegates([renderPass]);
  if (intensity > 0) {
    // Sharpening kernel (Laplacian)
    const k = Math.max(0, intensity);
    convolutionPass.setKernelDimension(3);
    convolutionPass.setKernel([-k, -k, -k, -k, 1 + 8 * k, -k, -k, -k, -k]);
  } else if (intensity < 0) {
    const smoothStrength = Math.min(Math.abs(intensity), 1000);

    // Generate a 15x15 Gaussian blur kernel (σ ≈ 5.0)
    const gaussianKernel = createGaussianKernel(15, 5.0);

    // Identity kernel (15x15 → center=1, rest=0)
    const identityKernel: number[] = Array(225).fill(0);
    identityKernel[112] = 1; // center index
    // Blend strength
    const alpha = Math.min(smoothStrength / 10, 1.0);

    // Blend between identity and Gaussian
    const kernel = gaussianKernel.map(
      (g, i) => (1 - alpha) * identityKernel[i] + alpha * g
    );

    convolutionPass.setKernelDimension(15);
    convolutionPass.setKernel(kernel);
  }
  renderPass = convolutionPass;

  return renderPass;
}

/**
 * Creates a normalized 2D Gaussian kernel for image smoothing.
 *
 * The Gaussian kernel is used for blurring images by averaging pixel values
 * with their neighbors, weighted by a Gaussian function. The kernel size and
 * standard deviation (sigma) control the amount and spread of smoothing.
 *
 * @param size - The width and height of the square kernel (e.g., 3, 5, 15).
 * @param sigma - The standard deviation of the Gaussian distribution (controls blur strength).
 * @returns A flattened array of kernel weights, normalized so their sum is 1.
 */
function createGaussianKernel(size: number, sigma: number): number[] {
  const kernel = [];
  const mean = (size - 1) / 2;
  let sum = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - mean;
      const dy = y - mean;
      const value = Math.exp(-(dx * dx + dy * dy) / (2 * Math.pow(sigma, 2)));
      kernel.push(value);
      sum += value;
    }
  }

  return kernel.map((v) => v / sum);
}

export { createSharpeningAndSmoothingRenderPass };
