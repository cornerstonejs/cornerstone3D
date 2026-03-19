import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { Enums } from '@cornerstonejs/core';
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

export class vtkOrientationControllerWidget {
  private actors = new Map<string, vtkActor[]>();
  private pickers = new Map<string, vtkCellPicker>();
  private overlayRenderers = new Map<
    string,
    ReturnType<typeof vtkRenderer.newInstance>
  >();
  private renderWindows = new Map<
    string,
    {
      addRenderer(r: unknown): void;
      removeRenderer(r: unknown): void;
      setNumberOfLayers(n: number): void;
      getNumberOfLayers(): number;
    }
  >();
  private highlightedFace: {
    actor: vtkActor;
    cellId: number;
    originalColor: number[];
    viewport: Types.IVolumeViewport;
    isMainFace: boolean;
    mainFacePointIds?: number[];
    mainFacePositions?: number[];
    mainFaceNormals?: number[];
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

  /**
   * Adds orientation controller actors to a dedicated overlay renderer (layer 1)
   * so they always render on top of the volume and other scene actors.
   * This follows the same pattern as vtkOrientationMarkerWidget.
   */
  addActorsToViewport(
    viewportId: string,
    viewport: Types.IVolumeViewport,
    actors: vtkActor[]
  ): void {
    const existingActors = this.actors.get(viewportId);
    if (existingActors) {
      this.removeActorsFromViewport(viewportId, viewport);
    }

    const renderWindow = (viewport as Types.IViewport)
      .getRenderingEngine()
      .getOffscreenMultiRenderWindow(viewport.id)
      .getRenderWindow();

    const mainRenderer =
      (viewport as Types.IViewport)
        .getRenderingEngine()
        ?.getRenderer(viewportId) ?? viewport.getRenderer();

    const vtkMainRenderer = mainRenderer as vtkRenderer;
    const overlayRenderer = vtkRenderer.newInstance();
    overlayRenderer.setLayer(1);
    overlayRenderer.setInteractive(false);
    overlayRenderer.setPreserveColorBuffer(true);

    overlayRenderer.setActiveCamera(vtkMainRenderer.getActiveCamera());

    // Match the main renderer's viewport region within the shared render window
    // so the overlay only draws in this viewport's canvas area.
    const vp = vtkMainRenderer.getViewport() as [
      number,
      number,
      number,
      number,
    ];
    overlayRenderer.setViewport(...vp);

    if (renderWindow.getNumberOfLayers() < 2) {
      renderWindow.setNumberOfLayers(2);
    }
    renderWindow.addRenderer(overlayRenderer);

    actors.forEach((actor) => {
      overlayRenderer.addActor(actor);
    });

    this.actors.set(viewportId, actors);
    this.overlayRenderers.set(viewportId, overlayRenderer);
    this.renderWindows.set(viewportId, renderWindow);
  }

  removeActorsFromViewport(
    viewportId: string,
    _viewport: Types.IVolumeViewport
  ): void {
    const actors = this.actors.get(viewportId);
    const overlayRenderer = this.overlayRenderers.get(viewportId);
    const renderWindow = this.renderWindows.get(viewportId);

    if (actors && overlayRenderer) {
      actors.forEach((actor) => {
        overlayRenderer.removeActor(actor);
      });
      if (renderWindow) {
        renderWindow.removeRenderer(overlayRenderer);
      }
      overlayRenderer.delete();
    }

    this.actors.delete(viewportId);
    this.overlayRenderers.delete(viewportId);
    this.renderWindows.delete(viewportId);
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

    const renderer =
      this.overlayRenderers.get(viewportId) ??
      (viewport as Types.IViewport)
        .getRenderingEngine()
        ?.getRenderer(viewportId) ??
      viewport.getRenderer();
    if (!renderer) {
      return null;
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

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = canvas.clientWidth || canvas.width / devicePixelRatio;
    const canvasHeight =
      canvas.clientHeight || canvas.height / devicePixelRatio;
    const cornerOffset =
      viewport.type === Enums.ViewportType.VOLUME_3D ? 55 : 35;

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

    // Get the camera to calculate world-to-screen ratio (use engine so it works with RenderingEngine facade)
    const mainRenderer =
      (viewport as Types.IViewport)
        .getRenderingEngine()
        ?.getRenderer(viewport.id) ?? viewport.getRenderer();
    const camera = (mainRenderer as vtkRenderer)?.getActiveCamera();
    if (!camera) {
      return false;
    }
    const parallelScale = camera.getParallelScale();

    // parallelScale is half the height of the view in world coordinates
    // So the full height in world units is parallelScale * 2
    const worldHeight = parallelScale * 2;

    // Calculate world units per pixel
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasHeight =
      canvas.clientHeight || canvas.height / devicePixelRatio;
    const canvasWidth = canvas.clientWidth || canvas.width / devicePixelRatio;
    const worldUnitsPerPixel = worldHeight / canvasHeight;

    // Calculate desired screen size in pixels
    const canvasSize = Math.min(canvasWidth, canvasHeight);
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

  /**
   * Main-face mesh uses disjoint vertex sets per quad (see RhombicuboctahedronSource MAIN_FACES),
   * so scaling only that cell's points expands a single face plate.
   */
  private scaleMainFaceQuadLocally(
    actor: vtkActor,
    cellId: number,
    scaleFactor: number
  ): {
    pointIds: number[];
    positions: number[];
    normals: number[];
  } | null {
    const mapper = actor.getMapper();
    const polyData = mapper.getInputData() as {
      getCellPoints: (id: number) => {
        cellPointIds: Uint32Array | Uint16Array | null;
      };
      getPoints: () => {
        getData: () => Float32Array | Float64Array;
        modified: () => void;
      };
      getPointData: () => {
        getNormals: () => {
          getData: () => Float32Array | Float64Array;
          modified: () => void;
        } | null;
        modified: () => void;
      };
      modified: () => void;
    } | null;
    if (!polyData?.getCellPoints) {
      return null;
    }
    const { cellPointIds } = polyData.getCellPoints(cellId);
    if (!cellPointIds || cellPointIds.length < 3) {
      return null;
    }
    const pointIds = Array.from(cellPointIds);
    const points = polyData.getPoints();
    const ptsData = points.getData();
    const normalScalars = polyData.getPointData().getNormals();
    const normalsData = normalScalars?.getData();

    const positions: number[] = [];
    const normals: number[] = [];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const pid of pointIds) {
      const o = pid * 3;
      positions.push(ptsData[o], ptsData[o + 1], ptsData[o + 2]);
      cx += ptsData[o];
      cy += ptsData[o + 1];
      cz += ptsData[o + 2];
      if (normalsData) {
        normals.push(normalsData[o], normalsData[o + 1], normalsData[o + 2]);
      }
    }
    const nPts = pointIds.length;
    cx /= nPts;
    cy /= nPts;
    cz /= nPts;

    for (const pid of pointIds) {
      const o = pid * 3;
      const vx = ptsData[o] - cx;
      const vy = ptsData[o + 1] - cy;
      const vz = ptsData[o + 2] - cz;
      ptsData[o] = cx + vx * scaleFactor;
      ptsData[o + 1] = cy + vy * scaleFactor;
      ptsData[o + 2] = cz + vz * scaleFactor;
      if (normalsData) {
        const nx = ptsData[o];
        const ny = ptsData[o + 1];
        const nz = ptsData[o + 2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        normalsData[o] = nx / len;
        normalsData[o + 1] = ny / len;
        normalsData[o + 2] = nz / len;
      }
    }
    points.modified();
    polyData.getPointData().modified();
    polyData.modified();
    return { pointIds, positions, normals };
  }

  private restoreMainFaceQuadGeometry(
    actor: vtkActor,
    pointIds: number[],
    positions: number[],
    normalsBackup: number[] | undefined
  ): void {
    const mapper = actor.getMapper();
    const polyData = mapper.getInputData() as {
      getPoints: () => {
        getData: () => Float32Array | Float64Array;
        modified: () => void;
      };
      getPointData: () => {
        getNormals: () => {
          getData: () => Float32Array | Float64Array;
          modified: () => void;
        } | null;
        modified: () => void;
      };
      modified: () => void;
    } | null;
    if (!polyData) {
      return;
    }
    const points = polyData.getPoints();
    const ptsData = points.getData();
    const normalsData = polyData.getPointData().getNormals()?.getData();
    for (let i = 0; i < pointIds.length; i++) {
      const pid = pointIds[i];
      const o = pid * 3;
      const j = i * 3;
      ptsData[o] = positions[j];
      ptsData[o + 1] = positions[j + 1];
      ptsData[o + 2] = positions[j + 2];
      if (normalsData && normalsBackup && normalsBackup.length >= j + 3) {
        normalsData[o] = normalsBackup[j];
        normalsData[o + 1] = normalsBackup[j + 1];
        normalsData[o + 2] = normalsBackup[j + 2];
      }
    }
    points.modified();
    polyData.getPointData().modified();
    polyData.modified();
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

    if (isMainFace) {
      const backup = this.scaleMainFaceQuadLocally(actor, cellId, 1.08);
      if (!backup) {
        return;
      }
      this.highlightedFace = {
        actor,
        cellId,
        originalColor: [0, 0, 0, 0],
        viewport,
        isMainFace: true,
        mainFacePointIds: backup.pointIds,
        mainFacePositions: backup.positions,
        mainFaceNormals: backup.normals,
      };
      viewport.render();
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

    if (isMainFace) {
      const ids = this.highlightedFace.mainFacePointIds;
      const pos = this.highlightedFace.mainFacePositions;
      const nrm = this.highlightedFace.mainFaceNormals;
      if (ids && pos && pos.length === ids.length * 3) {
        this.restoreMainFaceQuadGeometry(actor, ids, pos, nrm);
      }
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
        this.highlightFace(pickedActor, cellId, viewport, actorIndex === 0);
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

    const dblclickHandler = (evt: MouseEvent) => {
      const pickResult = this.pickAtPosition(
        evt,
        viewportId,
        viewport,
        element,
        actors
      );
      if (pickResult) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
      }
    };

    element.addEventListener('mousemove', hoverHandler);
    element.addEventListener('mousedown', clickHandler);
    element.addEventListener('mouseup', mouseUpHandler);
    element.addEventListener('mouseleave', mouseUpHandler);
    element.addEventListener('dblclick', dblclickHandler, true);

    const cleanup = () => {
      element.removeEventListener('mousemove', hoverHandler);
      element.removeEventListener('mousedown', clickHandler);
      element.removeEventListener('mouseup', mouseUpHandler);
      element.removeEventListener('mouseleave', mouseUpHandler);
      element.removeEventListener('dblclick', dblclickHandler, true);
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
    const overlayRenderer = this.overlayRenderers.get(viewportId);
    if (!overlayRenderer) {
      return;
    }

    const mainRenderer =
      (viewport as Types.IViewport)
        .getRenderingEngine()
        ?.getRenderer(viewportId) ?? viewport.getRenderer();
    if (!mainRenderer) {
      return;
    }

    // Camera is shared via setActiveCamera, so only viewport bounds need syncing.
    const mainVp = (mainRenderer as vtkRenderer).getViewport() as [
      number,
      number,
      number,
      number,
    ];
    overlayRenderer.setViewport(...mainVp);
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

      const overlayRenderer = this.overlayRenderers.get(viewportId);
      const renderWindow = this.renderWindows.get(viewportId);
      if (overlayRenderer) {
        if (renderWindow) {
          renderWindow.removeRenderer(overlayRenderer);
        }
        overlayRenderer.delete();
      }

      this.actors.delete(viewportId);
      this.pickers.delete(viewportId);
      this.overlayRenderers.delete(viewportId);
      this.renderWindows.delete(viewportId);
    } else {
      this.mouseHandlers.forEach((handler) => handler.cleanup());
      this.mouseHandlers.clear();

      this.overlayRenderers.forEach((overlayRenderer, vpId) => {
        const renderWindow = this.renderWindows.get(vpId);
        if (renderWindow) {
          renderWindow.removeRenderer(overlayRenderer);
        }
        overlayRenderer.delete();
      });
      this.overlayRenderers.clear();
      this.renderWindows.clear();

      this.actors.clear();
      this.pickers.clear();
    }
    this.clearHighlight();
  }
}
