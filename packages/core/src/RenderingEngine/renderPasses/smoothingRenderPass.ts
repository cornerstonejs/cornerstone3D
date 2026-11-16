import vtkConvolution2DPass from '@kitware/vtk.js/Rendering/OpenGL/Convolution2DPass';
import vtkForwardPass from '@kitware/vtk.js/Rendering/OpenGL/ForwardPass';

/** The width and height of the Gaussian kernel of the smoothing. */
const SMOOTHING_KERNEL_SIZE = 15;

/** The standard deviation of the Gaussian kernel of the smoothing, in pixels. */
const SMOOTHING_SIGMA = 5;

/**
 * The share of the Gaussian in the smoothing: the picture is mixed with its
 * Gaussian blur by this share, `min(intensity / 10, 1)`.
 *
 * @param intensity - The smoothing intensity, above 0.
 * @returns The share, from 0 to 1.
 */
function getSmoothingBlend(intensity: number): number {
  return Math.min(Math.min(intensity, 1000) / 10, 1.0);
}

/**
 * Creates a GPU-based convolution pass for image smoothing.
 *
 * The smoothing works by applying a Gaussian blur kernel to the image,
 * which averages pixel values with their neighbors, effectively reducing noise
 * and softening edges. The intensity parameter controls the strength of the smoothing effect.
 *
 * @param intensity - Smoothing intensity (0 = no smoothing, positive values = more smoothing)
 * @returns vtkConvolution2DPass configured for image smoothing (Gaussian blur)
 */
function createSmoothingRenderPass(intensity: number) {
  let renderPass = vtkForwardPass.newInstance();

  if (intensity > 0) {
    const convolutionPass = vtkConvolution2DPass.newInstance();
    convolutionPass.setDelegates([renderPass]);
    // Generate a 15x15 Gaussian blur kernel (σ ≈ 5.0)
    const kernelSize = SMOOTHING_KERNEL_SIZE;
    const sigma = SMOOTHING_SIGMA;
    const gaussianKernel = createGaussianKernel(kernelSize, sigma);
    const totalElements = kernelSize * kernelSize;
    const centerIndex = Math.floor(totalElements / 2);
    const identityKernel: number[] = Array(totalElements).fill(0);
    identityKernel[centerIndex] = 1;

    // Blend strength
    const alpha = getSmoothingBlend(intensity);

    // Blend between identity and Gaussian
    const kernel = gaussianKernel.map(
      (g, i) => (1 - alpha) * identityKernel[i] + alpha * g
    );

    convolutionPass.setKernelDimension(15);
    convolutionPass.setKernel(kernel);
    renderPass = convolutionPass;
  }

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
  const kernel: number[] = [];
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

export {
  createSmoothingRenderPass,
  getSmoothingBlend,
  SMOOTHING_KERNEL_SIZE,
  SMOOTHING_SIGMA,
};
