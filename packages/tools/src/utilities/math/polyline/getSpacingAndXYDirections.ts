import { StackViewport } from '@cornerstonejs/core';

const getSpacingAndXYDirections = (viewport, subPixelResolution) => {
  let spacing;
  let xDir;
  let yDir;

  if (viewport instanceof StackViewport) {
    // Check XY directions
    const imageData = viewport.getImageData();

    xDir = imageData.direction.slice(0, 3);
    yDir = imageData.direction.slice(3, 6);

    spacing = imageData.spacing;
  } else {
    // Check volume directions
    // TODO_JAMES
  }

  const subPixelSpacing = [
    spacing[0] / subPixelResolution,
    spacing[1] / subPixelResolution,
  ];

  return { spacing: subPixelSpacing, xDir, yDir };
};

export default getSpacingAndXYDirections;
