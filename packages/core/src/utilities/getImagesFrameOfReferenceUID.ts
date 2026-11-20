import imageIdToURI from './imageIdToURI';
import sha256 from './sha256';

/** The frame of reference made up for each list of image ids, one for each. */
const imagesFrameOfReferenceUIDs = new WeakMap<string[], string>();

/**
 * The frame of reference that a planar viewport makes up for images that
 * have none: `noFrameOfReference-<number of images>-<SHA-256 of their URIs>`,
 * the digest of the sorted URIs as a JSON array, in 64 hexadecimal digits.
 * It comes from the set of images, not from the viewport or the display set,
 * so every viewport and every display set of the same images has the same
 * one: they take the view references of each other and share their
 * annotations, as the legacy stack viewports of 5.x did with no frame of
 * reference at all. Other images get another one. Data made from those
 * images, such as a surface converted from a labelmap of them, takes it too.
 *
 * @param imageIds - The image ids, in any order.
 * @returns The made-up frame of reference of the set of images.
 */
export default function getImagesFrameOfReferenceUID(
  imageIds: string[]
): string {
  let frameOfReferenceUID = imagesFrameOfReferenceUIDs.get(imageIds);

  if (!frameOfReferenceUID) {
    const imageURIs = [...new Set(imageIds.map(imageIdToURI))].sort();

    frameOfReferenceUID = `noFrameOfReference-${imageURIs.length}-${sha256(
      JSON.stringify(imageURIs)
    )}`;
    imagesFrameOfReferenceUIDs.set(imageIds, frameOfReferenceUID);
  }

  return frameOfReferenceUID;
}
