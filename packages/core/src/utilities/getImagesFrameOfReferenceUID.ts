import fnv1aHash from './fnv1aHash';
import imageIdToURI from './imageIdToURI';
import sha256 from './sha256';

/**
 * The names made up for a list of image ids, with a copy of the image ids
 * that they were made for: an application may change the list afterwards.
 */
type ImagesFrameOfReferenceUIDs = {
  imageIds: string[];
  frameOfReferenceUID: string;
  earlierFrameOfReferenceUID?: string;
};

/** The frame of reference made up for each list of image ids, one for each. */
const imagesFrameOfReferenceUIDs = new WeakMap<
  string[],
  ImagesFrameOfReferenceUIDs
>();

/** The URIs of image ids, each once, sorted. */
function getSortedImageURIs(imageIds: string[]): string[] {
  return [...new Set(imageIds.map(imageIdToURI))].sort();
}

/**
 * The names made up for the image ids that a list holds now: the kept ones
 * while the list holds the image ids that they were made for, new ones
 * otherwise.
 */
function getImagesFrameOfReferenceUIDs(
  imageIds: string[]
): ImagesFrameOfReferenceUIDs {
  const kept = imagesFrameOfReferenceUIDs.get(imageIds);

  if (
    kept?.imageIds.length === imageIds.length &&
    kept.imageIds.every((imageId, index) => imageId === imageIds[index])
  ) {
    return kept;
  }

  const imageURIs = getSortedImageURIs(imageIds);
  const made = {
    imageIds: [...imageIds],
    frameOfReferenceUID: `noFrameOfReference-${imageURIs.length}-${sha256(
      JSON.stringify(imageURIs)
    )}`,
  };

  imagesFrameOfReferenceUIDs.set(imageIds, made);

  return made;
}

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
  return getImagesFrameOfReferenceUIDs(imageIds).frameOfReferenceUID;
}

/**
 * Whether a frame of reference is the name that a planar viewport made up
 * for images without one before the name took a SHA-256 digest:
 * `noFrameOfReference-<number of images>-<FNV-1a hash of their URIs>`, the
 * sorted URIs joined by new lines. Other images may have the same such name,
 * so a caller takes it only for a reference that names one of the images.
 */
export function isEarlierImagesFrameOfReferenceUID(
  frameOfReferenceUID: string | undefined,
  imageIds: string[] | undefined
): boolean {
  if (
    !frameOfReferenceUID?.startsWith('noFrameOfReference-') ||
    !imageIds?.length
  ) {
    return false;
  }

  const names = getImagesFrameOfReferenceUIDs(imageIds);

  if (!names.earlierFrameOfReferenceUID) {
    const imageURIs = getSortedImageURIs(imageIds);

    names.earlierFrameOfReferenceUID = `noFrameOfReference-${
      imageURIs.length
    }-${fnv1aHash(imageURIs.join('\n'))}`;
  }

  return frameOfReferenceUID === names.earlierFrameOfReferenceUID;
}
