import { colors } from './testUtils';

function getVerticalBarImage(rows, columns, barStart, barWidth) {
  const pixelData = new Uint8Array(rows * columns);

  for (let i = 0; i < rows; i++) {
    for (let j = barStart; j < barStart + barWidth; j++) {
      pixelData[i * columns + j] = 255;
    }
  }

  return pixelData;
}

function getVerticalBarRGBImage(rows, columns, barStart, barWidth) {
  let start = barStart;

  const pixelData = new Uint8Array(rows * columns * 3);

  colors.forEach((color) => {
    for (let i = 0; i < rows; i++) {
      for (let j = start; j < start + barWidth; j++) {
        pixelData[(i * columns + j) * 3] = color[0];
        pixelData[(i * columns + j) * 3 + 1] = color[1];
        pixelData[(i * columns + j) * 3 + 2] = color[2];
      }
    }

    start += barWidth;
  });

  return pixelData;
}

function getExactRegionVolume(
  rows,
  columns,
  slices,
  start_X,
  start_Y,
  start_Z,
  end_X,
  end_Y,
  end_Z,
  valueForSegmentIndex
) {
  let value = valueForSegmentIndex;

  if (!value) {
    value = 1;
  }

  const yMultiple = rows;
  const zMultiple = rows * columns;

  // from [start_x, start_y, start_z] to [end_x, end_y, end_z]
  // create all the indices that are in the region of interest
  const indices = [];
  for (let z = start_Z; z < end_Z; z++) {
    for (let y = start_Y; y < end_Y; y++) {
      for (let x = start_X; x < end_X; x++) {
        indices.push([x, y, z]);
      }
    }
  }

  let pixelData;
  pixelData = new Uint8Array(rows * columns * slices);

  for (const index of indices) {
    const [x, y, z] = index;
    pixelData[z * zMultiple + y * yMultiple + x] = value;
  }

  return pixelData;
}

function getVerticalBarVolume(rows, columns, slices) {
  const yMultiple = rows;
  const zMultiple = rows * columns;

  let barStart = 0;
  const barWidth = Math.floor(rows / slices);

  let pixelData;
  pixelData = new Uint8Array(rows * columns * slices);
  for (let z = 0; z < slices; z++) {
    for (let i = 0; i < rows; i++) {
      for (let j = barStart; j < barStart + barWidth; j++) {
        pixelData[z * zMultiple + i * yMultiple + j] = 255;
      }
    }
    barStart += barWidth;
  }

  return pixelData;
}

function getVerticalBarRGBVolume(rows, columns, slices) {
  let index, pixelData;
  const yMultiple = rows;
  const zMultiple = rows * columns;
  pixelData = new Uint8Array(rows * columns * slices * 3);
  for (let z = 0; z < slices; z++) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        index = z * zMultiple + i * yMultiple + j;
        pixelData[index * 3] = colors[z][0];
        pixelData[index * 3 + 1] = colors[z][1];
        pixelData[index * 3 + 2] = colors[z][2];
      }
    }
  }

  return pixelData;
}

export {
  getVerticalBarImage,
  getVerticalBarVolume,
  getVerticalBarRGBImage,
  getVerticalBarRGBVolume,
  getExactRegionVolume,
};
