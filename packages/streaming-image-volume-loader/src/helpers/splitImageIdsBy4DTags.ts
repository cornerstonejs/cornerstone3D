import { metaData } from '@cornerstonejs/core';

// TODO: Test remaining implemented tags
// Supported 4D Tags
//   (0018,1060) Trigger Time                   [Implemented, not tested]
//   (0018,0081) Echo Time                      [Implemented, not tested]
//   (0018,0086) Echo Number                    [Implemented, not tested]
//   (0020,0100) Temporal Position Identifier   [OK]
//   (0054,1300) FrameReferenceTime             [OK]
//   (0018,9087) Diffusion B Value              [OK]
//   (2001,1003) Philips Diffusion B-factor     [OK]
//   (0019,100c) Siemens Diffusion B Value      [Implemented, not tested]
//   (0043,1039) GE Diffusion B Value           [OK]

interface MappedIPP {
  imageId: string;
  imagePositionPatient;
}

const groupBy = (array, key) => {
  return array.reduce((rv, x) => {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};

function getIPPGroups(imageIds: string[]): { [id: string]: Array<MappedIPP> } {
  const ippMetadata: Array<MappedIPP> = imageIds.map((imageId) => {
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId);
    return { imageId, imagePositionPatient };
  });

  if (!ippMetadata.every((item) => item.imagePositionPatient)) {
    // Fail if any instances don't provide a position
    return null;
  }

  const positionGroups = groupBy(ippMetadata, 'imagePositionPatient');
  const positions = Object.keys(positionGroups);
  const frame_count = positionGroups[positions[0]].length;
  if (frame_count === 1) {
    // Single frame indicates 3D volume
    return null;
  }
  const frame_count_equal = positions.every(
    (k) => positionGroups[k].length === frame_count
  );
  if (!frame_count_equal) {
    // Differences in number of frames per position group --> not a valid MV
    return null;
  }
  return positionGroups;
}

function test4DTag(
  IPPGroups: { [id: string]: Array<MappedIPP> },
  value_getter: (imageId: string) => number
) {
  const frame_groups = {};
  let first_frame_value_set: number[] = [];

  const positions = Object.keys(IPPGroups);
  for (let i = 0; i < positions.length; i++) {
    const frame_value_set: Set<number> = new Set<number>();
    const frames = IPPGroups[positions[i]];

    for (let j = 0; j < frames.length; j++) {
      const frame_value = value_getter(frames[j].imageId) || 0;

      frame_groups[frame_value] = frame_groups[frame_value] || [];
      frame_groups[frame_value].push({ imageId: frames[j].imageId });

      frame_value_set.add(frame_value);
      if (frame_value_set.size - 1 < j) {
        return undefined;
      }
    }

    if (i == 0) {
      first_frame_value_set = Array.from(frame_value_set);
    } else if (!setEquals(first_frame_value_set, frame_value_set)) {
      return undefined;
    }
  }
  return frame_groups;
}

function getTagValue(imageId: string, tag: string): number {
  const value = metaData.get(tag, imageId);
  try {
    return parseFloat(value);
  } catch {
    return undefined;
  }
}

function getPhilipsPrivateBValue(imageId: string) {
  // Philips Private Diffusion B-factor tag (2001, 1003)
  // Private creator: Philips Imaging DD 001, VR=FL, VM=1
  const value = metaData.get('20011003', imageId);
  try {
    const { InlineBinary } = value;
    if (InlineBinary) {
      const value_bytes = atob(InlineBinary);
      const ary_buf = new ArrayBuffer(value_bytes.length);
      const dv = new DataView(ary_buf);
      for (let i = 0; i < value_bytes.length; i++) {
        dv.setUint8(i, value_bytes.charCodeAt(i));
      }
      //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
      // For WebGL Buffers, can skip Float32Array,
      // just return ArrayBuffer is all that's needed.
      return new Float32Array(ary_buf)[0];
    }

    return parseFloat(value);
  } catch {
    return undefined;
  }
}

function getSiemensPrivateBValue(imageId: string) {
  // Siemens Private Diffusion B-factor tag (0019, 100c)
  // Private creator: SIEMENS MR HEADER, VR=IS, VM=1
  let value = metaData.get('0019100c', imageId);

  try {
    const { InlineBinary } = value;
    if (InlineBinary) {
      value = atob(InlineBinary);
    }
    return parseFloat(value);
  } catch {
    return undefined;
  }
}

function getGEPrivateBValue(imageId: string) {
  // GE Private Diffusion B-factor tag (0043, 1039)
  // Private creator: GEMS_PARM_01, VR=IS, VM=4
  let value = metaData.get('00431039', imageId);

  try {
    const { InlineBinary } = value;
    if (InlineBinary) {
      value = atob(InlineBinary).split('//');
    }
    return parseFloat(value[0]) % 100000;
  } catch {
    return undefined;
  }
}

function setEquals(set_a: number[], set_b: Set<number>): boolean {
  if (set_a.length != set_b.size) {
    return false;
  }
  for (let i = 0; i < set_a.length; i++) {
    if (!set_b.has(set_a[i])) {
      return false;
    }
  }
  return true;
}

function getPetFrameReferenceTime(imageId) {
  const moduleInfo = metaData.get('petImageModule', imageId);
  return moduleInfo ? moduleInfo['frameReferenceTime'] : 0;
}

/**
 * Split the imageIds array by 4D tags into groups. Each group must have the
 * same number of imageIds or the same imageIds array passed in is returned.
 * @param imageIds - array of imageIds
 * @returns imageIds grouped by 4D tags
 */
function splitImageIdsBy4DTags(imageIds: string[]): string[][] {
  const positionGroups = getIPPGroups(imageIds);
  if (!positionGroups) {
    return [imageIds];
  }

  const fncList2 = [
    (imageId) => getTagValue(imageId, 'TemporalPositionIdentifier'),
    (imageId) => getTagValue(imageId, 'DiffusionBValue'),
    (imageId) => getTagValue(imageId, 'TriggerTime'),
    (imageId) => getTagValue(imageId, 'EchoTime'),
    (imageId) => getTagValue(imageId, 'EchoNumber'),
    getPhilipsPrivateBValue,
    getSiemensPrivateBValue,
    getGEPrivateBValue,
    getPetFrameReferenceTime,
  ];

  for (let i = 0; i < fncList2.length; i++) {
    const frame_groups = test4DTag(positionGroups, fncList2[i]);
    if (frame_groups) {
      const sortedKeys = Object.keys(frame_groups)
        .map(Number.parseFloat)
        .sort((a, b) => a - b);

      const imageIdsGroups = sortedKeys.map((key) =>
        frame_groups[key].map((item) => item.imageId)
      );
      return imageIdsGroups;
    }
  }

  // return the same imagesIds for non-4D volumes
  return [imageIds];
}

export default splitImageIdsBy4DTags;
