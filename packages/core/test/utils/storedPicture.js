/**
 * The pixels of a stored picture, as RGBA bytes: what `getImageData` gives
 * for the picture drawn on a canvas of its size.
 *
 * @param url - The data URL of the picture, as an imported PNG gives it.
 */
export function readStoredPicture(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');

      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');

      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, image.width, image.height));
    };
    image.onerror = reject;
    image.src = url;
  });
}
