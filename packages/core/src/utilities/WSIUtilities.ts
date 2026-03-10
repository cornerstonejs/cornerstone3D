import { vec3 } from 'gl-matrix';
import { MetadataModules } from '../enums';
import type { Point3 } from '../types';
import { peerImport } from '../init';
import * as metaData from '../metaData';
import microscopyViewportCss from '../constants/microscopyViewportCss';
import imageIdToURI from './imageIdToURI';

export interface WSIImageMetadataSource {
  NumberOfFrames?: number;
  TotalPixelMatrixColumns: number;
  TotalPixelMatrixRows: number;
  ImageOrientationSlide?: number[];
  ImagedVolumeWidth?: number;
  ImagedVolumeHeight?: number;
  ImagedVolumeDepth?: number;
  TotalPixelMatrixOriginSequence?: Array<{
    XOffsetInSlideCoordinateSystem?: number;
    YOffsetInSlideCoordinateSystem?: number;
    ZOffsetInSlideCoordinateSystem?: number;
  }>;
  ['00080008']?: {
    Value?: string[];
  };
  ['00200052']?: {
    Value?: string[];
  };
  isMultiframe?: unknown;
  frameNumber?: unknown;
  [key: string]: unknown;
}

export interface WSIImageVolumeLike extends WSIImageMetadataSource {
  ImageType: string[];
}

export interface WSIClientLike {
  getDICOMwebMetadata(imageId: string): WSIImageMetadataSource;
}

export interface WSIMapViewLike {
  getCenter(): [number, number];
  getExtent?(): number[];
  getProjection(): {
    getExtent(): number[];
  };
  getResolution(): number;
  getRotation(): number;
  getZoom(): number;
  setCenter(center: [number, number]): void;
  setResolution?(resolution: number): void;
  setRotation(rotation: number): void;
  setZoom(zoom: number): void;
}

export interface WSIMapLike {
  getView(): WSIMapViewLike;
  getViewport(): HTMLElement;
  on(eventName: string, handler: () => void): void;
  render(): void;
  un(eventName: string, handler: () => void): void;
}

export interface WSIViewerLike {
  cleanup?(): void;
  deactivateDragPanInteraction(): void;
  getAffine(): unknown;
  getMap(): WSIMapLike;
  render(args: { container: HTMLElement }): void;
}

export interface WSITransformUtilitiesLike {
  applyInverseTransform(args: {
    coordinate: [number, number];
    affine: unknown;
  }): [number, number];
  applyTransform(args: {
    coordinate: [number, number];
    affine: unknown;
  }): [number, number];
}

export interface DicomMicroscopyViewerLike {
  metadata: {
    VLWholeSlideMicroscopyImage: new (args: {
      metadata: WSIImageMetadataSource;
    }) => WSIImageVolumeLike;
  };
  utils?: WSITransformUtilitiesLike;
  viewer: {
    VolumeImageViewer: new (args: {
      client: unknown;
      metadata: WSIImageVolumeLike[];
      controls: string[];
      retrieveRendered: boolean;
      bindings: Record<string, unknown>;
    }) => WSIViewerLike;
  };
}

export interface WSIImageDataMetadata {
  bitsAllocated: number;
  numberOfComponents: number;
  origin: Point3;
  direction: number[];
  dimensions: [number, number, number];
  spacing: [number, number, number];
  hasPixelSpacing: boolean;
  numVoxels: number;
  imagePlaneModule: Record<string, unknown>;
}

export interface LoadedWSIData {
  volumeImages: WSIImageVolumeLike[];
  metadataDicomweb: WSIImageMetadataSource[];
  metadata: WSIImageDataMetadata;
  frameOfReferenceUID: string | null;
  imageURISet: Set<string>;
}

const overlayCssId = 'wsiViewportOverlayCss';

export async function getDicomMicroscopyViewer(): Promise<DicomMicroscopyViewerLike> {
  return peerImport(
    'dicom-microscopy-viewer'
  ) as Promise<DicomMicroscopyViewerLike>;
}

export function addWSIMiniNavigationOverlayCss() {
  if (document.getElementById(overlayCssId)) {
    return;
  }

  const overlayCss = document.createElement('style');
  overlayCss.innerText = microscopyViewportCss;
  overlayCss.setAttribute('id', overlayCssId);
  document.getElementsByTagName('head')[0].append(overlayCss);
}

export function getWSIImageDataMetadata(args: {
  metadataDicomweb: WSIImageMetadataSource[];
  imageIds: string[];
  imageIndex?: number;
}): WSIImageDataMetadata {
  const { metadataDicomweb, imageIds, imageIndex = 0 } = args;
  const maxImage = metadataDicomweb.reduce((currentMax, image) => {
    return currentMax?.NumberOfFrames < image.NumberOfFrames
      ? image
      : currentMax;
  });
  const {
    TotalPixelMatrixColumns: columns,
    TotalPixelMatrixRows: rows,
    ImageOrientationSlide,
    ImagedVolumeWidth: width,
    ImagedVolumeHeight: height,
    ImagedVolumeDepth: depth,
  } = maxImage;
  const imagePlaneModule = metaData.get(
    MetadataModules.IMAGE_PLANE,
    imageIds[imageIndex]
  );

  let rowCosines = ImageOrientationSlide.slice(0, 3);
  let columnCosines = ImageOrientationSlide.slice(3, 6);

  if (rowCosines == null || columnCosines == null) {
    rowCosines = [1, 0, 0] as Point3;
    columnCosines = [0, 1, 0] as Point3;
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

  const {
    XOffsetInSlideCoordinateSystem = 0,
    YOffsetInSlideCoordinateSystem = 0,
    ZOffsetInSlideCoordinateSystem = 0,
  } = maxImage.TotalPixelMatrixOriginSequence?.[0] || {};
  const origin = [
    XOffsetInSlideCoordinateSystem,
    YOffsetInSlideCoordinateSystem,
    ZOffsetInSlideCoordinateSystem,
  ] as Point3;
  const xSpacing = width / columns;
  const ySpacing = height / rows;
  const zSpacing = depth;
  const xVoxels = columns;
  const yVoxels = rows;
  const zVoxels = 1;

  return {
    bitsAllocated: 8,
    numberOfComponents: 3,
    origin,
    direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal],
    dimensions: [xVoxels, yVoxels, zVoxels],
    spacing: [xSpacing, ySpacing, zSpacing],
    hasPixelSpacing: !!(width && height),
    numVoxels: xVoxels * yVoxels * zVoxels,
    imagePlaneModule,
  };
}

export async function loadWSIData(args: {
  imageIds: string[];
  client: WSIClientLike;
  dicomMicroscopyViewer?: DicomMicroscopyViewerLike;
}): Promise<LoadedWSIData> {
  const { imageIds, client, dicomMicroscopyViewer } = args;
  const DicomMicroscopyViewer =
    dicomMicroscopyViewer || (await getDicomMicroscopyViewer());
  let frameOfReferenceUID: string | null = null;
  const metadataDicomweb = imageIds.map((imageId) => {
    const imageMetadata = client.getDICOMwebMetadata(imageId);

    Object.defineProperty(imageMetadata, 'isMultiframe', {
      value: imageMetadata.isMultiframe,
      enumerable: false,
    });
    Object.defineProperty(imageMetadata, 'frameNumber', {
      value: undefined,
      enumerable: false,
    });
    const imageType = imageMetadata['00080008']?.Value;

    if (imageType?.length === 1) {
      imageMetadata['00080008'].Value = imageType[0].split('\\');
    }

    const imageFrameOfReference = imageMetadata['00200052']?.Value?.[0];

    if (!frameOfReferenceUID) {
      frameOfReferenceUID = imageFrameOfReference;
    } else if (imageFrameOfReference !== frameOfReferenceUID) {
      imageMetadata['00200052'].Value = [frameOfReferenceUID];
    }

    return imageMetadata;
  });
  const volumeImages: WSIImageVolumeLike[] = [];

  metadataDicomweb.forEach((metadata) => {
    const image =
      new DicomMicroscopyViewer.metadata.VLWholeSlideMicroscopyImage({
        metadata,
      });
    const imageFlavor = image.ImageType[2];

    if (imageFlavor === 'VOLUME' || imageFlavor === 'THUMBNAIL') {
      volumeImages.push(image);
    }
  });

  return {
    volumeImages,
    metadataDicomweb,
    metadata: getWSIImageDataMetadata({
      metadataDicomweb: volumeImages,
      imageIds,
    }),
    frameOfReferenceUID,
    imageURISet: new Set(imageIds.map((imageId) => imageIdToURI(imageId))),
  };
}
