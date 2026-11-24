import type { WSIClientLike } from '../utilities/WSIUtilities';

/**
 * The facts of a display set that an application registers with
 * `displaySetRegistry.add(displaySetId, descriptor)`. The viewport family
 * that mounts the display set and these fields decide how its data is
 * loaded: a planar viewport and the volume of a 3D viewport read `imageIds`
 * (and `volumeId` when it is given), a video and an ECG viewport read
 * `imageId`, a 3D viewport reads `geometryId` for a surface, and a whole
 * slide viewport reads `imageIds` and a web client. A descriptor that a
 * family cannot read fails its mount with a message that names the fields
 * the family needs.
 */
export interface DisplaySetDescriptor {
  /** The image ids of a stack, of a volume or of a slide. */
  imageIds?: string[];
  /** The one image id of a video or of an ECG waveform. */
  imageId?: string;
  /** The id of the volume in the cache. */
  volumeId?: string;
  /** The id of the geometry in the cache, for a surface of a 3D viewport. */
  geometryId?: string;
  /** The DICOMweb client of a slide. */
  webClient?: WSIClientLike;
  /** Other facts, such as the fields of an application's own display set. */
  [key: string]: unknown;
}
