import getPixelDataTypeFromMinMax from '../shared/getPixelDataTypeFromMinMax';

/**
 * Helper function to set the right typed array.
 * This is needed because web workers can transfer array buffers but not typed arrays
 *
 * Here we are setting the pixel data to the right typed array based on the final
 * min and max values
 */
function setPixelDataType(imageFrame) {
  // Skip re-typing if already Float32Array to prevent downgrading to
  // Uint8Array via getPixelDataTypeFromMinMax. See #2706.
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
