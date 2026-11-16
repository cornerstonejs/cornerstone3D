import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec2, vec3 } from 'gl-matrix';
import type { ReadonlyVec3 } from 'gl-matrix';
import type { ICamera, Point2, Point3 } from '../../../types';
import type DisplayArea from '../../../types/displayArea';
import type { PlanarDisplayArea } from '../Planar/PlanarViewportTypes';
import { getVolume3DInsetImageMultiplier } from './vtkVolume3DInitialCamera';
import type { Volume3DCamera } from './viewport3DTypes';

/** What a display area needs of a 3D viewport. @internal */
export interface Volume3DDisplayAreaViewport {
  sWidth: number;
  sHeight: number;
  canvas: HTMLCanvasElement;
  worldToCanvas(worldPos: Point3): Point2;
  getViewState(): ICamera;
  setViewState(viewStatePatch: Partial<Volume3DCamera>): void;
  getZoom(compareCamera?: ICamera): number;
  setZoom(
    value: number,
    storeAsInitialCamera?: boolean,
    compareCamera?: ICamera
  ): void;
  getPan(): Point2;
  setPan(pan: Point2, storeAsInitialCamera?: boolean): void;
}

/**
 * The display area of the options of a next viewport as a 3D viewport reads
 * it: a scale given as a point, as the planar viewport takes it, gives its
 * vertical scale, which the `SCALE` area uses.
 *
 * @internal
 */
export function toVolume3DDisplayArea(
  displayArea?: DisplayArea | PlanarDisplayArea
): DisplayArea | undefined {
  if (!displayArea || !Array.isArray(displayArea.scale)) {
    return displayArea as DisplayArea | undefined;
  }

  return { ...displayArea, scale: displayArea.scale[1] };
}

/**
 * Moves the camera of a 3D viewport to a display area, as the legacy
 * `setDisplayArea` does from the fit to canvas camera, without its events:
 * a `SCALE` area sets the parallel scale for its pixel scale, then both
 * types fit the image area and put the image point on the canvas point.
 *
 * @param viewport - The viewport, at the fit camera.
 * @param imageData - The image data of the volume that the area measures.
 * @param displayArea - The display area.
 * @param baseCamera - The fit camera, which the zoom is relative to.
 *
 * @internal
 */
export function applyVolume3DDisplayArea(
  viewport: Volume3DDisplayAreaViewport,
  imageData: vtkImageData,
  displayArea: DisplayArea,
  baseCamera: ICamera
): void {
  if (displayArea.type === 'SCALE') {
    applyVolume3DDisplayAreaScale(viewport, imageData, displayArea, baseCamera);

    return;
  }

  applyVolume3DDisplayAreaFit(viewport, imageData, displayArea, baseCamera);
}

/**
 * The `SCALE` display area of the legacy `setDisplayAreaScale`: one image
 * pixel on `scale` canvas pixels, the pan of the area, and the focal point
 * moved half a pixel on an odd canvas size.
 */
function applyVolume3DDisplayAreaScale(
  viewport: Volume3DDisplayAreaViewport,
  imageData: vtkImageData,
  displayArea: DisplayArea,
  baseCamera: ICamera
): void {
  const { scale = 1 } = displayArea;
  const width = viewport.sWidth || viewport.canvas.width;
  const height = viewport.sHeight || viewport.canvas.height;

  if (height < 8 || width < 8) {
    return;
  }

  const spacing = imageData.getSpacing()[1];

  viewport.setViewState({ parallelScale: (height * spacing) / (2 * scale) });
  applyVolume3DDisplayAreaFit(
    viewport,
    imageData,
    { ...displayArea, imageArea: undefined },
    baseCamera
  );

  const { focalPoint, position, viewUp, viewPlaneNormal } =
    viewport.getViewState();
  const focalChange = vec3.create();

  if (height % 2) {
    vec3.scaleAndAdd(focalChange, focalChange, viewUp, scale * 0.5 * spacing);
  }

  if (width % 2) {
    const viewRight = vec3.cross(vec3.create(), viewUp, viewPlaneNormal);

    vec3.scaleAndAdd(
      focalChange,
      focalChange,
      viewRight,
      scale * 0.5 * spacing
    );
  }

  if (!focalChange[0] && !focalChange[1] && !focalChange[2]) {
    return;
  }

  viewport.setViewState({
    focalPoint: vec3.add(vec3.create(), focalPoint, focalChange) as Point3,
    position: vec3.add(vec3.create(), position, focalChange) as Point3,
  });
}

/**
 * The fit of the legacy `setDisplayAreaFit`: the zoom against the fit camera
 * that shows both fractions of the image area, then the pan that puts the
 * image point of the area on its canvas point.
 */
function applyVolume3DDisplayAreaFit(
  viewport: Volume3DDisplayAreaViewport,
  imageData: vtkImageData,
  displayArea: DisplayArea,
  baseCamera: ICamera
): void {
  const { imageArea, imageCanvasPoint } = displayArea;
  const insetImageMultiplier = getVolume3DInsetImageMultiplier();
  const devicePixelRatio = window?.devicePixelRatio || 1;
  const canvasWidth = viewport.sWidth / devicePixelRatio;
  const canvasHeight = viewport.sHeight / devicePixelRatio;
  const dimensions = imageData.getDimensions() as ReadonlyVec3;
  const canvasZero = viewport.worldToCanvas(
    imageData.indexToWorld([0, 0, 0]) as Point3
  );
  const canvasEdge = viewport.worldToCanvas(
    imageData.indexToWorld([
      dimensions[0],
      dimensions[1],
      dimensions[2],
    ]) as Point3
  );
  const imgWidth = Math.abs(canvasEdge[0] - canvasZero[0]);
  const imgHeight = Math.abs(canvasEdge[1] - canvasZero[1]);
  const baseZoom = viewport.getZoom(baseCamera);

  if (!Number.isFinite(baseZoom) || baseZoom <= 0) {
    return;
  }

  let zoom = baseZoom / insetImageMultiplier;

  if (imageArea) {
    const [areaX, areaY] = imageArea;
    const currentScale = Math.max(
      Math.abs(imgWidth / canvasWidth),
      Math.abs(imgHeight / canvasHeight)
    );
    const requireX = Math.abs((areaX * imgWidth) / canvasWidth);
    const requireY = Math.abs((areaY * imgHeight) / canvasHeight);
    const absZoom =
      requireX > requireY ? currentScale / requireX : currentScale / requireY;

    zoom = absZoom * baseZoom;
    viewport.setZoom(insetImageMultiplier * zoom, false, baseCamera);
  }

  if (!imageCanvasPoint) {
    return;
  }

  const { imagePoint, canvasPoint = imagePoint || [0.5, 0.5] } =
    imageCanvasPoint;
  const [canvasX, canvasY] = canvasPoint;
  const [imageX, imageY] = imagePoint || canvasPoint;
  const useZoom = (insetImageMultiplier * zoom) / baseZoom;
  const pan: Point2 = [
    useZoom * imgWidth * (0.5 - imageX) + canvasWidth * (canvasX - 0.5),
    useZoom * imgHeight * (0.5 - imageY) + canvasHeight * (canvasY - 0.5),
  ];

  vec2.add(pan, pan, viewport.getPan());
  viewport.setPan(pan, false);
}
