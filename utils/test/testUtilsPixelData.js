import { colors } from './testUtils';

function createPixelData(width, height, channels = 1) {
  return new Uint8Array(width * height * channels);
}

function getVerticalBarImage(rows, columns, barStart, barWidth) {
  const pixelData = createPixelData(columns, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = barStart; j < barStart + barWidth; j++) {
      pixelData[i * columns + j] = 255;
    }
  }
  return pixelData;
}

/**
 * Creates an array of pixel data arrays with a vertical bar pattern.
 * @param {number} width - Width of each image
 * @param {number} height - Height of each image
 * @param {number} numImages - Number of images in the set
 * @param {number} barStart - Starting position of the bar
 * @param {number} barWidth - Width of the bar
 * @returns {Array<Uint8Array>} Array of pixel data arrays
 */
function getVerticalBarImages(width, height, numImages, barStart, barWidth) {
  return Array(numImages)
    .fill()
    .map((_, index) => {
      const currentBarStart = (barStart + index * barWidth) % width;
      return getVerticalBarImage(height, width, currentBarStart, barWidth);
    });
}

function getVerticalBarRGBImage(rows, columns, barStart, barWidth) {
  const pixelData = createPixelData(columns, rows, 3);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const index = (i * columns + j) * 3;
      const colorIndex = Math.floor(j / barWidth) % colors.length;
      pixelData[index] = colors[colorIndex][0];
      pixelData[index + 1] = colors[colorIndex][1];
      pixelData[index + 2] = colors[colorIndex][2];
    }
  }
  return pixelData;
}

/**
 * Creates an array of RGB pixel data arrays with a vertical bar pattern.
 * @param {number} width - Width of each image
 * @param {number} height - Height of each image
 * @param {number} numImages - Number of images in the set
 * @param {number} barStart - Starting position of the bar
 * @param {number} barWidth - Width of the bar
 * @returns {Array<Uint8Array>} Array of RGB pixel data arrays
 */
function getVerticalBarRGBImages(width, height, numImages, barStart, barWidth) {
  return Array(numImages)
    .fill()
    .map((_, index) => {
      const currentBarStart = (barStart + index * barWidth) % width;
      return getVerticalBarRGBImage(height, width, currentBarStart, barWidth);
    });
}

/**
 * Creates an array of pixel data arrays with an exact region pattern.
 * @param {number} width - Width of each image
 * @param {number} height - Height of each image
 * @param {number} numImages - Number of images in the set
 * @param {number} regionStart - Starting position of the region
 * @param {number} regionWidth - Width of the region
 * @returns {Array<Uint8Array>} Array of pixel data arrays
 */
function getExactRegionImages(
  width,
  height,
  numImages,
  regionStart,
  regionWidth
) {
  return Array(numImages)
    .fill()
    .map(() => {
      const pixelData = new Uint8Array(width * height);
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          if (
            col >= regionStart &&
            col < regionStart + regionWidth &&
            row >= regionStart &&
            row < regionStart + regionWidth
          ) {
            pixelData[row * width + col] = 255;
          }
        }
      }
      return pixelData;
    });
}

// function getExactRegionVolume(
//   rows,
//   columns,
//   slices,
//   start_X,
//   start_Y,
//   start_Z,
//   end_X,
//   end_Y,
//   end_Z,
//   valueForSegmentIndex
// ) {
//   let value = valueForSegmentIndex;

//   if (!value) {
//     value = 1;
//   }

//   const yMultiple = rows;
//   const zMultiple = rows * columns;

//   // from [start_x, start_y, start_z] to [end_x, end_y, end_z]
//   // create all the indices that are in the region of interest
//   const indices = [];
//   for (let z = start_Z; z < end_Z; z++) {
//     for (let y = start_Y; y < end_Y; y++) {
//       for (let x = start_X; x < end_X; x++) {
//         indices.push([x, y, z]);
//       }
//     }
//   }

//   let pixelData;
//   pixelData = new Uint8Array(rows * columns * slices);

//   for (const index of indices) {
//     const [x, y, z] = index;
//     pixelData[z * zMultiple + y * yMultiple + x] = value;
//   }

//   return pixelData;
// }

// function getVerticalBarVolume(rows, columns, slices) {
//   const yMultiple = rows;
//   const zMultiple = rows * columns;

//   let barStart = 0;
//   const barWidth = Math.floor(rows / slices);

//   let pixelData;
//   pixelData = new Uint8Array(rows * columns * slices);
//   for (let z = 0; z < slices; z++) {
//     for (let i = 0; i < rows; i++) {
//       for (let j = barStart; j < barStart + barWidth; j++) {
//         pixelData[z * zMultiple + i * yMultiple + j] = 255;
//       }
//     }
//     barStart += barWidth;
//   }

//   return pixelData;
// }

// function getVerticalBarRGBVolume(rows, columns, slices) {
//   let index, pixelData;
//   const yMultiple = rows;
//   const zMultiple = rows * columns;
//   pixelData = new Uint8Array(rows * columns * slices * 3);
//   for (let z = 0; z < slices; z++) {
//     for (let i = 0; i < rows; i++) {
//       for (let j = 0; j < columns; j++) {
//         index = z * zMultiple + i * yMultiple + j;
//         pixelData[index * 3] = colors[z][0];
//         pixelData[index * 3 + 1] = colors[z][1];
//         pixelData[index * 3 + 2] = colors[z][2];
//       }
//     }
//   }

//   return pixelData;
// }

export {
  getVerticalBarImage,
  getVerticalBarImages,
  getVerticalBarRGBImage,
  getVerticalBarRGBImages,
  // getVerticalBarVolume,
  // getVerticalBarRGBVolume,
  // getExactRegionVolume,
  getExactRegionImages,
};
