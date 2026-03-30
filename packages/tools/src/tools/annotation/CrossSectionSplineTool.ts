import { drawing, SplineROITool } from '@cornerstonejs/tools';
import { vec3 } from 'gl-matrix';
import { getAnnotations } from '../../stateManagement';
import type { PublicToolProps, ToolProps } from '../../types';

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

    // 2. Lógica de cálculo do ponto de perpendicular desejado
    const pointIndex = this.getPerpendicularIndex(polyline);
    if (pointIndex === null) {
      return;
    }

    this.configuration.calculatedIndex = pointIndex;

    const centerPoint = polyline[pointIndex];
    const prevPoint = polyline[pointIndex - 1];
    const nextPoint = polyline[pointIndex + 1];

    // Vetor tangente à curva no ponto desejado
    const tangent = vec3.subtract(vec3.create(), nextPoint, prevPoint);
    const camera = viewport.getCamera();
    const { viewPlaneNormal } = camera;

    if (viewPlaneNormal) {
      // Vetor normal à tangente e ao plano da câmera (Perpendicular)
      const normal = vec3.cross(vec3.create(), viewPlaneNormal, tangent);
      vec3.normalize(normal, normal);

      const halfLength =
        typeof this.configuration?.halfLength === 'number'
          ? this.configuration.halfLength
          : 50; // Tamanho padrão da linha

      // Pontos extremos da linha de cross-section em coordenadas de mundo
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

      // Conversão para Canvas
      const p1Canvas = viewport.worldToCanvas(p1);
      const p2Canvas = viewport.worldToCanvas(p2);

      // 3. Desenho no SVG
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
   * Esta função é chamada durante o ciclo de renderização do Cornerstone.
   */
  protected renderAnnotationInstance(renderContext): boolean {
    const { enabledElement, svgDrawingHelper } = renderContext;
    const rendered = super.renderAnnotationInstance(renderContext);
    if (!rendered) {
      return rendered;
    }
    const { viewport } = enabledElement;

    // 1. Buscar as anotações da ferramenta alvo (ex: PlanarFreehandROITool ou SplineROI)
    // Aqui você deve passar o nome da ferramenta que gerou a spline
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
