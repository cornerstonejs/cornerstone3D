export const STACK_VIEWPORT_ID = 'viewport-stack';
export const VOLUME_VIEWPORT_ID = 'viewport-volume';

export const typeToIdMap = {
  stack: STACK_VIEWPORT_ID,
  volume: VOLUME_VIEWPORT_ID,
} as const;

export const typeToStartIdMap = {
  canvas: 'canvas-start',
  image: 'image-start',
} as const;

export const typeToEndIdMap = {
  canvas: 'canvas-end',
  image: 'image-end',
} as const;
