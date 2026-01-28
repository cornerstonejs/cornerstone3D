import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { Types } from '@cornerstonejs/core';
import vtkAnnotatedRhombicuboctahedronActor from '../AnnotatedRhombicuboctahedronActor';

export interface OrientationControllerConfig {
  faceColors: {
    topBottom: number[];
    frontBack: number[];
    leftRight: number[];
  };
  letterColors: {
    zMinus: number[];
    zPlus: number[];
    yMinus: number[];
    yPlus: number[];
    xMinus: number[];
    xPlus: number[];
  };
  opacity: number;
  showEdgeFaces: boolean;
  showCornerFaces: boolean;
}

export interface PickResult {
  pickedActor: vtkActor;
  cellId: number;
  actorIndex: number;
}

export interface PositionConfig {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: number;
}

export interface MouseHandlersCallbacks {
  onFacePicked: (result: PickResult) => void;
  onFaceHover?: (result: PickResult | null) => void;
}

const OVERLAY_RENDERER_ID_SUFFIX = '-orientation-controller-overlay';

export class vtkOrientationControllerWidget {
  private actors = new Map<string, vtkActor[]>();
  private overlayRendererIds = new Map<string, string>();
  private pickers = new Map<string, vtkCellPicker>();
  private highlightedFace: {
    actor: vtkActor;
    cellId: number;
    originalColor: number[];
    viewport: Types.IVolumeViewport;
    isMainFace: boolean;
    originalScale?: number[];
  } | null = null;
  private mouseHandlers = new Map<
    string,
    {
      cleanup: () => void;
    }
  >();

  createActors(config: OrientationControllerConfig): vtkActor[] {
    const rgbToHex = (rgb: number[]) => {
      return `#${rgb
        .map((x) => {
          const hex = Math.round(x).toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')}`;
    };

    const rgbToHexColor = (rgb: number[]) => {
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    };

    const actorFactory = vtkAnnotatedRhombicuboctahedronActor.newInstance();

    const defaultStyle = {
      fontStyle: 'bold',
      fontFamily: 'Arial',
      fontColor: 'black',
      fontSizeScale: (res: number) => res / 2,
      faceColor: rgbToHex(config.faceColors.topBottom),
      edgeThickness: 0.1,
      edgeColor: 'black',
      resolution: 400,
    };

    actorFactory.setDefaultStyle(defaultStyle);

    // LPS coordinate system labels for the 6 main faces
    actorFactory.setXPlusFaceProperty({
      text: 'L',
      faceColor: rgbToHex(config.faceColors.leftRight),
      fontColor: rgbToHexColor(config.letterColors.xPlus),
      faceRotation: 0,
    });

    actorFactory.setXMinusFaceProperty({
      text: 'R',
      faceColor: rgbToHex(config.faceColors.leftRight),
      fontColor: rgbToHexColor(config.letterColors.xMinus),
      faceRotation: 0,
    });

    actorFactory.setYPlusFaceProperty({
      text: 'P',
      faceColor: rgbToHex(config.faceColors.frontBack),
      fontColor: rgbToHexColor(config.letterColors.yPlus),
      faceRotation: 180,
    });

    actorFactory.setYMinusFaceProperty({
      text: 'A',
      faceColor: rgbToHex(config.faceColors.frontBack),
      fontColor: rgbToHexColor(config.letterColors.yMinus),
      faceRotation: 0,
    });

    actorFactory.setZPlusFaceProperty({
      text: 'S',
      faceColor: rgbToHex(config.faceColors.topBottom),
      fontColor: rgbToHexColor(config.letterColors.zPlus),
    });

    actorFactory.setZMinusFaceProperty({
      text: 'I',
      faceColor: rgbToHex(config.faceColors.topBottom),
      fontColor: rgbToHexColor(config.letterColors.zMinus),
    });

    // Configure which faces to show
    actorFactory.setShowMainFaces(true);
    actorFactory.setShowEdgeFaces(config.showEdgeFaces);
    actorFactory.setShowCornerFaces(config.showCornerFaces);

    const actors = actorFactory.getActors();

    // Set opacity for all actors
    actors.forEach((actor) => {
      const property = actor.getProperty();
      property.setOpacity(config.opacity);
      actor.setVisibility(true);
    });

    return actors;
  }

  addActorsToViewport(
    viewportId: string,
    viewport: Types.IVolumeViewport,
    actors: vtkActor[]
  ): void {
    const existingActors = this.actors.get(viewportId);
    if (existingActors) {
      this.removeActorsFromViewport(viewportId, viewport);
    }

    const renderingEngine = (viewport as Types.IViewport).getRenderingEngine();
    const mrw = renderingEngine?.offscreenMultiRenderWindow;

    if (mrw) {
      const mainRenderer = viewport.getRenderer();
      const viewportBounds = mainRenderer.getViewport() as unknown as number[];
      const overlayId = `${viewportId}${OVERLAY_RENDERER_ID_SUFFIX}`;

      mrw.addRenderer({
        id: overlayId,
        viewport: viewportBounds,
        background: [0, 0, 0],
      });

      const overlayRenderer = mrw.getRenderer(overlayId) as vtkRenderer;
      overlayRenderer.setLayer(1);
      overlayRenderer.setActiveCamera(mainRenderer.getActiveCamera());

      actors.forEach((actor) => overlayRenderer.addActor(actor));
      this.actors.set(viewportId, actors);
      this.overlayRendererIds.set(viewportId, overlayId);
    } else {
      actors.forEach((actor, index) => {
        const uid = `orientation-controller-${viewportId}-${index}`;
        viewport.addActor({ actor, uid });
      });
      this.actors.set(viewportId, actors);
    }
  }

  removeActorsFromViewport(
    viewportId: string,
    viewport: Types.IVolumeViewport
  ): void {
    const overlayId = this.overlayRendererIds.get(viewportId);
    const actors = this.actors.get(viewportId);

    if (overlayId && actors) {
      const mrw = (viewport as Types.IViewport).getRenderingEngine()
        ?.offscreenMultiRenderWindow;
      if (mrw) {
        const overlayRenderer = mrw.getRenderer(overlayId) as vtkRenderer;
        if (overlayRenderer) {
          actors.forEach((a) => overlayRenderer.removeActor(a));
        }
        mrw.removeRenderer(overlayId);
      }
      this.overlayRendererIds.delete(viewportId);
      this.actors.delete(viewportId);
    } else if (actors) {
      const uids = actors.map(
        (_, index) => `orientation-controller-${viewportId}-${index}`
      );
      viewport.removeActors(uids);
      this.actors.delete(viewportId);
    }
  }

  setupPicker(viewportId: string, actors: vtkActor[]): vtkCellPicker {
    const picker = vtkCellPicker.newInstance({ opacityThreshold: 0.0001 });
    picker.setPickFromList(true);
    picker.setTolerance(0.001);
    picker.initializePickList();
    // Add all actors to the pick list
    actors.forEach((actor) => {
      picker.addPickList(actor);
    });
    this.pickers.set(viewportId, picker);
    return picker;
  }

  pickAtPosition(
    evt: MouseEvent,
    viewportId: string,
    viewport: Types.IVolumeViewport,
    element: HTMLDivElement,
    actors: vtkActor[]
  ): PickResult | null {
    const picker = this.pickers.get(viewportId);
    if (!picker) {
      return null;
    }

    const overlayId = this.overlayRendererIds.get(viewportId);
    let renderer: vtkRenderer = viewport.getRenderer() as vtkRenderer;
    if (overlayId) {
      const mrw = (viewport as Types.IViewport).getRenderingEngine()
        ?.offscreenMultiRenderWindow;
      if (mrw) {
        const overlay = mrw.getRenderer(overlayId) as vtkRenderer;
        if (overlay) renderer = overlay;
      }
    }

    const rect = element.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasPosWithDPR = [x * devicePixelRatio, y * devicePixelRatio];

    const canvas = viewport.canvas;
    const { width, height } = canvas;

    const [xMin, yMin, xMax, yMax] =
      renderer.getViewport() as unknown as number[];
    const viewportWidth = xMax - xMin;
    const viewportHeight = yMax - yMin;

    const scaledX = (canvasPosWithDPR[0] / width) * viewportWidth * width;
    const scaledY = (canvasPosWithDPR[1] / height) * viewportHeight * height;

    const displayCoord = [scaledX, viewportHeight * height - scaledY];
    const displayCoords: [number, number, number] = [
      displayCoord[0],
      displayCoord[1],
      0,
    ];

    picker.pick(displayCoords, renderer);

    const pickedActors = picker.getActors();
    if (pickedActors.length === 0) {
      return null;
    }

    const pickedActor = pickedActors[0];
    const cellId = picker.getCellId();

    if (actors.includes(pickedActor) && cellId !== -1) {
      const actorIndex = actors.indexOf(pickedActor);
      return { pickedActor, cellId, actorIndex };
    }

    return null;
  }

  calculateMarkerPosition(
    viewport: Types.IVolumeViewport,
    position: PositionConfig['position']
  ): [number, number, number] | null {
    const canvas = viewport.canvas;
    if (!canvas) {
      return null;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const cornerOffset = 35; // pixels from corner (match OrientationControllerTool)

    let canvasX: number;
    let canvasY: number;

    switch (position) {
      case 'top-left':
        canvasX = cornerOffset;
        canvasY = cornerOffset;
        break;
      case 'top-right':
        canvasX = canvasWidth - cornerOffset;
        canvasY = cornerOffset;
        break;
      case 'bottom-left':
        canvasX = cornerOffset;
        canvasY = canvasHeight - cornerOffset;
        break;
      default: // bottom-right
        canvasX = canvasWidth - cornerOffset;
        canvasY = canvasHeight - cornerOffset;
    }

    const canvasPos: Types.Point2 = [canvasX, canvasY];
    const worldPos = viewport.canvasToWorld(canvasPos);

    return [worldPos[0], worldPos[1], worldPos[2]];
  }

  positionActors(
    viewport: Types.IVolumeViewport,
    actors: vtkActor[],
    config: PositionConfig
  ): boolean {
    // Calculate marker size in world units to maintain fixed screen size
    // This keeps the marker at a constant screen size regardless of zoom
    const canvas = viewport.canvas;
    if (!canvas) {
      console.warn('OrientationControllerWidget: No canvas available');
      return false;
    }

    // Get the camera to calculate world-to-screen ratio
    const camera = viewport.getVtkActiveCamera();
    const parallelScale = camera.getParallelScale();

    // parallelScale is half the height of the view in world coordinates
    // So the full height in world units is parallelScale * 2
    const worldHeight = parallelScale * 2;

    // Calculate world units per pixel
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasHeight = canvas.height / devicePixelRatio;
    const worldUnitsPerPixel = worldHeight / canvasHeight;

    // Calculate desired screen size in pixels
    const canvasSize = Math.min(canvas.width, canvas.height) / devicePixelRatio;
    const screenSizePixels = canvasSize * config.size;

    // Convert to world units
    const markerSize = screenSizePixels * worldUnitsPerPixel;

    // Scale and position all actors
    actors.forEach((actor) => {
      actor.setScale(markerSize, markerSize, markerSize);

      const worldPos = this.calculateMarkerPosition(viewport, config.position);
      if (!worldPos) {
        console.warn(
          'OrientationControllerWidget: Could not get world position'
        );
        return;
      }

      actor.setPosition(worldPos[0], worldPos[1], worldPos[2]);
      actor.setOrientation(0, 0, 0);
    });

    return true;
  }

  highlightFace(
    actor: vtkActor,
    cellId: number,
    viewport: Types.IVolumeViewport,
    isMainFace: boolean = false
  ): void {
    // Check if we're already highlighting this exact face
    if (
      this.highlightedFace &&
      this.highlightedFace.actor === actor &&
      this.highlightedFace.cellId === cellId &&
      this.highlightedFace.isMainFace === isMainFace
    ) {
      return; // Already highlighting this face, no need to re-highlight
    }

    // Clear any existing highlight first
    this.clearHighlight();

    // For main faces (texture-based), we can't easily highlight individual faces
    // since they're all on the same actor. Scaling the actor would affect all 6 main faces.
    // Skip highlighting for main faces on hover to avoid highlighting multiple faces.
    if (isMainFace) {
      return;
    }

    // For edge/corner faces (cell data colors)
    const mapper = actor.getMapper();
    const inputData = mapper.getInputData();

    if (!inputData) {
      return;
    }

    const cellData = inputData.getCellData();
    const colors = cellData.getScalars();

    if (!colors) {
      return;
    }

    // Store original color
    const colorArray = colors.getData();
    const offset = cellId * 4;
    const originalColor = [
      colorArray[offset],
      colorArray[offset + 1],
      colorArray[offset + 2],
      colorArray[offset + 3],
    ];

    // Store highlight info for later reset
    this.highlightedFace = {
      actor,
      cellId,
      originalColor,
      viewport,
      isMainFace: false,
    };

    // Set highlight color (bright white)
    colorArray[offset] = 255;
    colorArray[offset + 1] = 255;
    colorArray[offset + 2] = 255;
    colorArray[offset + 3] = 255;

    // Mark as modified and render
    colors.modified();
    inputData.modified();
    viewport.render();
  }

  clearHighlight(): void {
    if (!this.highlightedFace) {
      return;
    }

    const { actor, cellId, originalColor, viewport, isMainFace } =
      this.highlightedFace;

    // For main faces, reset the actor's scale
    if (isMainFace && this.highlightedFace.originalScale) {
      const scale = this.highlightedFace.originalScale;
      actor.setScale(scale[0], scale[1], scale[2]);
      viewport.render();
      this.highlightedFace = null;
      return;
    }

    // For edge/corner faces, reset cell data colors
    const mapper = actor.getMapper();
    const inputData = mapper.getInputData();

    if (!inputData) {
      this.highlightedFace = null;
      return;
    }

    const cellData = inputData.getCellData();
    const colors = cellData.getScalars();

    if (!colors) {
      this.highlightedFace = null;
      return;
    }

    // Reset to original color
    const colorArray = colors.getData();
    const offset = cellId * 4;
    colorArray[offset] = originalColor[0];
    colorArray[offset + 1] = originalColor[1];
    colorArray[offset + 2] = originalColor[2];
    colorArray[offset + 3] = originalColor[3];

    // Mark as modified and render
    colors.modified();
    inputData.modified();
    viewport.render();

    this.highlightedFace = null;
  }

  setupMouseHandlers(
    viewportId: string,
    element: HTMLDivElement,
    viewport: Types.IVolumeViewport,
    actors: vtkActor[],
    callbacks: MouseHandlersCallbacks
  ): { cleanup: () => void } {
    let isMouseDown = false;

    const hoverHandler = (evt: MouseEvent) => {
      if (isMouseDown) {
        return;
      }

      const pickResult = this.pickAtPosition(
        evt,
        viewportId,
        viewport,
        element,
        actors
      );

      if (pickResult) {
        const { pickedActor, cellId, actorIndex } = pickResult;
        // Only highlight edge/corner faces on hover (not main faces)
        // Main faces are all on the same actor, so highlighting would affect all of them
        if (actorIndex !== 0) {
          this.highlightFace(
            pickedActor,
            cellId,
            viewport,
            false // isMainFace = false for edge/corner faces
          );
        }
        if (callbacks.onFaceHover) {
          callbacks.onFaceHover(pickResult);
        }
      } else {
        this.clearHighlight();
        if (callbacks.onFaceHover) {
          callbacks.onFaceHover(null);
        }
      }
    };

    const clickHandler = (evt: MouseEvent) => {
      if (evt.button !== 0) {
        return;
      }

      const pickResult = this.pickAtPosition(
        evt,
        viewportId,
        viewport,
        element,
        actors
      );

      if (!pickResult) {
        return;
      }

      isMouseDown = true;

      // Determine global cellId
      let globalCellId = pickResult.cellId;
      if (pickResult.actorIndex === 1) {
        // Edge faces: add 6 to convert local cellId to global
        globalCellId = pickResult.cellId + 6;
      } else if (pickResult.actorIndex === 2) {
        // Corner faces: add 18 to convert local cellId to global
        globalCellId = pickResult.cellId + 18;
      }
      // actorIndex === 0 (main faces): cellId stays as is

      callbacks.onFacePicked({
        ...pickResult,
        cellId: globalCellId,
      });

      evt.preventDefault();
      evt.stopPropagation();
    };

    const mouseUpHandler = () => {
      isMouseDown = false;
      this.clearHighlight();
    };

    element.addEventListener('mousemove', hoverHandler);
    element.addEventListener('mousedown', clickHandler);
    element.addEventListener('mouseup', mouseUpHandler);
    element.addEventListener('mouseleave', mouseUpHandler);

    const cleanup = () => {
      element.removeEventListener('mousemove', hoverHandler);
      element.removeEventListener('mousedown', clickHandler);
      element.removeEventListener('mouseup', mouseUpHandler);
      element.removeEventListener('mouseleave', mouseUpHandler);
    };

    this.mouseHandlers.set(viewportId, { cleanup });

    return { cleanup };
  }

  getActors(viewportId: string): vtkActor[] | undefined {
    return this.actors.get(viewportId);
  }

  syncOverlayViewport(
    viewportId: string,
    viewport: Types.IVolumeViewport
  ): void {
    const overlayId = this.overlayRendererIds.get(viewportId);
    if (!overlayId) return;
    const mrw = (viewport as Types.IViewport).getRenderingEngine()
      ?.offscreenMultiRenderWindow;
    if (!mrw) return;
    const overlay = mrw.getRenderer(overlayId) as vtkRenderer;
    const main = viewport.getRenderer() as vtkRenderer;
    if (overlay && main) {
      overlay.setViewport(...(main.getViewport() as unknown as number[]));
    }
  }

  getOrientationForFace(cellId: number): {
    viewPlaneNormal: number[];
    viewUp: number[];
  } | null {
    // Cell IDs for rhombicuboctahedron:
    // 0-5: Main square faces
    // 6-17: Edge square faces
    // 18-25: Corner triangular faces

    const orientations = new Map<
      number,
      { viewPlaneNormal: number[]; viewUp: number[] }
    >();

    // Main 6 faces
    orientations.set(0, { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] }); // Bottom
    orientations.set(1, { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] }); // Top
    orientations.set(2, { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] }); // Front
    orientations.set(3, { viewPlaneNormal: [0, 1, 0], viewUp: [0, 0, 1] }); // Back
    orientations.set(4, { viewPlaneNormal: [-1, 0, 0], viewUp: [0, 0, 1] }); // Left
    orientations.set(5, { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] }); // Right

    // 12 edge faces - diagonal views
    const sqrt2 = 1 / Math.sqrt(2);
    orientations.set(6, {
      viewPlaneNormal: [0, -sqrt2, -sqrt2],
      viewUp: [0, -sqrt2, sqrt2],
    });
    orientations.set(7, {
      viewPlaneNormal: [sqrt2, 0, -sqrt2],
      viewUp: [0, 0, 1],
    });
    orientations.set(8, {
      viewPlaneNormal: [0, sqrt2, -sqrt2],
      viewUp: [0, -sqrt2, -sqrt2],
    });
    orientations.set(9, {
      viewPlaneNormal: [-sqrt2, 0, -sqrt2],
      viewUp: [0, 0, 1],
    });
    orientations.set(10, {
      viewPlaneNormal: [0, -sqrt2, sqrt2],
      viewUp: [0, sqrt2, sqrt2],
    });
    orientations.set(11, {
      viewPlaneNormal: [sqrt2, 0, sqrt2],
      viewUp: [0, 0, 1],
    });
    orientations.set(12, {
      viewPlaneNormal: [0, sqrt2, sqrt2],
      viewUp: [0, sqrt2, -sqrt2],
    });
    orientations.set(13, {
      viewPlaneNormal: [-sqrt2, 0, sqrt2],
      viewUp: [0, 0, 1],
    });
    orientations.set(14, {
      viewPlaneNormal: [-sqrt2, -sqrt2, 0],
      viewUp: [0, 0, 1],
    });
    orientations.set(15, {
      viewPlaneNormal: [sqrt2, -sqrt2, 0],
      viewUp: [0, 0, 1],
    });
    orientations.set(16, {
      viewPlaneNormal: [sqrt2, sqrt2, 0],
      viewUp: [0, 0, 1],
    });
    orientations.set(17, {
      viewPlaneNormal: [-sqrt2, sqrt2, 0],
      viewUp: [0, 0, 1],
    });

    // 8 corner faces - tri-axial views
    const sqrt3 = 1 / Math.sqrt(3);
    orientations.set(18, {
      viewPlaneNormal: [-sqrt3, -sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    });
    orientations.set(19, {
      viewPlaneNormal: [sqrt3, -sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    });
    orientations.set(20, {
      viewPlaneNormal: [sqrt3, sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    });
    orientations.set(21, {
      viewPlaneNormal: [-sqrt3, sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    });
    orientations.set(22, {
      viewPlaneNormal: [-sqrt3, -sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    });
    orientations.set(23, {
      viewPlaneNormal: [sqrt3, -sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    });
    orientations.set(24, {
      viewPlaneNormal: [sqrt3, sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    });
    orientations.set(25, {
      viewPlaneNormal: [-sqrt3, sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    });

    return orientations.get(cellId) || null;
  }

  cleanup(viewportId?: string): void {
    if (viewportId) {
      const handler = this.mouseHandlers.get(viewportId);
      if (handler) {
        handler.cleanup();
        this.mouseHandlers.delete(viewportId);
      }
      this.actors.delete(viewportId);
      this.overlayRendererIds.delete(viewportId);
      this.pickers.delete(viewportId);
    } else {
      this.mouseHandlers.forEach((handler) => handler.cleanup());
      this.mouseHandlers.clear();
      this.actors.clear();
      this.overlayRendererIds.clear();
      this.pickers.clear();
    }
    this.clearHighlight();
  }
}
