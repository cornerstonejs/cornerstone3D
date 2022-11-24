import getMinMax from './getMinMax.js';

/**
 * Check the minimum and maximum values in the imageFrame pixel data
 * match with the provided smallestPixelValue and largestPixelValue metaData.
 *
 * If 'strict' is true, log to the console a warning if these values do not match.
 * Otherwise, correct them automatically.
 *
 * @param {Object} imageFrame
 * @param {Boolean} strict If 'strict' is true, log to the console a warning if these values do not match.
 * Otherwise, correct them automatically.Default is true.
 */
export default function calculateMinMax(imageFrame, strict = true) {
  const minMax = getMinMax(imageFrame.pixelData);
  const mustAssign = !(
    isNumber(imageFrame.smallestPixelValue) &&
    isNumber(imageFrame.largestPixelValue)
  );

  if (strict === true && !mustAssign) {
    if (imageFrame.smallestPixelValue !== minMax.min) {
      console.warn(
        'Image smallestPixelValue tag is incorrect. Rendering performance will suffer considerably.'
      );
    }

    if (imageFrame.largestPixelValue !== minMax.max) {
      console.warn(
        'Image largestPixelValue tag is incorrect. Rendering performance will suffer considerably.'
      );
    }
  } else {
    imageFrame.smallestPixelValue = minMax.min;
    imageFrame.largestPixelValue = minMax.max;
  }
}

function isNumber(numValue) {
  return typeof numValue === 'number';
}
