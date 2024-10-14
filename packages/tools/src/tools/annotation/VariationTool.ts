import { vec3 } from 'gl-matrix';
import { getEnabledElement, Types, Enums } from '@cornerstonejs/core';
import { getActiveSegmentationRepresentation } from '../../stateManagement/segmentation/activeSegmentation';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/segmentIndex';
import { getColorForSegmentIndex } from '../../stateManagement/segmentation/config/segmentationColor';
import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import { getAnnotation } from '../../stateManagement';
import { drawCircle, drawPolyline } from '../../drawingSvg';
import getSvgDrawingHelper from '../../drawingSvg/getSvgDrawingHelper';
import { Events } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { triggerAnnotationRenderForViewportIds } from '../../utilities/triggerAnnotationRenderForViewportIds';
import BaseTool from '../base/BaseTool';
import {
  PublicToolProps,
  EventTypes,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';

class VariationTool extends BaseTool {
  static toolName: string;
  private hoverTimer: ReturnType<typeof setTimeout> | null;
  editData: {
    segmentationId: string;
    planeContours: any;
    viewport: Types.IVolumeViewport | Types.IStackViewport;
  } | null;
  private _hoverData?: {
    brushCursor: any;
    segmentationId: string;
    segmentIndex: number;
    segmentationRepresentationUID: string;
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    centerCanvas?: Types.Point2;
  };

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        radius: 25,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.hoverTimer = null;
  }
  onSetToolPassive = () => {
    this.disableCursor();
  };

  onSetToolEnabled = () => {
    this.disableCursor();
  };

  onSetToolDisabled = () => {
    this.disableCursor();
  };

  private disableCursor() {
    this._hoverData = undefined;
  }

  preMouseDownCallback = (
    evt: EventTypes.MouseDownActivateEventType
  ): boolean => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    this._activateDraw(element);
    if (!this.editData) {
      return true;
    }
    const planeContours = this.getPlaneContours().map((f: any) => {
      return {
        annotationUID: f.annotationUID,
        contour: f.data.contour.polyline,
      };
    });
    for (let i = 0; i < planeContours.length; i++) {
      const { contour } = planeContours[i];
      const newPolyline = JSON.parse(JSON.stringify(contour));
      for (let index = 0, num = contour.length; index < num; index++) {
        const point1 = viewport.worldToCanvas(
          contour[index == contour.length - 1 ? 0 : index + 1]
        );
        const point2 = viewport.worldToCanvas(contour[index]);
        const intersection = this.circleLineIntersection(
          point1[0],
          point1[1],
          point2[0],
          point2[1],
          currentPoints.canvas[0],
          currentPoints.canvas[1],
          this.configuration.radius
        );
        const interPoint = intersection.map((ele: Types.Point2) =>
          viewport.canvasToWorld(ele).map((c) => Number(c.toFixed(2)))
        );
        const newindex = newPolyline.findIndex(
          (f: Types.Point3) =>
            JSON.stringify(f) == JSON.stringify(contour[index])
        );
        newPolyline.splice(newindex + 1, 0, ...interPoint);
      }
      planeContours[i].contour = newPolyline;
    }
    this.editData.planeContours = planeContours;
    return true;
  };

  _activateDraw = (element: HTMLDivElement): void => {
    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
  };

  _deactivateDraw = (element: HTMLDivElement): void => {
    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
  };

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    this.editData = null;
    this.updateCursor(evt);
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
    }
    this.hoverTimer = setTimeout(() => {
      const activeSegmentationReps = getActiveSegmentationRepresentation(
        this.toolGroupId
      );
      if (!activeSegmentationReps) {
        throw new Error(
          'No active segmentation detected, create one before using scissors tool'
        );
      }
      const { segmentationId } = activeSegmentationReps;
      this.editData = {
        segmentationId,
        planeContours: [],
        viewport,
      };
      this.hoverTimer = null;
    }, this.configuration.hoverTimeout);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    if (!this.editData) {
      return;
    }
    const eventData = evt.detail;
    const { element, currentPoints, startPoints } = eventData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { renderingEngine } = enabledElement;
    this.updateCursor(evt);
    this._triggerAnnotationRender(viewport);

    this.deformShape(this.configuration.radius, {
      currentPoint: currentPoints.world,
      startPoint: startPoints.world,
    });
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  private deformShape(sigma: number, parameters: any) {
    const { planeContours } = this.editData;
    const { currentPoint, startPoint } = parameters;
    const directionVector_ = vec3.subtract(
      vec3.create(),
      currentPoint,
      startPoint
    );
    const directionVector_value = vec3.length(directionVector_);
    if (directionVector_value < 0.001) {
      return;
    }
    const sigmaSquared_ = sigma * sigma;

    const deformationThreshold_ =
      sigmaSquared_ * (Math.log(directionVector_value) - Math.log(0.001));
    for (let i = 0, num = planeContours.length; i < num; i++) {
      const newPolyline = [] as Types.Point3[];
      const { annotationUID, contour } = planeContours[i];
      let lastPoint = contour[0];

      for (let j = 0, len = contour.length; j < len; j++) {
        const point = contour[j];
        let curentToStartVector = vec3.subtract(
          vec3.create(),
          point,
          startPoint
        );
        let vecDistance =
          curentToStartVector[0] * curentToStartVector[0] +
          curentToStartVector[1] * curentToStartVector[1] +
          curentToStartVector[2] * curentToStartVector[2];
        const newPoint = JSON.parse(JSON.stringify(point));
        if (vecDistance < deformationThreshold_) {
          let scaleValue = Math.exp(-vecDistance / sigmaSquared_);
          const offset = [
            directionVector_[0] * scaleValue,
            directionVector_[1] * scaleValue,
            directionVector_[2] * scaleValue,
          ];
          newPoint[0] = point[0] + offset[0];
          newPoint[1] = point[1] + offset[1];
          newPoint[2] = point[2] + offset[2];

          const currentToLastDistanceValue = vec3.squaredDistance(
            newPoint,
            lastPoint
          );
          if (j > 0 && currentToLastDistanceValue > 0.04000000000000001) {
            const intersectionNum = Math.floor(
              this.numericallyStableCeiling(
                6,
                Math.sqrt(currentToLastDistanceValue) / 0.2
              ) - 1
            );
            for (let k = 0; k < intersectionNum; k++) {
              const num8 = (k + 1.0) / (intersectionNum + 1.0);
              const point8 = [
                contour[j - 1][0] + (contour[j][0] - contour[j - 1][0]) * num8,
                contour[j - 1][1] + (contour[j][1] - contour[j - 1][1]) * num8,
                contour[j - 1][2] + (contour[j][2] - contour[j - 1][2]) * num8,
              ] as Types.Point3;
              curentToStartVector = vec3.subtract(
                vec3.create(),
                point8,
                startPoint
              );
              vecDistance =
                curentToStartVector[0] * curentToStartVector[0] +
                curentToStartVector[1] * curentToStartVector[1] +
                curentToStartVector[2] * curentToStartVector[2];
              scaleValue = Math.exp(-vecDistance / sigmaSquared_);
              const offset = [
                directionVector_[0] * scaleValue,
                directionVector_[1] * scaleValue,
                directionVector_[2] * scaleValue,
              ];
              const interPoint = JSON.parse(JSON.stringify(point8));
              interPoint[0] = point8[0] + offset[0];
              interPoint[1] = point8[1] + offset[1];
              interPoint[2] = point8[2] + offset[2];
              newPolyline.push(interPoint);
            }
          }
        }
        newPolyline.push(newPoint);
        lastPoint = newPoint;
      }
      const element = getAnnotation(annotationUID);
      element.data.contour.polyline = newPolyline;
    }
  }

  private numericallyStableCeiling(n: number, d: number) {
    const tenPowCache_ = [
      1.0, 10.0, 100.0, 1000.0, 10000.0, 100000.0, 1000000.0, 10000000.0,
      100000000.0, 1000000000.0,
    ];
    const tenPowNegCache_ = [
      1.0, 0.1, 0.01, 0.001, 0.0001, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10,
    ];
    let num;
    let num2;
    if (n >= 1 && n < tenPowCache_.length) {
      num = tenPowCache_[n];
      num2 = tenPowNegCache_[n + 1];
    } else {
      num = Math.pow(10.0, n);
      num2 = Math.pow(10.0, -(n + 1));
    }

    return Math.ceil(Math.round(d * num) / num - num2);
  }

  private getPlaneContours() {
    const { segmentationId, viewport } = this.editData;
    const currentImageIndex = viewport.getCurrentImageIdIndex();
    let sliceIndex = currentImageIndex + 1;
    const org = viewport.defaultOptions.orientation;
    const img = viewport.getImageData();
    if (org == Enums.OrientationAxis.SAGITTAL) {
      sliceIndex = img.dimensions[0] - currentImageIndex;
    }
    const segmentations = getSegmentation(segmentationId);
    const { annotationUIDsMap } = segmentations.representationData.CONTOUR;
    const planeContours = [] as any;
    for (const [_, annotationUIDs] of annotationUIDsMap.entries()) {
      Array.from(annotationUIDs).forEach((annotationUID) => {
        const currentAnnotation = getAnnotation(annotationUID);
        if (
          currentAnnotation.metadata.sliceIndex == sliceIndex &&
          currentAnnotation.data.orientation ==
            viewport.defaultOptions.orientation
        ) {
          planeContours.push(currentAnnotation);
        }
      });
    }
    return planeContours;
  }

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    this._deactivateDraw(element);
  };

  _triggerAnnotationRender(
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ) {
    const { element } = viewport;
    const enabledElement = getEnabledElement(element);
    const svgDrawingHelper = getSvgDrawingHelper(element);
    this.renderAnnotation(enabledElement, svgDrawingHelper);
  }

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): void {
    if (!this._hoverData) {
      return;
    }
    const { viewport } = enabledElement;
    const viewportIdsToRender = this._hoverData?.viewportIdsToRender;
    if (!viewportIdsToRender.includes(viewport.id)) {
      return;
    }
    const brushCursor = this._hoverData?.brushCursor;
    const { centerCanvas } = this._hoverData;
    if (brushCursor.data.invalidated === true) {
      const { element } = viewport;
      this._calculateCursor(element, centerCanvas);
    }
    const toolMetadata = brushCursor.metadata;
    const annotationUID = toolMetadata.brushCursorUID;

    const data = brushCursor.data;
    const { points } = data.handles;
    const canvasCoordinates = points.map((p: any) => viewport.worldToCanvas(p));
    const bottom = canvasCoordinates[0];
    const top = canvasCoordinates[1];
    const center = [
      Math.floor((bottom[0] + top[0]) / 2),
      Math.floor((bottom[1] + top[1]) / 2),
    ];
    const radius = Math.abs(bottom[1] - Math.floor((bottom[1] + top[1]) / 2));
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return;
    }
    const circleUID = '0';
    drawCircle(
      svgDrawingHelper,
      annotationUID,
      circleUID,
      center as Types.Point2,
      radius,
      {
        color: 'white',
        lineDash: [4, 4],
      }
    );
    const centerUID = '1';
    const size = 6;
    const centerPoly = [
      [center[0] - size, center[1]],
      [center[0], center[1] + size],
      [center[0] + size, center[1]],
      [center[0], center[1] - size],
      [center[0] - size, center[1]],
    ] as Types.Point2[];
    drawPolyline(svgDrawingHelper, centerUID, 'preview', centerPoly, {
      color: 'white',
      width: 1,
    });
  }

  invalidateCursor() {
    if (this._hoverData !== undefined) {
      const { data } = this._hoverData.brushCursor;
      data.invalidated = true;
    }
  }

  updateCursor(evt: EventTypes.InteractionEventType) {
    const eventData = evt.detail;
    const { element } = eventData;
    const { currentPoints } = eventData;
    const centerCanvas = currentPoints.canvas;
    this._hoverData = this.createHoverData(element, centerCanvas);
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this._calculateCursor(element, centerCanvas);
    if (!this._hoverData) {
      return;
    }
    this._triggerAnnotationRender(viewport);
  }

  createHoverData(element: any, centerCanvas: any) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      console.warn(
        'No active segmentation detected, create one before using the brush tool'
      );
      return;
    }

    const { segmentationRepresentationUID, segmentationId } =
      activeSegmentationRepresentation;
    const segmentIndex = getActiveSegmentIndex(segmentationId);

    const segmentColor = getColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      1
    );

    const viewportIdsToRender = [viewport.id];

    // Center of circle in canvas Coordinates

    const brushCursor = {
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.getToolName(),
        segmentColor,
      },
      data: {},
    };

    return {
      brushCursor,
      centerCanvas,
      segmentIndex,
      segmentationId,
      segmentationRepresentationUID,
      segmentColor,
      viewportIdsToRender,
    };
  }

  _calculateCursor(element: any, centerCanvas?: any) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { canvasToWorld } = viewport;
    const camera = viewport.getCamera();
    const { radius } = this.configuration;

    const viewUp = vec3.fromValues(
      camera.viewUp[0],
      camera.viewUp[1],
      camera.viewUp[2]
    );
    const viewPlaneNormal = vec3.fromValues(
      camera.viewPlaneNormal[0],
      camera.viewPlaneNormal[1],
      camera.viewPlaneNormal[2]
    );
    const viewRight = vec3.create();

    vec3.cross(viewRight, viewUp, viewPlaneNormal);

    // in the world coordinate system, the brushSize is the radius of the circle
    // in mm
    const centerCursorInWorld: Types.Point3 = canvasToWorld([
      centerCanvas[0],
      centerCanvas[1],
    ]);

    const bottomCursorInWorld = vec3.create();
    const topCursorInWorld = vec3.create();
    const leftCursorInWorld = vec3.create();
    const rightCursorInWorld = vec3.create();

    // Calculate the bottom and top points of the circle in world coordinates
    for (let i = 0; i <= 2; i++) {
      bottomCursorInWorld[i] = centerCursorInWorld[i] - viewUp[i] * radius;
      topCursorInWorld[i] = centerCursorInWorld[i] + viewUp[i] * radius;
      leftCursorInWorld[i] = centerCursorInWorld[i] - viewRight[i] * radius;
      rightCursorInWorld[i] = centerCursorInWorld[i] + viewRight[i] * radius;
    }
    const { brushCursor } = this._hoverData;
    const { data } = brushCursor;
    if (data.handles === undefined) {
      data.handles = {};
    }
    data.handles.points = [
      bottomCursorInWorld,
      topCursorInWorld,
      leftCursorInWorld,
      rightCursorInWorld,
    ];
    data.invalidated = false;
  }

  getSegmentationId() {
    const { segmentationId } = this.editData;
    return segmentationId;
  }

  private circleLineIntersection(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    r: number
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;

    const A = dx * dx + dy * dy;
    const B = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
    const C =
      cx * cx + cy * cy + x1 * x1 + y1 * y1 - 2 * (cx * x1 + cy * y1) - r * r;

    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) {
      return [];
    }
    const result = [] as Types.Point2[];

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const t1 = (-B + sqrtDiscriminant) / (2 * A);
    const t2 = (-B - sqrtDiscriminant) / (2 * A);

    if (t1 >= 0 && t1 <= 1) {
      result.push([x1 + t1 * dx, y1 + t1 * dy]);
    }
    if (t2 >= 0 && t2 <= 1) {
      result.push([x1 + t2 * dx, y1 + t2 * dy]);
    }
    return result;
  }
}

VariationTool.toolName = 'VariationTool';
export default VariationTool;
