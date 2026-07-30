import { generateSegmentation } from './generateSegmentation';
import { generateLabelMaps2DFrom3D } from './generateLabelMaps2DFrom3D';
import {
  generateToolState,
  createFromDicomSegImageId,
  createFromDICOMSegBuffer,
  createLabelmapsFromSegImageIds,
  createLabelmapsFromDICOMBuffer,
} from './generateToolState';

export {
  generateLabelMaps2DFrom3D,
  generateSegmentation,
  generateToolState,
  createFromDicomSegImageId,
  // Deprecated alias kept for backward compatibility; see generateToolState.ts
  createFromDICOMSegBuffer,
  createLabelmapsFromSegImageIds,
  createLabelmapsFromDICOMBuffer,
};
