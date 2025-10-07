import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

export interface LensOverlayConfig {
  enabled: boolean;
  radius: number;
  zoomFactor: number;
  borderWidth: number;
  borderColor: string;
  showCrosshair: boolean;
}

export class LensOverlay {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private visible: boolean = false;
  private currentMousePosition: Types.Point2 | null = null;
  private animationFrame: number | null = null;
  private currentElement: HTMLDivElement | null = null;
  private config: LensOverlayConfig;

  constructor(config: LensOverlayConfig) {
    this.config = config;
  }

  public updateMousePosition(position: Types.Point2 | null): void {
    this.currentMousePosition = position;
  }

  public show(element: HTMLDivElement): void {
    if (this.visible) {
      return;
    }

    this.currentElement = element;
    this.initializeCanvas(element);
    this.visible = true;
    this.scheduleRender();
  }

  public hide(): void {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    this.cancelAnimationFrame();

    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
      this.canvas = null;
      this.context = null;
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public updateConfig(config: Partial<LensOverlayConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private initializeCanvas(element: HTMLDivElement): void {
    if (this.canvas) {
      return;
    }

    const { radius } = this.config;
    const canvasSize = radius * 2;

    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasSize;
    this.canvas.height = canvasSize;
    this.canvas.style.cssText = `
      position: absolute;
      width: ${canvasSize}px;
      height: ${canvasSize}px;
      pointer-events: none;
      z-index: 1000;
      display: block;
    `;

    this.context = this.canvas.getContext('2d');

    const viewportElement = element.querySelector('.viewport-element');
    if (viewportElement) {
      viewportElement.appendChild(this.canvas);
    }
  }

  private scheduleRender(): void {
    if (typeof window === 'undefined' || !this.visible) {
      return;
    }

    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
    }

    const render = () => {
      this.animationFrame = null;

      if (!this.visible) {
        return;
      }

      this.render();

      // Continue animation frame loop
      if (this.visible) {
        this.animationFrame = window.requestAnimationFrame(render);
      }
    };

    this.animationFrame = window.requestAnimationFrame(render);
  }

  private cancelAnimationFrame(): void {
    if (typeof window !== 'undefined' && this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private render(): void {
    if (!this.canvas || !this.context || !this.currentMousePosition) {
      return;
    }

    const { radius, zoomFactor, borderWidth, borderColor } = this.config;
    const [mouseX, mouseY] = this.currentMousePosition;

    // Canvas leeren
    this.context.clearRect(0, 0, radius * 2, radius * 2);

    // Clipping-Pfad für runde Lupe
    this.context.save();
    this.context.beginPath();
    this.context.arc(radius, radius, radius, 0, 2 * Math.PI);
    this.context.clip();

    // Bildausschnitt zeichnen
    this.drawMagnifiedRegion(mouseX, mouseY, radius, zoomFactor);

    this.context.restore();

    // Rahmen und Hilfslinien zeichnen
    this.drawOverlay(radius, borderWidth, borderColor);

    // Positionierung der Lupe
    this.positionLens(mouseX, mouseY, radius);
  }

  private drawMagnifiedRegion(
    centerX: number,
    centerY: number,
    radius: number,
    zoomFactor: number
  ): void {
    if (!this.currentElement) return;

    const enabledElement = getEnabledElement(this.currentElement);
    if (!enabledElement) return;

    const { viewport } = enabledElement;
    const sourceCanvas = viewport.getCanvas();

    // Berücksichtige devicePixelRatio für korrekte Koordinaten
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Canvas-Dimensionen für Grenzprüfung
    const canvasWidth = sourceCanvas.width;
    const canvasHeight = sourceCanvas.height;

    // Die tatsächliche CSS-Größe des Canvas
    const canvasRect = sourceCanvas.getBoundingClientRect();
    const cssToCanvasScaleX = canvasWidth / canvasRect.width;
    const cssToCanvasScaleY = canvasHeight / canvasRect.height;

    // Transformiere CSS-Koordinaten in Canvas-Koordinaten
    const canvasCenterX = centerX * cssToCanvasScaleX;
    const canvasCenterY = centerY * cssToCanvasScaleY;

    const sourceSize = (radius / zoomFactor) * cssToCanvasScaleX; // Verwende X-Skala für beide Dimensionen für Konsistenz
    const destSize = radius * 2;

    // Berechne den Quellbereich um die Mausposition zentriert
    let srcX = canvasCenterX - sourceSize;
    let srcY = canvasCenterY - sourceSize;
    let srcWidth = sourceSize * 2;
    let srcHeight = sourceSize * 2;

    // Stelle sicher, dass der Quellbereich innerhalb des Canvas bleibt
    if (srcX < 0) {
      srcWidth += srcX; // Reduziere Breite um den negativen Offset
      srcX = 0;
    }
    if (srcY < 0) {
      srcHeight += srcY; // Reduziere Höhe um den negativen Offset
      srcY = 0;
    }
    if (srcX + srcWidth > canvasWidth) {
      srcWidth = canvasWidth - srcX;
    }
    if (srcY + srcHeight > canvasHeight) {
      srcHeight = canvasHeight - srcY;
    }

    // Nur zeichnen, wenn der Quellbereich gültig ist
    if (srcWidth > 0 && srcHeight > 0) {
      this.context?.drawImage(
        sourceCanvas,
        srcX, // Quell-X
        srcY, // Quell-Y
        srcWidth, // Quell-Breite
        srcHeight, // Quell-Höhe
        0, // Ziel-X
        0, // Ziel-Y
        destSize, // Ziel-Breite
        destSize // Ziel-Höhe
      );
    }
  }

  private drawOverlay(
    radius: number,
    borderWidth: number,
    borderColor: string
  ): void {
    if (!this.context) return;

    // Rahmen zeichnen (2px dick)
    this.context.strokeStyle = borderColor;
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(radius, radius, radius - 1, 0, 2 * Math.PI);
    this.context.stroke();

    // 4x4 Pixel großen Punkt in der Mitte zeichnen
    this.context.fillStyle = '#EC6602';
    this.context.fillRect(radius - 2, radius - 2, 4, 4);
  }

  private positionLens(mouseX: number, mouseY: number, radius: number): void {
    if (!this.canvas) return;

    // Positionierung oberhalb und rechts der Maus, um nicht die Sicht zu blockieren
    const offset = 20;
    const viewportRect = this.canvas.parentElement?.getBoundingClientRect();

    if (viewportRect) {
      let posX = mouseX + offset;
      let posY = mouseY - radius - offset;

      // Sicherstellen, dass die Lupe innerhalb des Viewports bleibt
      if (posX + radius * 2 > viewportRect.width) {
        posX = mouseX - radius * 2 - offset;
      }

      if (posY < 0) {
        posY = mouseY + offset;
      }

      this.canvas.style.left = `${posX}px`;
      this.canvas.style.top = `${posY}px`;
    }
  }
}
