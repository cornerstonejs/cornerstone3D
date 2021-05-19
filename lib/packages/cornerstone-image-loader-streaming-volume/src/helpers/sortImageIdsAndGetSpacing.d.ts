import { vec3 } from 'gl-matrix';
import { Types } from '@ohif/cornerstone-render';
declare type SortedImageIdsItem = {
    zSpacing: number;
    origin: Types.Point3;
    sortedImageIds: Array<string>;
};
/**
 *
 * @param {*} scanAxisNormal - [x, y, z] array or gl-matrix vec3
 * @param {*} imageMetaDataMap - one of the results from BuildMetadata()
 */
export default function sortImageIdsAndGetSpacing(imageIds: Array<string>, scanAxisNormal: vec3): SortedImageIdsItem;
export {};
