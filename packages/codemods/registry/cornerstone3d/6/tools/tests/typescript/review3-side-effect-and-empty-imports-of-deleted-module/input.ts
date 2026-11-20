import '@cornerstonejs/tools/utilities/viewportCapabilities';
import {} from '@cornerstonejs/tools/utilities/viewportCapabilities';

export async function loadCapabilities() {
  return import('@cornerstonejs/tools/utilities/viewportCapabilities');
}

export async function loadRotation() {
  return import(
    '@cornerstonejs/tools/utilities/spatial/rotateViewportAroundWorldPoint'
  );
}
