import * as eventListener from './eventListener';
import csUtils from './invertRgbTransferFunction';
import createSigmoidRGBTransferFunction from './createSigmoidRGBTransferFunction';
import getVoiFromSigmoidRGBTransferFunction from './getVoiFromSigmoidRGBTransferFunction';
import createLinearRGBTransferFunction from './createLinearRGBTransferFunction';
import scaleRgbTransferFunction from './scaleRgbTransferFunction';
import triggerEvent from './triggerEvent';
import uuidv4 from './uuidv4';
import getMinMax from './getMinMax';
import getRuntimeId from './getRuntimeId';
import imageIdToURI from './imageIdToURI';
import calibratedPixelSpacingMetadataProvider from './calibratedPixelSpacingMetadataProvider';
import clamp from './clamp';
import { isEqual, isEqualAbs, isEqualNegative } from './isEqual';
import isOpposite from './isOpposite';
import getClosestImageId from './getClosestImageId';
import getSpacingInNormalDirection from './getSpacingInNormalDirection';
import getTargetVolumeAndSpacingInNormalDir from './getTargetVolumeAndSpacingInNormalDir';
import getVolumeActorCorners from './getVolumeActorCorners';
import indexWithinDimensions from './indexWithinDimensions';
import getVolumeViewportsContainingSameVolumes from './getVolumeViewportsContainingSameVolumes';
import getViewportsWithVolumeId from './getViewportsWithVolumeId';
import transformWorldToIndex, {
  transformWorldToIndexContinuous,
} from './transformWorldToIndex';
import transformIndexToWorld from './transformIndexToWorld';
import loadImageToCanvas from './loadImageToCanvas';
import * as HistoryMemo from './historyMemo';
import renderToCanvasCPU from './renderToCanvasCPU';
import renderToCanvasGPU from './renderToCanvasGPU';
import worldToImageCoords from './worldToImageCoords';
import imageToWorldCoords from './imageToWorldCoords';
import getVolumeSliceRangeInfo from './getVolumeSliceRangeInfo';
import getVolumeViewportScrollInfo from './getVolumeViewportScrollInfo';
import getSliceRange from './getSliceRange';
import snapFocalPointToSlice from './snapFocalPointToSlice';
import getImageSliceDataForVolumeViewport from './getImageSliceDataForVolumeViewport';
import { isImageActor, actorIsA } from './actorCheck';
import getViewportsWithImageURI from './getViewportsWithImageURI';
import getClosestStackImageIndexForPoint from './getClosestStackImageIndexForPoint';
import getCurrentVolumeViewportSlice from './getCurrentVolumeViewportSlice';
import calculateViewportsSpatialRegistration from './calculateViewportsSpatialRegistration';
import spatialRegistrationMetadataProvider from './spatialRegistrationMetadataProvider';
import getViewportImageCornersInWorld from './getViewportImageCornersInWorld';
import hasNaNValues from './hasNaNValues';
import applyPreset from './applyPreset';
import PointsManager from './PointsManager';
import deepMerge from './deepMerge';
import getScalingParameters from './getScalingParameters';
import isPTPrescaledWithSUV from './isPTPrescaledWithSUV';
import getImageLegacy from './getImageLegacy';
import sortImageIdsAndGetSpacing from './sortImageIdsAndGetSpacing';
import makeVolumeMetadata from './makeVolumeMetadata';
import genericMetadataProvider from './genericMetadataProvider';
import { isValidVolume } from './isValidVolume';
import { updateVTKImageDataWithCornerstoneImage } from './updateVTKImageDataWithCornerstoneImage';
import ProgressiveIterator from './ProgressiveIterator';
import decimate from './decimate';
import imageRetrieveMetadataProvider from './imageRetrieveMetadataProvider';
import isVideoTransferSyntax from './isVideoTransferSyntax';
import { getBufferConfiguration } from './getBufferConfiguration';
import { generateVolumePropsFromImageIds } from './generateVolumePropsFromImageIds';
import { convertStackToVolumeViewport } from './convertStackToVolumeViewport';
import { convertVolumeToStackViewport } from './convertVolumeToStackViewport';
import VoxelManager from './VoxelManager';
import RLEVoxelMap from './RLEVoxelMap';
import roundNumber, { roundToPrecision } from './roundNumber';
import convertToGrayscale from './convertToGrayscale';
import getViewportImageIds from './getViewportImageIds';
import { getRandomSampleFromArray } from './getRandomSampleFromArray';
import { getVolumeId } from './getVolumeId';
import { hasFloatScalingParameters } from './hasFloatScalingParameters';
import { pointInShapeCallback } from './pointInShapeCallback';
// name spaces
export * as planar from './planar';
import * as windowLevel from './windowLevel';
import * as colormap from './colormap';
import * as transferFunctionUtils from './transferFunctionUtils';
import * as color from './color';
import { deepEqual } from './deepEqual';
import type { IViewport } from '../types/IViewport';
import FrameRange from './FrameRange';
import fnv1aHash from './fnv1aHash';
import { getImageDataMetadata } from './getImageDataMetadata';
import { buildMetadata } from './buildMetadata';

// solving the circular dependency issue
import { _getViewportModality } from './getViewportModality';
import cache from '../cache/cache';
import getDynamicVolumeInfo from './getDynamicVolumeInfo';
import autoLoad from './autoLoad';
import scaleArray from './scaleArray';
import splitImageIdsBy4DTags from './splitImageIdsBy4DTags';
import { deepClone } from './deepClone';
import { jumpToSlice } from './jumpToSlice';
import scroll from './scroll';
import clip from './clip';
import createSubVolume from './createSubVolume';
import getVolumeDirectionVectors from './getVolumeDirectionVectors';
import calculateSpacingBetweenImageIds from './calculateSpacingBetweenImageIds';
export * as logger from './logger';

const getViewportModality = (viewport: IViewport, volumeId?: string) =>
  _getViewportModality(viewport, volumeId, cache.getVolume);

export {
  FrameRange,
  eventListener,
  csUtils as invertRgbTransferFunction,
  createSigmoidRGBTransferFunction,
  getVoiFromSigmoidRGBTransferFunction,
  createLinearRGBTransferFunction,
  scaleRgbTransferFunction,
  triggerEvent,
  imageIdToURI,
  fnv1aHash,
  calibratedPixelSpacingMetadataProvider,
  clamp,
  uuidv4,
  getMinMax,
  getRuntimeId,
  isEqual,
  isEqualAbs,
  isEqualNegative,
  isOpposite,
  getViewportModality,
  windowLevel,
  convertToGrayscale,
  getClosestImageId,
  getSpacingInNormalDirection,
  getTargetVolumeAndSpacingInNormalDir,
  getVolumeActorCorners,
  indexWithinDimensions,
  getVolumeViewportsContainingSameVolumes,
  getViewportsWithVolumeId,
  transformWorldToIndex,
  transformIndexToWorld,
  loadImageToCanvas,
  renderToCanvasCPU,
  renderToCanvasGPU,
  worldToImageCoords,
  imageToWorldCoords,
  getVolumeSliceRangeInfo,
  getVolumeViewportScrollInfo,
  getSliceRange,
  snapFocalPointToSlice,
  getImageSliceDataForVolumeViewport,
  isImageActor,
  isPTPrescaledWithSUV,
  actorIsA,
  getViewportsWithImageURI,
  getClosestStackImageIndexForPoint,
  getCurrentVolumeViewportSlice,
  calculateViewportsSpatialRegistration,
  spatialRegistrationMetadataProvider,
  getViewportImageCornersInWorld,
  hasNaNValues,
  applyPreset,
  deepMerge,
  PointsManager,
  getScalingParameters,
  colormap,
  getImageLegacy,
  ProgressiveIterator,
  decimate,
  imageRetrieveMetadataProvider,
  transferFunctionUtils,
  updateVTKImageDataWithCornerstoneImage,
  sortImageIdsAndGetSpacing,
  makeVolumeMetadata,
  isValidVolume,
  genericMetadataProvider,
  isVideoTransferSyntax,
  HistoryMemo,
  generateVolumePropsFromImageIds,
  getBufferConfiguration,
  VoxelManager,
  RLEVoxelMap,
  convertStackToVolumeViewport,
  convertVolumeToStackViewport,
  roundNumber,
  roundToPrecision,
  getViewportImageIds,
  getRandomSampleFromArray,
  getVolumeId,
  color,
  hasFloatScalingParameters,
  getDynamicVolumeInfo,
  autoLoad,
  scaleArray,
  deepClone,
  splitImageIdsBy4DTags,
  pointInShapeCallback,
  deepEqual,
  jumpToSlice,
  scroll,
  clip,
  transformWorldToIndexContinuous,
  createSubVolume,
  getVolumeDirectionVectors,
  calculateSpacingBetweenImageIds,
  getImageDataMetadata,
  buildMetadata,
};
