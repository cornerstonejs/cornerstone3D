import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import { vec3 } from 'gl-matrix';
import {
  metaData,
  getRenderingEngines,
  utilities as csUtils,
} from '@cornerstonejs/core';
import { ScaleOverlayAnnotation } from '../types/ToolSpecificAnnotationTypes';
import type { Types } from '@cornerstonejs/core';
import { filterViewportsWithToolEnabled } from '../utilities/viewportFilters';
import { addAnnotation } from '../stateManagement/annotation/annotationState';
import {
  drawLine as drawLineSvg,
  drawTextBox as drawTextBoxSvg,
} from '../drawingSvg';
import {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../types';
import { StyleSpecifier } from '../types/AnnotationStyle';

const SCALEOVERLAYTOOL_ID = 'scaleoverlay-viewport';

/**
 * @public
 * @class ScaleOverlayTool
 * @memberof Tools
 *
 * @classdesc Tool for displaying a scale overlay on the image.
 * @extends Tools.Base.BaseTool
 */
class ScaleOverlayTool extends AnnotationDisplayTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  editData: {
    renderingEngine: any;
    viewport: any;
    annotation: ScaleOverlayAnnotation;
  } | null = {} as any;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {
        viewportId: '',
        scaleLocation: 'bottom',
        scaleColor: 'yellow',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _init = (): void => {
    const renderingEngines = getRenderingEngines();
    const renderingEngine = renderingEngines[0];

    if (!renderingEngine) {
      return;
    }

    let viewports = renderingEngine.getViewports();
    viewports = filterViewportsWithToolEnabled(viewports, this.getToolName());

    let viewport = viewports[0];

    if (this.configuration.viewportId) {
      viewport = viewports.find(
        (viewportId) => viewportId.id === this.configuration.viewportId
      );
    }

    if (!viewport) {
      return;
    }

    const { element } = viewport;
    const { viewUp, viewPlaneNormal } = viewport.getCamera();

    const viewportCanvasCornersInWorld =
      csUtils.getViewportImageCornersInWorld(viewport);

    let annotation = this.editData.annotation;

    if (!annotation) {
      const newAnnotation: ScaleOverlayAnnotation = {
        metadata: {
          toolName: this.getToolName(),
          viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
          viewUp: <Types.Point3>[...viewUp],
          FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
          referencedImageId: null,
        },
        data: {
          handles: {
            points: viewportCanvasCornersInWorld,
          },
        },
      };

      addAnnotation(element, newAnnotation);
      annotation = newAnnotation;
    } else {
      this.editData.annotation.data.handles.points =
        viewportCanvasCornersInWorld;
    }

    this.editData = {
      viewport,
      renderingEngine,
      annotation,
    };
  };

  onSetToolEnabled = (): void => {
    this._init();
  };

  onCameraModified = (evt: Types.EventTypes.CameraModifiedEvent): void => {
    // If the camera is modified, we need to update the viewport
    // that the camera was modified on
    this.configuration.viewportId = evt.target.dataset.viewportUid;
    this._init();
  };

  /**
   * Used to draw the scale annotation in each request animation
   * frame.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   * @returns
   */

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ) {
    if (!this.editData.viewport) {
      return;
    }
    const location = this.configuration.scaleLocation;
    const { annotation, viewport } = this.editData;
    const image = viewport.getImageData();
    const imageId = viewport.getCurrentImageId();
    const canvas = enabledElement.viewport.canvas;

    const renderStatus = false;

    if (!viewport) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    let rowPixelSpacing = image.spacing[0];
    let colPixelSpacing = image.spacing[1];
    const imagePlane = metaData.get('imagePlaneModule', imageId);

    // if imagePlane exists, set row and col pixel spacing
    if (imagePlane) {
      rowPixelSpacing =
        imagePlane.rowPixelSpacing || imagePlane.rowImagePixelSpacing;
      colPixelSpacing =
        imagePlane.columnPixelSpacing || imagePlane.colImagePixelSpacing;
    }

    // Check whether pixel spacing is defined
    if (!rowPixelSpacing || !colPixelSpacing) {
      console.warn(
        `Unable to define rowPixelSpacing or colPixelSpacing from data on ScaleOverlayTool's renderAnnotation`
      );
      return;
    }

    const canvasSize = {
      width: canvas.width,
      height: canvas.height,
    };

    const topLeft = annotation.data.handles.points[0];
    const topRight = annotation.data.handles.points[1];
    const bottomLeft = annotation.data.handles.points[2];
    const bottomRight = annotation.data.handles.points[3];

    const pointSet1 = [topLeft, bottomLeft, topRight, bottomRight];

    const worldWidthViewport = vec3.distance(bottomLeft, bottomRight);
    const worldHeightViewport = vec3.distance(topLeft, bottomLeft);

    // 0.05 gives margin to horizontal and vertical lines
    const hscaleBounds = this.computeScaleBounds(
      canvasSize,
      0.05,
      0.05,
      location
    );

    const vscaleBounds = this.computeScaleBounds(
      canvasSize,
      0.05,
      0.05,
      location
    );

    const scaleSize = this.computeScaleSize(
      worldWidthViewport,
      worldHeightViewport,
      location
    );

    const canvasCoordinates = this.computeWorldScaleCoordinates(
      scaleSize,
      location,
      topRight,
      pointSet1
    ).map((world) => viewport.worldToCanvas(world));

    const scaleCanvasCoordinates = this.computeCanvasScaleCoordinates(
      canvasSize,
      canvasCoordinates,
      vscaleBounds,
      hscaleBounds,
      location
    );

    const scaleTicks = this.computeEndScaleTicks(
      scaleCanvasCoordinates,
      location
    );

    const { annotationUID } = annotation;

    styleSpecifier.annotationUID = annotationUID;
    const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
    const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
    const color = this.getStyle('color', styleSpecifier, annotation);
    const shadow = this.getStyle('shadow', styleSpecifier, annotation);

    const scaleId = `${annotationUID}-scaleline`;
    const scaleLineUID = '1';
    drawLineSvg(
      svgDrawingHelper,
      annotationUID,
      scaleLineUID,
      scaleCanvasCoordinates[0],
      scaleCanvasCoordinates[1],
      {
        color,
        width: lineWidth,
        lineDash,
        shadow,
      },
      scaleId
    );
    const leftTickId = `${annotationUID}-left`;
    const leftTickUID = '2';

    drawLineSvg(
      svgDrawingHelper,
      annotationUID,
      leftTickUID,
      scaleTicks.endTick1[0] as Types.Point2,
      scaleTicks.endTick1[1] as Types.Point2,
      {
        color,
        width: lineWidth,
        lineDash,
        shadow,
      },
      leftTickId
    );
    const rightTickId = `${annotationUID}-right`;
    const rightTickUID = '3';

    drawLineSvg(
      svgDrawingHelper,
      annotationUID,
      rightTickUID,
      scaleTicks.endTick2[0] as Types.Point2,
      scaleTicks.endTick2[1] as Types.Point2,
      {
        color,
        width: lineWidth,
        lineDash,
        shadow,
      },
      rightTickId
    );

    const locationTextOffest = {
      bottom: [-10, -42],
      top: [-12, -35],
      left: [-40, -20],
      right: [-50, -20],
    };

    const textCanvasCoordinates = [
      scaleCanvasCoordinates[0][0] + locationTextOffest[location][0],
      scaleCanvasCoordinates[0][1] + locationTextOffest[location][1],
    ];
    const textBoxLines = this._getTextLines(scaleSize);

    const { tickIds, tickUIDs, tickCoordinates } = this.computeInnerScaleTicks(
      scaleSize,
      location,
      annotationUID,
      scaleTicks.endTick1,
      scaleTicks.endTick2
    );

    // draws inner ticks for scale
    for (let i = 0; i < tickUIDs.length; i++) {
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        tickUIDs[i],
        tickCoordinates[i][0],
        tickCoordinates[i][1],
        {
          color,
          width: lineWidth,
          lineDash,
          shadow,
        },
        tickIds[i]
      );
    }

    const textUID = 'text0';
    drawTextBoxSvg(
      svgDrawingHelper,
      annotationUID,
      textUID,
      textBoxLines,
      [textCanvasCoordinates[0], textCanvasCoordinates[1]],
      {
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        lineDash: '2,3',
        lineWidth: '1',
        shadow: true,
        color: color,
      }
    );

    return renderStatus;
  }

  _getTextLines(scaleSize: number): string[] | undefined {
    let scaleSizeDisplayValue;
    let scaleSizeUnits;
    if (scaleSize >= 50) {
      scaleSizeDisplayValue = scaleSize / 10; //convert to cm
      scaleSizeUnits = ' cm';
    } else {
      scaleSizeDisplayValue = scaleSize; //convert to cm
      scaleSizeUnits = ' mm';
    }

    const textLines = [scaleSizeDisplayValue.toString().concat(scaleSizeUnits)];

    return textLines;
  }

  /**
   *
   * @param worldWidthViewport
   * @returns currentScaleSize
   */
  computeScaleSize = (
    worldWidthViewport: number,
    worldHeightViewport: number,
    location: any
  ) => {
    const scaleSizes = [2000, 1000, 500, 250, 100, 50, 25, 10, 5];
    let currentScaleSize;
    if (location == 'top' || location == 'bottom') {
      currentScaleSize = scaleSizes.filter(
        (scaleSize) =>
          scaleSize < worldWidthViewport * 0.6 &&
          scaleSize > worldWidthViewport * 0.2
      );
    } else {
      currentScaleSize = scaleSizes.filter(
        (scaleSize) =>
          scaleSize < worldHeightViewport * 0.6 &&
          scaleSize > worldHeightViewport * 0.2
      );
    }

    return currentScaleSize[0];
  };

  /**
   *  calculates scale ticks for ends of the scale
   * @param canvasCoordinates
   * @returns leftTick, rightTick
   */
  computeEndScaleTicks = (canvasCoordinates, location) => {
    const locationTickOffset = {
      bottom: [
        [0, -10],
        [0, -10],
      ],
      top: [
        [0, 10],
        [0, 10],
      ],
      left: [
        [0, 0],
        [10, 0],
      ],
      right: [
        [0, 0],
        [-10, 0],
      ],
    };

    const endTick1 = [
      [
        canvasCoordinates[1][0] + locationTickOffset[location][0][0],
        canvasCoordinates[1][1] + locationTickOffset[location][0][0],
      ],
      [
        canvasCoordinates[1][0] + locationTickOffset[location][1][0],
        canvasCoordinates[1][1] + locationTickOffset[location][1][1],
      ],
    ];
    const endTick2 = [
      [
        canvasCoordinates[0][0] + locationTickOffset[location][0][0],
        canvasCoordinates[0][1] + locationTickOffset[location][0][0],
      ],
      [
        canvasCoordinates[0][0] + locationTickOffset[location][1][0],
        canvasCoordinates[0][1] + locationTickOffset[location][1][1],
      ],
    ];

    return {
      endTick1: endTick1,
      endTick2: endTick2,
    };
  };

  computeInnerScaleTicks = (
    scaleSize,
    location,
    annotationUID,
    leftTick,
    rightTick
  ) => {
    let canvasScaleSize;
    if (location == 'bottom' || location == 'top') {
      canvasScaleSize = rightTick[0][0] - leftTick[0][0];
    } else if (location == 'left' || location == 'right') {
      canvasScaleSize = rightTick[0][1] - leftTick[0][1];
    }
    const tickIds = [];
    const tickUIDs = [];
    const tickCoordinates = [];
    let numberSmallTicks = scaleSize;

    if (scaleSize >= 50) {
      numberSmallTicks = scaleSize / 10;
    }

    const tickSpacing = canvasScaleSize / numberSmallTicks;

    for (let i = 0; i < numberSmallTicks - 1; i++) {
      const locationOffset = {
        bottom: [
          [tickSpacing * (i + 1), 0],
          [tickSpacing * (i + 1), 5],
        ],
        top: [
          [tickSpacing * (i + 1), 0],
          [tickSpacing * (i + 1), -5],
        ],
        left: [
          [0, tickSpacing * (i + 1)],
          [-5, tickSpacing * (i + 1)],
        ],
        right: [
          [0, tickSpacing * (i + 1)],
          [5, tickSpacing * (i + 1)],
        ],
      };
      tickIds.push(`${annotationUID}-tick${i}`);
      tickUIDs.push(`tick${i}`);
      if ((i + 1) % 5 == 0) {
        tickCoordinates.push([
          [
            leftTick[0][0] + locationOffset[location][0][0],
            leftTick[0][1] + locationOffset[location][0][1],
          ],
          [
            leftTick[1][0] + locationOffset[location][0][0],
            leftTick[1][1] + locationOffset[location][0][1],
          ],
        ]);
      } else {
        tickCoordinates.push([
          [
            leftTick[0][0] + locationOffset[location][0][0],
            leftTick[0][1] + locationOffset[location][0][1],
          ],
          [
            leftTick[1][0] + locationOffset[location][1][0],
            leftTick[1][1] + locationOffset[location][1][1],
          ],
        ]);
      }
    }

    return { tickIds, tickUIDs, tickCoordinates };
  };

  computeWorldScaleCoordinates = (scaleSize, location, topRight, pointSet) => {
    let worldCoordinates;
    let topBottomVec = vec3.subtract(vec3.create(), pointSet[0], pointSet[1]);
    topBottomVec = vec3.normalize(vec3.create(), topBottomVec) as Types.Point3;

    let topRightVec = vec3.subtract(vec3.create(), pointSet[2], pointSet[0]);
    topRightVec = vec3.normalize(vec3.create(), topRightVec);

    const midpointLocation = {
      bottom: [pointSet[1], pointSet[2]],
      top: [pointSet[0], pointSet[3]],
      right: [pointSet[2], pointSet[3]],
      left: [pointSet[0], pointSet[1]],
    };

    const midpoint = vec3
      .add(
        vec3.create(),
        midpointLocation[location][0],
        midpointLocation[location][0]
      )
      .map((i) => i / 2) as Types.Point3;

    const offset =
      scaleSize /
      2 /
      Math.sqrt(
        Math.pow(topBottomVec[0], 2) +
          Math.pow(topBottomVec[1], 2) +
          Math.pow(topBottomVec[2], 2)
      );

    if (location == 'top' || location == 'bottom') {
      worldCoordinates = [
        vec3.subtract(
          vec3.create(),
          midpoint,
          topRightVec.map((i) => i * offset) as Types.Point3
        ),
        vec3.add(
          vec3.create(),
          midpoint,
          topRightVec.map((i) => i * offset) as Types.Point3
        ),
      ];
    } else if (location == 'left' || location == 'right') {
      worldCoordinates = [
        vec3.add(
          vec3.create(),
          midpoint,
          topBottomVec.map((i) => i * offset) as Types.Point3
        ),
        vec3.subtract(
          vec3.create(),
          midpoint,
          topBottomVec.map((i) => i * offset) as Types.Point3
        ),
      ];
    }

    return worldCoordinates;
  };

  /**
   * Computes the centered canvas coordinates for scale
   * @param canvasSize
   * @param canvasCoordinates
   * @param vscaleBounds
   * @returns scaleCanvasCoordinates
   */
  computeCanvasScaleCoordinates = (
    canvasSize,
    canvasCoordinates,
    vscaleBounds,
    hscaleBounds,
    location
  ) => {
    let scaleCanvasCoordinates;
    if (location == 'top' || location == 'bottom') {
      const worldDistanceOnCanvas =
        canvasCoordinates[0][0] - canvasCoordinates[1][0];
      scaleCanvasCoordinates = [
        [canvasSize.width / 2 - worldDistanceOnCanvas / 2, vscaleBounds.height],
        [canvasSize.width / 2 + worldDistanceOnCanvas / 2, vscaleBounds.height],
      ];
    } else if (location == 'left' || location == 'right') {
      const worldDistanceOnCanvas =
        canvasCoordinates[0][1] - canvasCoordinates[1][1];
      scaleCanvasCoordinates = [
        [hscaleBounds.width, canvasSize.height / 2 - worldDistanceOnCanvas / 2],
        [hscaleBounds.width, canvasSize.height / 2 + worldDistanceOnCanvas / 2],
      ];
    }

    return scaleCanvasCoordinates;
  };

  /**
   * Computes the max bound for scales on the image
   * @param  {{width: number, height: number}} canvasSize
   * @param  {number} horizontalReduction
   * @param  {number} verticalReduction
   * @returns {Object.<string, { x:number, y:number }>}
   */
  computeScaleBounds = (
    canvasSize,
    horizontalReduction,
    verticalReduction,
    location
  ) => {
    const hReduction = horizontalReduction * Math.min(1000, canvasSize.width);
    const vReduction = verticalReduction * Math.min(1000, canvasSize.height);
    const locationBounds = {
      bottom: [-vReduction, -hReduction],
      top: [vReduction, hReduction],
      left: [vReduction, hReduction],
      right: [-vReduction, -hReduction],
    };
    const canvasBounds = {
      bottom: [canvasSize.height, canvasSize.width],
      top: [0, canvasSize.width],
      left: [canvasSize.height, 0],
      right: [canvasSize.height, canvasSize.width],
    };

    return {
      height: canvasBounds[location][0] + locationBounds[location][0],
      width: canvasBounds[location][1] + locationBounds[location][1],
    };
  };
}

ScaleOverlayTool.toolName = 'ScaleOverlay';
export default ScaleOverlayTool;
