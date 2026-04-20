import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { Enums } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import vtkAnnotatedRhombicuboctahedronActor from '../AnnotatedRhombicuboctahedronActor';
import { beginOwnedDrag, endOwnedDrag } from '../../interactionDragCoordinator';

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
    mainFaceTextureData?: Uint8Array;
    mainFaceTile?: {
      x0: number;
      y0: number;
      width: number;
      height: number;
      imageWidth: number;
    };
    mainFaceHighlightActor?: vtkActor;
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
    position: PositionConfig['position'],
    screenSizePixels: number
  ): [number, number, number] | null {
    const canvas = viewport.canvas;
    if (!canvas) {
      return null;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasWidth = canvas.clientWidth || canvas.width / devicePixelRatio;
    const canvasHeight =
      canvas.clientHeight || canvas.height / devicePixelRatio;

    // We want the distance between the controller and the viewport border
    // to scale with the controller size.
    //
    // We clamp the margin so the controller stays fully within the viewport
    // even when the size is large.
    const marginRatio =
      viewport.type === Enums.ViewportType.VOLUME_3D ? 1.3 : 1.1;
    const marginPxRaw = marginRatio * screenSizePixels;
    const halfPx = screenSizePixels * 0.5;

    const maxMarginX = Math.max(0, (canvasWidth - screenSizePixels) / 2);
    const maxMarginY = Math.max(0, (canvasHeight - screenSizePixels) / 2);
    const marginPx = Math.min(marginPxRaw, maxMarginX, maxMarginY);

    let canvasX: number;
    let canvasY: number;

    switch (position) {
      case 'top-left':
        canvasX = marginPx + halfPx;
        canvasY = marginPx + halfPx;
        break;
      case 'top-right':
        canvasX = canvasWidth - marginPx - halfPx;
        canvasY = marginPx + halfPx;
        break;
      case 'bottom-left':
        canvasX = marginPx + halfPx;
        canvasY = canvasHeight - marginPx - halfPx;
        break;
      default: // bottom-right
        canvasX = canvasWidth - marginPx - halfPx;
        canvasY = canvasHeight - marginPx - halfPx;
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

      const worldPos = this.calculateMarkerPosition(
        viewport,
        config.position,
        screenSizePixels
      );
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

    if (isMainFace) {
      const textureCollection = (
        actor as unknown as {
          getTextures?: () =>
            | unknown[]
            | {
                getItem?: (index: number) => unknown;
                getNumberOfItems?: () => number;
              };
        }
      ).getTextures?.();
      const textureCandidate = Array.isArray(textureCollection)
        ? textureCollection[0]
        : textureCollection?.getItem?.(0);
      const texture = textureCandidate as
        | {
            getInputData: () => {
              getDimensions: () => [number, number, number];
              getPointData: () => {
                getScalars: () => {
                  getData: () => Uint8Array | Uint8ClampedArray;
                  modified: () => void;
                } | null;
              };
              modified: () => void;
            } | null;
          }
        | undefined;
      const imageData = texture?.getInputData?.();
      const scalars = imageData?.getPointData().getScalars();
      const pixels = scalars?.getData();
      const dims = imageData?.getDimensions();

      if (
        !imageData ||
        !scalars ||
        !pixels ||
        !dims ||
        cellId < 0 ||
        cellId > 5
      ) {
        const mapper = actor.getMapper();
        const polyData = mapper.getInputData() as {
          getCellPoints: (id: number) => {
            cellPointIds: Uint32Array | Uint16Array | null;
          };
          getPoints: () => {
            getData: () => Float32Array | Float64Array;
          };
        } | null;
        if (!polyData?.getCellPoints) {
          return;
        }
        const { cellPointIds } = polyData.getCellPoints(cellId);
        if (!cellPointIds || cellPointIds.length < 3) {
          return;
        }
        const src = polyData.getPoints().getData();
        const coords: number[] = [];
        Array.from(cellPointIds).forEach((pid) => {
          const o = pid * 3;
          coords.push(src[o], src[o + 1], src[o + 2]);
        });
        const points = vtkPoints.newInstance();
        points.setData(new Float32Array(coords), 3);
        const polys = vtkCellArray.newInstance({
          values: new Uint32Array([
            cellPointIds.length,
            ...Array.from(cellPointIds, (_, i) => i),
          ]),
        });
        const poly = vtkPolyData.newInstance();
        poly.setPoints(points);
        poly.setPolys(polys);
        const faceMapper = vtkMapper.newInstance();
        faceMapper.setInputData(poly);
        const faceActor = vtkActor.newInstance();
        faceActor.setMapper(faceMapper);
        const [sx, sy, sz] = actor.getScale();
        const [px, py, pz] = actor.getPosition();
        const [ox, oy, oz] = actor.getOrientation();
        faceActor.setScale(sx, sy, sz);
        faceActor.setPosition(px, py, pz);
        faceActor.setOrientation(ox, oy, oz);
        faceActor.setPickable(false);
        const p = faceActor.getProperty();
        p.setLighting(false);
        p.setAmbient(1);
        p.setDiffuse(0);
        p.setColor(1, 1, 1);
        p.setOpacity(0.58);
        this.overlayRenderers.get(viewport.id)?.addActor(faceActor);
        this.highlightedFace = {
          actor,
          cellId,
          originalColor: [0, 0, 0, 0],
          viewport,
          isMainFace: true,
          mainFaceHighlightActor: faceActor,
        };
        viewport.render();
        return;
      }
      const [imageWidth, imageHeight] = dims;
      const tileWidth = Math.floor(imageWidth / 3);
      const tileHeight = Math.floor(imageHeight / 2);
      const tileCol = cellId % 3;
      const tileRow = Math.floor(cellId / 3);
      const x0 = tileCol * tileWidth;
      const y0 = tileRow * tileHeight;

      const tileBackup = new Uint8Array(tileWidth * tileHeight * 4);
      let b = 0;
      for (let y = 0; y < tileHeight; y++) {
        for (let x = 0; x < tileWidth; x++) {
          const srcIndex = ((y0 + y) * imageWidth + (x0 + x)) * 4;
          tileBackup[b++] = pixels[srcIndex];
          tileBackup[b++] = pixels[srcIndex + 1];
          tileBackup[b++] = pixels[srcIndex + 2];
          tileBackup[b++] = pixels[srcIndex + 3];
        }
      }

      const bgSampleIndices = [
        ((y0 + 8) * imageWidth + (x0 + 8)) * 4,
        ((y0 + 8) * imageWidth + (x0 + tileWidth - 9)) * 4,
        ((y0 + tileHeight - 9) * imageWidth + (x0 + 8)) * 4,
        ((y0 + tileHeight - 9) * imageWidth + (x0 + tileWidth - 9)) * 4,
      ];
      const bgColor = [0, 0, 0];
      bgSampleIndices.forEach((idx) => {
        bgColor[0] += pixels[idx];
        bgColor[1] += pixels[idx + 1];
        bgColor[2] += pixels[idx + 2];
      });
      bgColor[0] /= bgSampleIndices.length;
      bgColor[1] /= bgSampleIndices.length;
      bgColor[2] /= bgSampleIndices.length;

      // Brighten face fill only (not the letter); outer frame stays black below.
      const glyphThreshold = 42;
      const faceBrighten = 72;
      const isGlyphPixel = (x: number, y: number): boolean => {
        if (x < 0 || x >= tileWidth || y < 0 || y >= tileHeight) {
          return false;
        }
        const idx = ((y0 + y) * imageWidth + (x0 + x)) * 4;
        const dr = pixels[idx] - bgColor[0];
        const dg = pixels[idx + 1] - bgColor[1];
        const db = pixels[idx + 2] - bgColor[2];
        return Math.sqrt(dr * dr + dg * dg + db * db) >= glyphThreshold;
      };

      const borderWidth = Math.max(4, Math.floor(tileWidth * 0.035));
      for (let y = 0; y < tileHeight; y++) {
        for (let x = 0; x < tileWidth; x++) {
          const onBorder =
            x < borderWidth ||
            x >= tileWidth - borderWidth ||
            y < borderWidth ||
            y >= tileHeight - borderWidth;
          if (onBorder || isGlyphPixel(x, y)) {
            continue;
          }
          const idx = ((y0 + y) * imageWidth + (x0 + x)) * 4;
          pixels[idx] = Math.min(255, pixels[idx] + faceBrighten);
          pixels[idx + 1] = Math.min(255, pixels[idx + 1] + faceBrighten);
          pixels[idx + 2] = Math.min(255, pixels[idx + 2] + faceBrighten);
        }
      }

      // Black border around the hovered face tile.
      for (let y = 0; y < tileHeight; y++) {
        for (let x = 0; x < tileWidth; x++) {
          const onBorder =
            x < borderWidth ||
            x >= tileWidth - borderWidth ||
            y < borderWidth ||
            y >= tileHeight - borderWidth;
          if (!onBorder) {
            continue;
          }
          const idx = ((y0 + y) * imageWidth + (x0 + x)) * 4;
          pixels[idx] = 0;
          pixels[idx + 1] = 0;
          pixels[idx + 2] = 0;
        }
      }

      scalars.modified();
      imageData.modified();
      (texture as { modified?: () => void }).modified?.();
      actor.modified?.();
      this.highlightedFace = {
        actor,
        cellId,
        originalColor: [0, 0, 0, 0],
        viewport,
        isMainFace: true,
        mainFaceTextureData: tileBackup,
        mainFaceTile: {
          x0,
          y0,
          width: tileWidth,
          height: tileHeight,
          imageWidth,
        },
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
      const backup = this.highlightedFace.mainFaceTextureData;
      const tile = this.highlightedFace.mainFaceTile;
      const textures = (
        actor as unknown as { getTextures?: () => unknown[] }
      ).getTextures?.();
      const texture = textures?.[0] as
        | {
            getInputData: () => {
              getPointData: () => {
                getScalars: () => {
                  getData: () => Uint8Array | Uint8ClampedArray;
                  modified: () => void;
                } | null;
              };
              modified: () => void;
            } | null;
          }
        | undefined;
      const imageData = texture?.getInputData?.();
      const scalars = imageData?.getPointData().getScalars();
      const pixels = scalars?.getData();
      if (backup && tile && scalars && imageData && pixels) {
        let b = 0;
        for (let y = 0; y < tile.height; y++) {
          for (let x = 0; x < tile.width; x++) {
            const dstIndex =
              ((tile.y0 + y) * tile.imageWidth + (tile.x0 + x)) * 4;
            pixels[dstIndex] = backup[b++];
            pixels[dstIndex + 1] = backup[b++];
            pixels[dstIndex + 2] = backup[b++];
            pixels[dstIndex + 3] = backup[b++];
          }
        }
        scalars.modified();
        imageData.modified();
        (texture as { modified?: () => void }).modified?.();
        actor.modified?.();
      } else if (this.highlightedFace.mainFaceHighlightActor) {
        const overlayRenderer = this.overlayRenderers.get(viewport.id);
        overlayRenderer?.removeActor(
          this.highlightedFace.mainFaceHighlightActor
        );
        this.highlightedFace.mainFaceHighlightActor.delete();
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
    let didDrag = false;
    let pendingPickResult: PickResult | null = null;
    let mouseDownCanvas: { x: number; y: number } | null = null;
    const clickTolerancePx = 3;

    const hoverHandler = (evt: MouseEvent) => {
      if (isMouseDown) {
        if (mouseDownCanvas) {
          const dx = evt.clientX - mouseDownCanvas.x;
          const dy = evt.clientY - mouseDownCanvas.y;
          if (dx * dx + dy * dy > clickTolerancePx * clickTolerancePx) {
            didDrag = true;
          }
        }
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
      didDrag = false;
      pendingPickResult = pickResult;
      mouseDownCanvas = { x: evt.clientX, y: evt.clientY };
      beginOwnedDrag(viewportId, 'orientation-controller');
    };

    const mouseUpHandler = (evt: MouseEvent) => {
      if (isMouseDown && !didDrag && pendingPickResult) {
        // Determine global cellId for a true click (not drag).
        let globalCellId = pendingPickResult.cellId;
        if (pendingPickResult.actorIndex === 1) {
          globalCellId = pendingPickResult.cellId + 6;
        } else if (pendingPickResult.actorIndex === 2) {
          globalCellId = pendingPickResult.cellId + 18;
        }

        callbacks.onFacePicked({
          ...pendingPickResult,
          cellId: globalCellId,
        });
        evt.preventDefault();
        evt.stopImmediatePropagation();
        evt.stopPropagation();
      }

      isMouseDown = false;
      didDrag = false;
      pendingPickResult = null;
      mouseDownCanvas = null;
      endOwnedDrag(viewportId, 'orientation-controller');
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

    element.addEventListener('mousemove', hoverHandler, true);
    element.addEventListener('mousedown', clickHandler, true);
    element.addEventListener('mouseup', mouseUpHandler);
    element.addEventListener('mouseleave', mouseUpHandler);
    element.addEventListener('dblclick', dblclickHandler, true);

    const cleanup = () => {
      element.removeEventListener('mousemove', hoverHandler, true);
      element.removeEventListener('mousedown', clickHandler, true);
      element.removeEventListener('mouseup', mouseUpHandler);
      element.removeEventListener('mouseleave', mouseUpHandler);
      element.removeEventListener('dblclick', dblclickHandler, true);
      endOwnedDrag(viewportId, 'orientation-controller');
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
