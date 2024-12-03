import { colors } from './testUtils';

function getVerticalBarImage(
  imageVoxelManager,
  rows,
  columns,
  barStart,
  barWidth,
  k = 0
) {
  for (let i = 0; i < rows; i++) {
    for (let j = barStart; j < barStart + barWidth; j++) {
      // Since our screenshots are taken with the old method, i'm just swapping the i and j
      // to match the new method of setting the pixel data and we don't have to change the
      // screenshot, this is fine
      imageVoxelManager.setAtIJK(j, i, k, 255);
    }
  }
}

function getVerticalBarRGBImage(
  imageVoxelManager,
  rows,
  columns,
  barStart,
  barWidth
) {
  let start = barStart;

  colors.forEach((color) => {
    for (let i = 0; i < rows; i++) {
      for (let j = start; j < start + barWidth; j++) {
        // Since our screenshots are taken with the old method, i'm just swapping the i and j
        // to match the new method of setting the pixel data and we don't have to change the
        // screenshot, this is fine
        imageVoxelManager.setAtIJK(j, i, 0, color);
      }
    }

    start += barWidth;
  });
}

function getVerticalBarVolume(volumeVoxelManager, rows, columns, slices) {
  const yMultiple = rows;
  const zMultiple = rows * columns;

  let barStart = 0;
  const barWidth = Math.floor(rows / slices);

  for (let z = 0; z < slices; z++) {
    for (let i = 0; i < rows; i++) {
      for (let j = barStart; j < barStart + barWidth; j++) {
        // Since our screenshots are taken with the old method, i'm just swapping the i and j
        // to match the new method of setting the pixel data and we don't have to change the
        // screenshot, this is fine
        volumeVoxelManager.setAtIJK(j, i, z, 255);
      }
    }
    barStart += barWidth;
  }
}

function getExactRegionVolume(
  volumeVoxelManager,
  rows,
  columns,
  slices,
  exactRegion
) {
  const {
    startRow,
    startColumn,
    startSlice,
    endRow,
    endColumn,
    endSlice,
    value = 1,
  } = exactRegion;

  const yMultiple = rows;
  const zMultiple = rows * columns;

  const indices = [];
  for (let z = startSlice; z < endSlice; z++) {
    for (let y = startRow; y < endRow; y++) {
      for (let x = startColumn; x < endColumn; x++) {
        // Since our screenshots are taken with the old method, i'm just swapping the i and j
        // to match the new method of setting the pixel data and we don't have to change the
        // screenshot, this is fine
        volumeVoxelManager.setAtIJK(x, y, z, value);
      }
    }
  }
}

function getVerticalBarRGBVolume(volumeVoxelManager, rows, columns, slices) {
  let index, pixelData;
  const yMultiple = rows;
  const zMultiple = rows * columns;
  pixelData = new Uint8Array(rows * columns * slices * 3);
  for (let z = 0; z < slices; z++) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        // Since our screenshots are taken with the old method, i'm just swapping the i and j
        // to match the new method of setting the pixel data and we don't have to change the
        // screenshot, this is fine
        volumeVoxelManager.setAtIJK(j, i, z, colors[z]);
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
