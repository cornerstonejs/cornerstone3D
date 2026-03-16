import { vec3 } from 'gl-matrix';
import { EPSILON } from '../../../constants';
import { InterpolationType, VOILUTFunctionType } from '../../../enums';
import type {
  CPUFallbackEnabledElement,
  ICamera,
  IImage,
  IImageVolume,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
  Point3,
  VOIRange,
} from '../../../types';
import VoxelManager from '../../../utilities/VoxelManager';
import getDefaultViewport from '../../helpers/cpuFallback/rendering/getDefaultViewport';
import getSpacingInNormalDirection from '../../../utilities/getSpacingInNormalDirection';
import type { PlanarDataPresentation } from './PlanarViewportV2Types';

type SliceArray = PixelDataTypedArray;

export type PlanarCPUSampledSliceState = {
  image: IImage;
  focalPoint: Point3;
  translationReferenceFocalPoint: Point3;
  right: Point3;
  up: Point3;
  normal: Point3;
  spacingInNormalDirection: number;
  canvasWidth: number;
  canvasHeight: number;
  interpolationType: InterpolationType;
};

type OrthogonalSliceSampleResult = {
  scalarData: SliceArray;
  width: number;
  height: number;
  columnPixelSpacing: number;
  rowPixelSpacing: number;
  minPixelValue: number;
  maxPixelValue: number;
  translationReferenceFocalPoint: Point3;
};

function dot(a: Point3, b: Point3): number {
  return vec3.dot(a as unknown as vec3, b as unknown as vec3);
}

function subtractPoints(a: Point3, b: Point3): Point3 {
  return vec3.subtract(
    [0, 0, 0] as vec3,
    a as unknown as vec3,
    b as unknown as vec3
  ) as Point3;
}

function arePointsClose(a: Point3, b: Point3, tolerance = 1e-4): boolean {
  return vec3.distance(a as unknown as vec3, b as unknown as vec3) <= tolerance;
}

function getSlicePlaneDefinition(normalAxis: number): {
  slicePlane: 0 | 1 | 2;
  colAxis: 0 | 1 | 2;
  rowAxis: 0 | 1 | 2;
} {
  if (normalAxis === 0) {
    return { slicePlane: 0, colAxis: 2, rowAxis: 1 };
  }

  if (normalAxis === 1) {
    return { slicePlane: 1, colAxis: 0, rowAxis: 2 };
  }

  return { slicePlane: 2, colAxis: 0, rowAxis: 1 };
}

function getIndexMajorAxis(
  volume: IImageVolume,
  worldVector: Point3,
  majorThreshold = 0.995
): { axis: 0 | 1 | 2; sign: 1 | -1 } | undefined {
  const row = volume.direction.slice(0, 3) as Point3;
  const col = volume.direction.slice(3, 6) as Point3;
  const scan = volume.direction.slice(6, 9) as Point3;
  const components = [
    dot(worldVector, row),
    dot(worldVector, col),
    dot(worldVector, scan),
  ] as [number, number, number];
  const absComponents = components.map((v) => Math.abs(v)) as [
    number,
    number,
    number,
  ];
  const maxValue = Math.max(...absComponents);
  const axis = absComponents.indexOf(maxValue) as 0 | 1 | 2;

  if (maxValue < majorThreshold) {
    return;
  }

  const secondary = absComponents
    .filter((_v, index) => index !== axis)
    .some((v) => v > 1 - majorThreshold);

  if (secondary) {
    return;
  }

  return {
    axis,
    sign: components[axis] >= 0 ? 1 : -1,
  };
}

function indexToWorld(volume: IImageVolume, ijk: Point3): Point3 {
  const [i, j, k] = ijk;
  const [sx, sy, sz] = volume.spacing;
  const row = volume.direction.slice(0, 3) as Point3;
  const col = volume.direction.slice(3, 6) as Point3;
  const scan = volume.direction.slice(6, 9) as Point3;
  const world = vec3.copy(
    [0, 0, 0] as vec3,
    volume.origin as unknown as vec3
  ) as Point3;

  vec3.scaleAndAdd(
    world as unknown as vec3,
    world as unknown as vec3,
    row as unknown as vec3,
    sx * i
  );
  vec3.scaleAndAdd(
    world as unknown as vec3,
    world as unknown as vec3,
    col as unknown as vec3,
    sy * j
  );
  vec3.scaleAndAdd(
    world as unknown as vec3,
    world as unknown as vec3,
    scan as unknown as vec3,
    sz * k
  );

  return world;
}

function reorientSliceData(
  sourceData: SliceArray,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  sourceCoordFn: (
    outputX: number,
    outputY: number
  ) => { sourceX: number; sourceY: number },
  createTypedArray: (length: number) => SliceArray
): SliceArray {
  const outputData = createTypedArray(outputWidth * outputHeight);
  let outputIndex = 0;

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const { sourceX, sourceY } = sourceCoordFn(x, y);
      outputData[outputIndex++] = sourceData[sourceY * sourceWidth + sourceX];
    }
  }

  return outputData;
}

export default class PlanarCPUVolumeSampler {
  private sampleSequence = 0;

  public getCameraBasis(camera: ICamera): {
    right: Point3;
    up: Point3;
    normal: Point3;
  } {
    const normal = vec3.normalize(
      vec3.create(),
      camera.viewPlaneNormal as Point3
    ) as Point3;
    const rawUp = vec3.normalize(vec3.create(), camera.viewUp as Point3);
    let right = vec3.cross(vec3.create(), rawUp, normal);

    if (vec3.length(right) < EPSILON) {
      right = vec3.cross(vec3.create(), [0, 1, 0], normal);
    }

    right = vec3.normalize(vec3.create(), right) as Point3;
    const up = vec3.normalize(
      vec3.create(),
      vec3.cross(vec3.create(), normal, right)
    ) as Point3;

    return { right, up, normal };
  }

  public getResolvedVOIRange(
    voiRange: VOIRange | undefined,
    fallbackLower: number,
    fallbackUpper: number
  ): VOIRange {
    if (
      voiRange &&
      Number.isFinite(voiRange.lower) &&
      Number.isFinite(voiRange.upper) &&
      voiRange.upper > voiRange.lower
    ) {
      return voiRange;
    }

    if (fallbackUpper > fallbackLower) {
      return { lower: fallbackLower, upper: fallbackUpper };
    }

    return { lower: fallbackLower, upper: fallbackLower + 1 };
  }

  public getFallbackStoredRange(volume: IImageVolume): {
    min: number;
    max: number;
  } {
    const [volumeMin, volumeMax] = volume.voxelManager.getRange();
    let min = Math.floor(Number.isFinite(volumeMin) ? volumeMin : 0);
    let max = Math.ceil(Number.isFinite(volumeMax) ? volumeMax : min + 1);

    if (max <= min) {
      max = min + 1;
    }

    return { min, max };
  }

  public createOrUpdateEnabledElement(args: {
    enabledElement?: CPUFallbackEnabledElement;
    canvas: HTMLCanvasElement;
    image: IImage;
    modality?: string;
  }): CPUFallbackEnabledElement {
    const { enabledElement, canvas, image, modality } = args;

    if (enabledElement) {
      enabledElement.canvas = canvas;
      enabledElement.image = image;
      return enabledElement;
    }

    return {
      canvas,
      image,
      renderingTools: {},
      viewport: getDefaultViewport(canvas, image, modality),
    } as CPUFallbackEnabledElement;
  }

  public updateCPUFallbackViewport(args: {
    enabledElement: CPUFallbackEnabledElement;
    sampledSliceState: PlanarCPUSampledSliceState;
    camera: ICamera;
    dataPresentation?: PlanarDataPresentation;
    zoom?: number;
  }): void {
    const {
      enabledElement,
      sampledSliceState,
      camera,
      dataPresentation,
      zoom,
    } = args;
    const rowPixelSpacing = sampledSliceState.image.rowPixelSpacing || 1;
    const columnPixelSpacing = sampledSliceState.image.columnPixelSpacing || 1;
    const focalDelta = subtractPoints(
      camera.focalPoint as Point3,
      sampledSliceState.translationReferenceFocalPoint
    );
    const viewport = enabledElement.viewport;
    const resolvedVOI = this.getResolvedVOIRange(
      dataPresentation?.voiRange,
      sampledSliceState.image.minPixelValue ?? 0,
      sampledSliceState.image.maxPixelValue ?? 1
    );

    viewport.translation = {
      x: -dot(focalDelta, sampledSliceState.right) / columnPixelSpacing,
      y: dot(focalDelta, sampledSliceState.up) / rowPixelSpacing,
    };
    viewport.scale =
      (getDefaultViewport(enabledElement.canvas, sampledSliceState.image)
        .scale ?? 1) * Math.max(zoom ?? 1, 0.001);
    viewport.parallelScale = camera.parallelScale;
    viewport.invert = dataPresentation?.invert ?? false;
    viewport.pixelReplication =
      dataPresentation?.interpolationType === InterpolationType.NEAREST;
    viewport.voi = {
      windowCenter: (resolvedVOI.lower + resolvedVOI.upper) / 2,
      windowWidth: Math.max(resolvedVOI.upper - resolvedVOI.lower, 1),
      voiLUTFunction: VOILUTFunctionType.LINEAR,
    };
  }

  public needsResample(args: {
    sampledSliceState?: PlanarCPUSampledSliceState;
    width: number;
    height: number;
    camera: ICamera;
    dataPresentation?: PlanarDataPresentation;
  }): boolean {
    const { sampledSliceState, width, height, camera, dataPresentation } = args;

    if (!sampledSliceState) {
      return true;
    }

    const { right, up, normal } = this.getCameraBasis(camera);
    const focalPoint = camera.focalPoint as Point3;
    const interpolationType =
      dataPresentation?.interpolationType ?? InterpolationType.LINEAR;
    const focalDelta = subtractPoints(focalPoint, sampledSliceState.focalPoint);
    const deltaInNormal = Math.abs(dot(focalDelta, sampledSliceState.normal));
    const columnPixelSpacing = sampledSliceState.image.columnPixelSpacing || 1;
    const rowPixelSpacing = sampledSliceState.image.rowPixelSpacing || 1;
    const shiftXPixels =
      Math.abs(dot(focalDelta, sampledSliceState.right)) / columnPixelSpacing;
    const shiftYPixels =
      Math.abs(dot(focalDelta, sampledSliceState.up)) / rowPixelSpacing;

    return (
      sampledSliceState.canvasWidth !== width ||
      sampledSliceState.canvasHeight !== height ||
      sampledSliceState.interpolationType !== interpolationType ||
      !arePointsClose(sampledSliceState.right, right) ||
      !arePointsClose(sampledSliceState.up, up) ||
      !arePointsClose(sampledSliceState.normal, normal) ||
      deltaInNormal > sampledSliceState.spacingInNormalDirection * 0.5 ||
      shiftXPixels > sampledSliceState.image.width * 0.35 ||
      shiftYPixels > sampledSliceState.image.height * 0.35
    );
  }

  public sampleSliceImage(args: {
    volume: IImageVolume;
    width: number;
    height: number;
    camera: ICamera;
    dataPresentation?: PlanarDataPresentation;
  }): PlanarCPUSampledSliceState {
    const { volume, width, height, camera, dataPresentation } = args;
    const { right, up, normal } = this.getCameraBasis(camera);
    const interpolationType =
      dataPresentation?.interpolationType ?? InterpolationType.LINEAR;
    const orthogonalSlice = this.trySampleOrthogonalSliceFromVoxelManager(
      volume,
      camera,
      right,
      up,
      normal
    );
    const fallbackRange = this.getFallbackStoredRange(volume);
    const voiRange = this.getResolvedVOIRange(
      dataPresentation?.voiRange,
      fallbackRange.min,
      fallbackRange.max
    );

    if (orthogonalSlice) {
      return {
        image: this.createSliceImage(
          volume,
          orthogonalSlice.scalarData,
          orthogonalSlice.width,
          orthogonalSlice.height,
          orthogonalSlice.columnPixelSpacing,
          orthogonalSlice.rowPixelSpacing,
          orthogonalSlice.minPixelValue,
          orthogonalSlice.maxPixelValue,
          voiRange
        ),
        focalPoint: vec3.clone(camera.focalPoint as unknown as vec3) as Point3,
        translationReferenceFocalPoint: vec3.clone(
          orthogonalSlice.translationReferenceFocalPoint as unknown as vec3
        ) as Point3,
        right: vec3.clone(right as unknown as vec3) as Point3,
        up: vec3.clone(up as unknown as vec3) as Point3,
        normal: vec3.clone(normal as unknown as vec3) as Point3,
        spacingInNormalDirection: Math.max(
          getSpacingInNormalDirection(volume, normal),
          EPSILON
        ),
        canvasWidth: width,
        canvasHeight: height,
        interpolationType,
      };
    }

    const parallelScale = Math.max(camera.parallelScale ?? 1, EPSILON);
    const worldHeight = parallelScale * 2;
    const worldWidth = worldHeight * (width / Math.max(height, 1));
    const xStep = worldWidth / Math.max(width, 1);
    const yStep = worldHeight / Math.max(height, 1);
    const xStart = -worldWidth / 2 + xStep / 2;
    const yStart = worldHeight / 2 - yStep / 2;
    const fallbackStoredRange = this.getFallbackStoredRange(volume);
    const SliceArrayConstructor = this.getSliceArrayConstructor(
      fallbackStoredRange.min,
      fallbackStoredRange.max
    );
    const sliceScalarData = new SliceArrayConstructor(width * height);
    let sampledMin = Infinity;
    let sampledMax = -Infinity;
    let pixelIndex = 0;

    for (let y = 0; y < height; y++) {
      const yOffset = yStart - y * yStep;
      const rowBase = [
        camera.focalPoint[0] + up[0] * yOffset,
        camera.focalPoint[1] + up[1] * yOffset,
        camera.focalPoint[2] + up[2] * yOffset,
      ] as Point3;

      for (let x = 0; x < width; x++) {
        const xOffset = xStart + x * xStep;
        const worldPoint = [
          rowBase[0] + right[0] * xOffset,
          rowBase[1] + right[1] * xOffset,
          rowBase[2] + right[2] * xOffset,
        ] as Point3;
        const intensity = VoxelManager.sampleAtWorld(
          volume,
          worldPoint,
          interpolationType
        );
        const storedIntensity = Number.isFinite(intensity)
          ? Math.round(
              Math.min(
                fallbackStoredRange.max,
                Math.max(fallbackStoredRange.min, intensity)
              )
            )
          : fallbackStoredRange.min;

        sliceScalarData[pixelIndex++] = storedIntensity;
        sampledMin = Math.min(sampledMin, storedIntensity);
        sampledMax = Math.max(sampledMax, storedIntensity);
      }
    }

    const minPixelValue = Number.isFinite(sampledMin)
      ? Math.floor(sampledMin)
      : fallbackStoredRange.min;
    const maxPixelValue =
      Number.isFinite(sampledMax) && sampledMax > sampledMin
        ? Math.ceil(sampledMax)
        : Math.max(minPixelValue + 1, fallbackStoredRange.max);

    return {
      image: this.createSliceImage(
        volume,
        sliceScalarData,
        width,
        height,
        worldWidth / Math.max(width, 1),
        worldHeight / Math.max(height, 1),
        minPixelValue,
        maxPixelValue,
        voiRange
      ),
      focalPoint: vec3.clone(camera.focalPoint as unknown as vec3) as Point3,
      translationReferenceFocalPoint: vec3.clone(
        camera.focalPoint as unknown as vec3
      ) as Point3,
      right: vec3.clone(right as unknown as vec3) as Point3,
      up: vec3.clone(up as unknown as vec3) as Point3,
      normal: vec3.clone(normal as unknown as vec3) as Point3,
      spacingInNormalDirection: Math.max(
        getSpacingInNormalDirection(volume, normal),
        EPSILON
      ),
      canvasWidth: width,
      canvasHeight: height,
      interpolationType,
    };
  }

  private trySampleOrthogonalSliceFromVoxelManager(
    volume: IImageVolume,
    camera: ICamera,
    right: Point3,
    up: Point3,
    normal: Point3
  ): OrthogonalSliceSampleResult | undefined {
    const normalAxis = getIndexMajorAxis(volume, normal);
    const rightAxis = getIndexMajorAxis(volume, right);
    const upAxis = getIndexMajorAxis(volume, up);

    if (!normalAxis || !rightAxis || !upAxis) {
      return;
    }

    if (
      normalAxis.axis === rightAxis.axis ||
      normalAxis.axis === upAxis.axis ||
      rightAxis.axis === upAxis.axis
    ) {
      return;
    }

    const planeDefinition = getSlicePlaneDefinition(normalAxis.axis);
    const downAxis = upAxis.axis;
    const downSign = -upAxis.sign;
    const rightSign = rightAxis.sign;
    const rightMatchesPlane =
      rightAxis.axis === planeDefinition.colAxis ||
      rightAxis.axis === planeDefinition.rowAxis;
    const downMatchesPlane =
      downAxis === planeDefinition.colAxis ||
      downAxis === planeDefinition.rowAxis;

    if (!rightMatchesPlane || !downMatchesPlane) {
      return;
    }

    const isDirect =
      rightAxis.axis === planeDefinition.colAxis &&
      downAxis === planeDefinition.rowAxis;
    const isSwapped =
      rightAxis.axis === planeDefinition.rowAxis &&
      downAxis === planeDefinition.colAxis;

    if (!isDirect && !isSwapped) {
      return;
    }

    const continuousIndex = VoxelManager.worldToIndexContinuous(
      volume,
      camera.focalPoint as Point3
    );
    const normalIndex = Math.max(
      0,
      Math.min(
        volume.dimensions[normalAxis.axis] - 1,
        Math.round(continuousIndex[normalAxis.axis])
      )
    );
    const sourceData = volume.voxelManager.getSliceData({
      sliceIndex: normalIndex,
      slicePlane: planeDefinition.slicePlane,
    }) as SliceArray;
    const referenceIndex = [
      (volume.dimensions[0] - 1) / 2,
      (volume.dimensions[1] - 1) / 2,
      (volume.dimensions[2] - 1) / 2,
    ] as Point3;

    referenceIndex[normalAxis.axis] = normalIndex;

    const translationReferenceFocalPoint = indexToWorld(volume, referenceIndex);
    const sourceWidth = volume.dimensions[planeDefinition.colAxis];
    const sourceHeight = volume.dimensions[planeDefinition.rowAxis];
    const fallbackRange = this.getFallbackStoredRange(volume);
    const createTypedArray = (length: number): SliceArray =>
      new (sourceData.constructor as new (n: number) => SliceArray)(length);

    if (isDirect) {
      const scalarData = reorientSliceData(
        sourceData,
        sourceWidth,
        sourceHeight,
        sourceWidth,
        sourceHeight,
        (x, y) => ({
          sourceX: rightSign > 0 ? x : sourceWidth - 1 - x,
          sourceY: downSign > 0 ? y : sourceHeight - 1 - y,
        }),
        createTypedArray
      );
      const { min, max } = this.getScalarDataRange(
        scalarData,
        fallbackRange.min,
        fallbackRange.max
      );

      return {
        scalarData,
        width: sourceWidth,
        height: sourceHeight,
        columnPixelSpacing: volume.spacing[rightAxis.axis],
        rowPixelSpacing: volume.spacing[downAxis],
        minPixelValue: min,
        maxPixelValue: max,
        translationReferenceFocalPoint,
      };
    }

    const outputWidth = sourceHeight;
    const outputHeight = sourceWidth;
    const scalarData = reorientSliceData(
      sourceData,
      sourceWidth,
      sourceHeight,
      outputWidth,
      outputHeight,
      (x, y) => ({
        sourceX: downSign > 0 ? y : sourceWidth - 1 - y,
        sourceY: rightSign > 0 ? x : sourceHeight - 1 - x,
      }),
      createTypedArray
    );
    const { min, max } = this.getScalarDataRange(
      scalarData,
      fallbackRange.min,
      fallbackRange.max
    );

    return {
      scalarData,
      width: outputWidth,
      height: outputHeight,
      columnPixelSpacing: volume.spacing[rightAxis.axis],
      rowPixelSpacing: volume.spacing[downAxis],
      minPixelValue: min,
      maxPixelValue: max,
      translationReferenceFocalPoint,
    };
  }

  private getScalarDataRange(
    scalarData: SliceArray,
    fallbackMin: number,
    fallbackMax: number
  ): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < scalarData.length; i++) {
      const value = Number(scalarData[i]);

      if (!Number.isFinite(value)) {
        continue;
      }

      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    if (!Number.isFinite(min)) {
      min = fallbackMin;
    }

    if (!Number.isFinite(max) || max <= min) {
      max = Math.max(min + 1, fallbackMax);
    }

    return {
      min: Math.floor(min),
      max: Math.ceil(max),
    };
  }

  private getSliceArrayConstructor(
    minPixelValue: number,
    maxPixelValue: number
  ): new (length: number) => SliceArray {
    if (minPixelValue >= 0 && maxPixelValue <= 65535) {
      return Uint16Array;
    }

    if (minPixelValue >= -32768 && maxPixelValue <= 32767) {
      return Int16Array;
    }

    return Int32Array;
  }

  private createSliceImage(
    volume: IImageVolume,
    scalarData: SliceArray,
    width: number,
    height: number,
    columnPixelSpacing: number,
    rowPixelSpacing: number,
    minPixelValue: number,
    maxPixelValue: number,
    voiRange?: VOIRange
  ): IImage {
    const resolvedVOI =
      voiRange && voiRange.upper > voiRange.lower
        ? voiRange
        : { lower: minPixelValue, upper: maxPixelValue };
    const windowWidth = Math.max(1, resolvedVOI.upper - resolvedVOI.lower);
    const windowCenter = (resolvedVOI.lower + resolvedVOI.upper) / 2;
    const imageId = `cpuVolumeSlice:${volume.volumeId}:${++this.sampleSequence}`;
    const voxelManager = VoxelManager.createImageVoxelManager({
      width,
      height,
      scalarData,
      numberOfComponents: 1,
      id: imageId,
    });

    return {
      imageId,
      intercept: 0,
      windowCenter,
      windowWidth,
      voiLUTFunction: VOILUTFunctionType.LINEAR,
      isPreScaled: false,
      scaling: volume.scaling,
      color: false,
      numberOfComponents: 1,
      dataType: scalarData.constructor.name as PixelDataTypedArrayString,
      slope: 1,
      minPixelValue,
      maxPixelValue,
      rows: height,
      columns: width,
      getCanvas: undefined,
      height,
      width,
      rgba: false,
      columnPixelSpacing,
      rowPixelSpacing,
      FrameOfReferenceUID: volume.metadata?.FrameOfReferenceUID,
      invert: false,
      getPixelData: () => scalarData,
      voxelManager,
      sizeInBytes: scalarData.byteLength,
    } as IImage;
  }
}
