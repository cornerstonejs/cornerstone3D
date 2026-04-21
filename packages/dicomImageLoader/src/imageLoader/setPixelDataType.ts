import getPixelDataTypeFromMinMax from '../shared/getPixelDataTypeFromMinMax';

/**
 * Helper function to set the right typed array.
 * This is needed because web workers can transfer array buffers but not typed arrays
 *
 * Here we are setting the pixel data to the right typed array based on the final
 * min and max values
 */
function setPixelDataType(imageFrame) {
  // If the pixel data is already Float32Array (e.g. from _handlePreScaleSetup
  // forcing Float32 for non-integer rescale slopes), skip re-typing to prevent
  // getPixelDataTypeFromMinMax from downgrading it to Uint8Array.
  // See: https://github.com/cornerstonejs/cornerstone3D/issues/2706
  if (imageFrame.pixelData instanceof Float32Array) {
    return;
  }

  const minValue = imageFrame.smallestPixelValue;
  const maxValue = imageFrame.largestPixelValue;

  const TypedArray = getPixelDataTypeFromMinMax(minValue, maxValue);

  if (TypedArray) {
    // @ts-ignore
    const typedArray = new TypedArray(imageFrame.pixelData);
    imageFrame.pixelData = typedArray;
  } else {
    throw new Error('Could not apply a typed array to the pixel data');
  }
}

export default setPixelDataType;
