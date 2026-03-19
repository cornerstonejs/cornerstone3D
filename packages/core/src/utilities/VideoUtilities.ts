import { vec3 } from 'gl-matrix';
import { MetadataModules } from '../enums';
import type { Point3 } from '../types';
import * as metaData from '../metaData';

export interface VideoImageMetadata {
  bitsAllocated: number;
  numberOfComponents: number;
  origin: Point3;
  rows: number;
  columns: number;
  direction: number[];
  dimensions: [number, number, number];
  spacing: [number, number, number];
  hasPixelSpacing: boolean;
  numVoxels: number;
  imagePlaneModule: Record<string, unknown>;
}

export interface LoadedVideoStreamMetadata {
  renderedUrl: string;
  modality?: string;
  metadata: VideoImageMetadata;
  cineRate?: number;
  numberOfFrames?: number;
}

export function getVideoImageDataMetadata(imageId: string): VideoImageMetadata {
  const imagePlaneModule = metaData.get(MetadataModules.IMAGE_PLANE, imageId);

  let rowCosines = imagePlaneModule.rowCosines as Point3;
  let columnCosines = imagePlaneModule.columnCosines as Point3;
  const usingDefaultValues = imagePlaneModule.usingDefaultValues;

  if (usingDefaultValues || rowCosines == null || columnCosines == null) {
    rowCosines = [1, 0, 0];
    columnCosines = [0, 1, 0];
  }

  const rowCosineVec = vec3.fromValues(
    rowCosines[0],
    rowCosines[1],
    rowCosines[2]
  );
  const colCosineVec = vec3.fromValues(
    columnCosines[0],
    columnCosines[1],
    columnCosines[2]
  );
  const scanAxisNormal = vec3.create();

  vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

  const rows = imagePlaneModule.rows;
  const columns = imagePlaneModule.columns;
  const origin = (imagePlaneModule.imagePositionPatient || [0, 0, 0]) as Point3;
  const xSpacing = imagePlaneModule.columnPixelSpacing || 1;
  const ySpacing = imagePlaneModule.rowPixelSpacing || 1;
  const zSpacing = 1;
  const xVoxels = imagePlaneModule.columns;
  const yVoxels = imagePlaneModule.rows;
  const zVoxels = 1;

  return {
    bitsAllocated: 8,
    numberOfComponents: 3,
    origin,
    rows,
    columns,
    direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal],
    dimensions: [xVoxels, yVoxels, zVoxels],
    spacing: [xSpacing, ySpacing, zSpacing],
    hasPixelSpacing: !!imagePlaneModule.columnPixelSpacing,
    numVoxels: xVoxels * yVoxels * zVoxels,
    imagePlaneModule,
  };
}

export function loadVideoStreamMetadata(
  imageId: string
): LoadedVideoStreamMetadata {
  const imageUrlModule = metaData.get(MetadataModules.IMAGE_URL, imageId);

  if (!imageUrlModule?.rendered) {
    throw new Error(
      `Video Image ID ${imageId} does not have a rendered video view`
    );
  }

  const generalSeries = metaData.get(MetadataModules.GENERAL_SERIES, imageId);
  const cine = metaData.get(MetadataModules.CINE, imageId) || {};

  return {
    renderedUrl: imageUrlModule.rendered,
    modality: generalSeries?.Modality,
    metadata: getVideoImageDataMetadata(imageId),
    cineRate: cine.cineRate,
    numberOfFrames: cine.numberOfFrames,
  };
}

export function normalizeVideoPlaybackInfo(args: {
  durationSeconds: number;
  cineRate?: number;
  numberOfFrames?: number;
}): {
  fps: number;
  numberOfFrames: number;
  frameRange: [number, number];
} {
  const durationSeconds = Math.max(args.durationSeconds || 0, 0.001);
  let numberOfFrames = args.numberOfFrames;
  let fps = args.cineRate;

  if (!numberOfFrames || numberOfFrames === 1) {
    numberOfFrames = Math.max(1, Math.round(durationSeconds * (fps || 30)));
  }

  if (!fps) {
    fps = Math.max(1, Math.round(numberOfFrames / durationSeconds));
  }

  return {
    fps,
    numberOfFrames,
    frameRange: [1, numberOfFrames],
  };
}

export function frameNumberToTimeSeconds(
  frameNumber: number,
  fps: number
): number {
  return Math.max(0, frameNumber - 1) / Math.max(1, fps);
}

export function timeSecondsToFrameNumber(
  timeSeconds: number,
  fps: number
): number {
  return 1 + Math.round(Math.max(0, timeSeconds) * Math.max(1, fps));
}
