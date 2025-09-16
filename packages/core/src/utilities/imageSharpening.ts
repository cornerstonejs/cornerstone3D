import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';

/**
 * Apply image sharpening using Laplacian edge enhancement for 2D images.
 * This function implements edge enhancement by subtracting the Laplacian
 * (edge detection) from the original image to enhance edges.
 *
 * @param imageData - The vtkImageData to sharpen
 * @param intensity - Sharpening intensity (0-3, where 0 is no sharpening, 3 is maximum)
 * @returns The sharpened vtkImageData
 */
function applySharpeningFilter({
  imageData,
  intensity = 0.5,
}: {
  imageData: vtkImageDataType;
  intensity?: number;
}): vtkImageDataType {
  if (!imageData) {
    return imageData;
  }

  // Clamp intensity to valid range
  intensity = Math.max(0, Math.min(3, intensity));

  if (intensity === 0) {
    // No sharpening needed
    return imageData;
  }

  const dims = imageData.getDimensions();
  const scalars = imageData.getPointData().getScalars();
  const data = scalars.getData();
  const numComponents = scalars.getNumberOfComponents();

  // Create output data
  const outputData = new Float32Array(data.length);

  // 2D Laplacian kernel for edge detection
  // Standard 3x3 Laplacian filter
  const laplacianKernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];

  const kernelSize = 3;
  const kernelOffset = Math.floor(kernelSize / 2);

  // Apply Laplacian filter and edge enhancement
  for (let z = 0; z < dims[2]; z++) {
    for (let y = 0; y < dims[1]; y++) {
      for (let x = 0; x < dims[0]; x++) {
        for (let c = 0; c < numComponents; c++) {
          const idx = ((z * dims[1] + y) * dims[0] + x) * numComponents + c;
          const originalValue = data[idx];

          let laplacianValue = 0;

          // 2D convolution with Laplacian kernel
          let kernelIdx = 0;
          for (let ky = -kernelOffset; ky <= kernelOffset; ky++) {
            for (let kx = -kernelOffset; kx <= kernelOffset; kx++) {
              const nx = x + kx;
              const ny = y + ky;

              if (nx >= 0 && nx < dims[0] && ny >= 0 && ny < dims[1]) {
                const nIdx =
                  ((z * dims[1] + ny) * dims[0] + nx) * numComponents + c;
                const kernelValue = laplacianKernel[kernelIdx];
                laplacianValue += data[nIdx] * kernelValue;
              }
              kernelIdx++;
            }
          }

          // Apply edge enhancement: original - (laplacian * intensity)
          // This enhances edges by subtracting the detected edges from the original
          outputData[idx] = originalValue - laplacianValue * intensity;
        }
      }
    }
  }

  // Create new image data with sharpened values
  const outputImageData = vtkImageData.newInstance();
  outputImageData.setDimensions(dims);
  outputImageData.setSpacing(imageData.getSpacing());
  outputImageData.setOrigin(imageData.getOrigin());
  outputImageData.setDirection(imageData.getDirection());

  const outputScalars = vtkDataArray.newInstance({
    numberOfComponents: numComponents,
    values: outputData,
    name: 'Scalars',
  });

  outputImageData.getPointData().setScalars(outputScalars);

  return outputImageData;
}

export { applySharpeningFilter };
