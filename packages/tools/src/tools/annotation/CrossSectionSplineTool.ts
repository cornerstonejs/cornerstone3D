import { vec3 } from 'gl-matrix';
import { getAnnotations } from '../../stateManagement';
import type { PublicToolProps, ToolProps } from '../../types';
import SplineROITool from './SplineROITool';
import { drawing } from '../..';

const { drawLine: drawLineSvg } = drawing;

class CrossSectionSplineTool extends SplineROITool {
  static toolName = 'CrossSectionSpline';

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    super(toolProps, defaultToolProps);
    this.configuration.allowOpenSplines = true;
    if (!this.configuration?.halfLength) {
      this.configuration.halfLength = 50;
    }
    this.configuration.spline.type = SplineROITool.SplineTypes.CatmullRom;
  }

  getPerpendicularIndex(polyline) {
    if (!polyline || polyline.length < 3) {
      return null;
    }

    const configuredIdx = this.configuration?.perpendicularIndex;
    const defaultIdx = Math.floor(polyline.length / 2);

    let index = Number.isInteger(configuredIdx) ? configuredIdx : defaultIdx;

    index = Math.max(1, Math.min(index, polyline.length - 2));

    return index;
  }

  setPerpendicularIndex(index: number) {
    if (typeof index !== 'number' || Number.isNaN(index)) {
      return;
    }

    this.configuration = {
      ...this.configuration,
      perpendicularIndex: Math.floor(index),
    };
  }

  drawPerpendicularLine(svgDrawingHelper, viewport, annotation) {
    const { polyline } = annotation.data.contour;
    if (!polyline || polyline.length < 3) {
      return;
    }

    // Calculate the desired perpendicular point on the spline
    const pointIndex = this.getPerpendicularIndex(polyline);
    if (pointIndex === null) {
      return;
    }

    this.configuration.calculatedIndex = pointIndex;

    const centerPoint = polyline[pointIndex];
    const prevPoint = polyline[pointIndex - 1];
    const nextPoint = polyline[pointIndex + 1];

    // Tangent vector of the curve at the selected point
    const tangent = vec3.subtract(vec3.create(), nextPoint, prevPoint);
    const camera = viewport.getCamera();
    const { viewPlaneNormal } = camera;

    if (viewPlaneNormal) {
      // Normal vector perpendicular to both the view plane and the tangent
      const normal = vec3.cross(vec3.create(), viewPlaneNormal, tangent);
      vec3.normalize(normal, normal);

      const halfLength =
        typeof this.configuration?.halfLength === 'number'
          ? this.configuration.halfLength
          : 50; // Default cross-section half-length

      // Endpoints of the cross-section line in world coordinates
      const p1 = vec3.scaleAndAdd(
        vec3.create(),
        centerPoint,
        normal,
        halfLength
      );
      const p2 = vec3.scaleAndAdd(
        vec3.create(),
        centerPoint,
        normal,
        -halfLength
      );

      // Convert world coordinates to canvas coordinates
      const p1Canvas = viewport.worldToCanvas(p1);
      const p2Canvas = viewport.worldToCanvas(p2);

      // Draw the line in SVG
      const lineUID = `${annotation.annotationUID}-cross-section`;

      drawLineSvg(
        svgDrawingHelper,
        annotation.annotationUID,
        lineUID,
        p1Canvas,
        p2Canvas,
        {
          color: 'red',
          lineWidth: '2',
        }
      );
    }
  }
  /**
   * This function is called during the Cornerstone render cycle.
   */
  protected renderAnnotationInstance(renderContext): boolean {
    const { enabledElement, svgDrawingHelper } = renderContext;
    const rendered = super.renderAnnotationInstance(renderContext);
    if (!rendered) {
      return rendered;
    }
    const { viewport } = enabledElement;

    // Use the name of the tool that created the spline here
    const annotations =
      getAnnotations(CrossSectionSplineTool.toolName, viewport.element) || [];

    if (!annotations?.length) {
      return false;
    }

    const lastAnnotation = annotations[annotations.length - 1];
    this.drawPerpendicularLine(svgDrawingHelper, viewport, lastAnnotation);
    return true;
  }
}

export default CrossSectionSplineTool;
