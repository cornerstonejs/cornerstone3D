import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkAnnotatedCubeActor from '@kitware/vtk.js/Rendering/Core/AnnotatedCubeActor';
import { BaseTool } from './base';
import {
  getEnabledElementByIds,
  getRenderingEngines,
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getToolGroup } from '../store/ToolGroupManager';
import { Events } from '../enums';
import { vec3, mat4, quat } from 'gl-matrix';

/**
 * OrientationControlTool provides an interactive orientation marker
 * in the form of a translucent rhombicuboctahedron with 26 clickable surfaces
 * (6 faces, 8 corners, 12 edges) that can be used to reorient the volume in 3D viewports.
 *
 * @public
 * @class OrientationControlTool
 * @extends BaseTool
 */
class OrientationControlTool extends BaseTool {
  static toolName = 'OrientationControl';

  private markerActors = new Map<string, vtkActor>();
  private annotatedCubeActors = new Map<string, vtkAnnotatedCubeActor>();
  private previousOrientations = new Map<string, quat>(); // Store previous quaternions to prevent flipping
  private pickers = new Map<string, vtkCellPicker>();
  private clickHandlers = new Map<string, (evt: MouseEvent) => void>();
  private dragHandlers = new Map<string, (evt: MouseEvent) => void>();
  private mouseUpHandlers = new Map<string, () => void>();
  private resizeObservers = new Map<string, ResizeObserver>();
  private cameraHandlers = new Map<string, (evt: CustomEvent) => void>();

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        enabled: true,
        opacity: 0.3,
        size: 0.06375, // Relative size of marker (6.375% of viewport, 15% smaller)
        position: 'bottom-right', // Position in viewport
        color: [0.8, 0.8, 0.8],
        hoverColor: [1.0, 0.8, 0.0], // Orange when hovering
        colorScheme: 'rgb', // 'marker', 'rgb', or 'gray'
        keepOrientationUp: true, // If true, marker stays world-aligned. If false, rotates with camera.
        faceColors: {
          topBottom: [255, 0, 0], // Red - faces 0-1 (top/bottom)
          frontBack: [0, 255, 0], // Green - faces 2-3 (front/back)
          leftRight: [255, 255, 0], // Yellow - faces 4-5 (left/right)
          corners: [0, 0, 255], // Blue - faces 6-13 (corner triangles)
          edges: [128, 128, 128], // Grey - faces 14-25 (edge rectangles)
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  // Helper method to get face colors based on color scheme
  private getFaceColors(): {
    topBottom: number[];
    frontBack: number[];
    leftRight: number[];
    corners: number[];
    edges: number[];
  } {
    const colorScheme = this.configuration.colorScheme || 'rgb';

    // If faceColors are explicitly provided, use them
    if (this.configuration.faceColors) {
      return this.configuration.faceColors;
    }

    // Otherwise, derive from color scheme
    switch (colorScheme) {
      case 'marker':
        // OrientationMarkerTool colors
        return {
          topBottom: [0, 0, 255], // Blue #0000ff - Z axis (superior/inferior)
          frontBack: [0, 255, 255], // Cyan #00ffff - Y axis (posterior/anterior)
          leftRight: [255, 255, 0], // Yellow #ffff00 - X axis (left/right)
          corners: [0, 0, 255], // Blue #0000ff - same as Z axis
          edges: [128, 128, 128], // Grey - edges
        };
      case 'gray':
        return {
          topBottom: [180, 180, 180],
          frontBack: [180, 180, 180],
          leftRight: [180, 180, 180],
          corners: [180, 180, 180],
          edges: [180, 180, 180],
        };
      case 'rgb':
      default:
        // RGB scheme (default)
        return {
          topBottom: [255, 0, 0], // Red - faces 0-1 (top/bottom)
          frontBack: [0, 255, 0], // Green - faces 2-3 (front/back)
          leftRight: [255, 255, 0], // Yellow - faces 4-5 (left/right)
          corners: [0, 0, 255], // Blue - faces 6-13 (corner triangles)
          edges: [128, 128, 128], // Grey - faces 14-25 (edge rectangles)
        };
    }
  }

  onSetToolActive = (): void => {
    this._subscribeToViewportEvents();
    this.initViewports();
  };

  onSetToolEnabled = (): void => {
    this._subscribeToViewportEvents();
    this.initViewports();
  };

  onSetToolDisabled = (): void => {
    this.cleanUpData();
    this._unsubscribeToViewportEvents();
  };

  onSetToolInactive = (): void => {
    this.cleanUpData();
    this._unsubscribeToViewportEvents();
  };

  private _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports || [];
  };

  private _subscribeToViewportEvents = (): void => {
    const viewportsInfo = this._getViewportsInfo();

    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      // Only add to volume3d viewports
      if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
        return;
      }

      // For volume3d viewports, element is on the viewport
      const { element } = viewport;

      // Check if element exists
      if (!element) {
        return;
      }

      // Listen for new volumes
      element.addEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        this.initViewports.bind(this)
      );

      // Listen for camera changes to update marker position and orientation
      const cameraHandler = (evt: CustomEvent) => {
        this.onCameraModified(evt);
      };
      element.addEventListener(Enums.Events.CAMERA_MODIFIED, cameraHandler);
      this.cameraHandlers.set(viewportId, cameraHandler);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        setTimeout(() => {
          const element = getEnabledElementByIds(viewportId, renderingEngineId);
          if (!element) {
            return;
          }
          this.updateMarkerPosition(viewportId, renderingEngineId);
          element.viewport.render();
        }, 100);
      });

      resizeObserver.observe(element);
      this.resizeObservers.set(viewportId, resizeObserver);
    });

    eventTarget.addEventListener(Events.TOOLGROUP_VIEWPORT_ADDED, (evt) => {
      if (evt.detail.toolGroupId !== this.toolGroupId) {
        return;
      }
      this._subscribeToViewportEvents();
      this.initViewports();
    });
  };

  private _unsubscribeToViewportEvents = (): void => {
    const viewportsInfo = this._getViewportsInfo();

    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      // Only handle volume3d viewports
      if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
        return;
      }

      const { element } = viewport;

      if (!element) {
        return;
      }

      // Remove camera handler
      const cameraHandler = this.cameraHandlers.get(viewportId);
      if (cameraHandler) {
        element.removeEventListener(
          Enums.Events.CAMERA_MODIFIED,
          cameraHandler
        );
        this.cameraHandlers.delete(viewportId);
      }

      // Remove click handler
      const clickHandler = this.clickHandlers.get(viewportId);
      if (clickHandler && element) {
        element.removeEventListener('mousedown', clickHandler);
        this.clickHandlers.delete(viewportId);
      }

      // Remove drag handler
      const dragHandler = this.dragHandlers.get(viewportId);
      if (dragHandler && element) {
        element.removeEventListener('mousemove', dragHandler);
        this.dragHandlers.delete(viewportId);
      }

      // Remove mouse up handler
      const mouseUpHandler = this.mouseUpHandlers.get(viewportId);
      if (mouseUpHandler && element) {
        element.removeEventListener('mouseup', mouseUpHandler);
        element.removeEventListener('mouseleave', mouseUpHandler);
        this.mouseUpHandlers.delete(viewportId);
      }

      // Remove resize observer
      const resizeObserver = this.resizeObservers.get(viewportId);
      if (resizeObserver) {
        resizeObserver.disconnect();
        this.resizeObservers.delete(viewportId);
      }
    });

    this.resizeObservers.clear();
    this.cameraHandlers.clear();
    this.clickHandlers.clear();
    this.dragHandlers.clear();
    this.mouseUpHandlers.clear();
  };

  private initViewports = (): void => {
    const renderingEngines = getRenderingEngines();
    if (!renderingEngines || renderingEngines.length === 0) {
      return;
    }

    const viewportsInfo = this._getViewportsInfo();

    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      // Only add to volume3d viewports
      if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
        return;
      }

      // Check if marker already exists
      if (this.markerActors.has(viewportId)) {
        return;
      }

      // Wait a bit to ensure volume is loaded and bounds are available
      setTimeout(() => {
        console.log(
          'OrientationControlTool: Attempting to add marker to viewport',
          viewportId
        );
        this.addMarkerToViewport(viewportId, renderingEngineId);
      }, 500); // Increased delay to 500ms
    });
  };

  private createAnnotatedCubeActor(): vtkAnnotatedCubeActor {
    const actor = vtkAnnotatedCubeActor.newInstance();

    // Get face colors based on color scheme
    const faceColors = this.getFaceColors();

    // Convert RGB arrays to hex strings for face colors
    const rgbToHex = (rgb: number[]) => {
      return `#${rgb
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')}`;
    };

    // Use default style matching OrientationMarkerTool
    // Default face color is for Z axis (topBottom)
    const defaultStyle = {
      fontStyle: 'bold',
      fontFamily: 'Arial',
      fontColor: 'black',
      fontSizeScale: (res: number) => res / 2,
      faceColor: rgbToHex(faceColors.topBottom),
      edgeThickness: 0.1,
      edgeColor: 'black',
      resolution: 400,
    };

    actor.setDefaultStyle(defaultStyle);

    // Set face properties with letters matching OrientationMarkerTool (LPS coordinate system)
    // X+ face (Right) -> 'L' (Left) with rotation 90
    actor.setXPlusFaceProperty({
      text: 'L',
      faceColor: rgbToHex(faceColors.leftRight),
      faceRotation: 90,
    });

    // X- face (Left) -> 'R' (Right) with rotation 270
    actor.setXMinusFaceProperty({
      text: 'R',
      faceColor: rgbToHex(faceColors.leftRight),
      faceRotation: 270,
    });

    // Y+ face (Back) -> 'P' (Posterior) with rotation 180
    actor.setYPlusFaceProperty({
      text: 'P',
      faceColor: rgbToHex(faceColors.frontBack),
      fontColor: 'white',
      faceRotation: 180,
    });

    // Y- face (Front) -> 'A' (Anterior)
    actor.setYMinusFaceProperty({
      text: 'A',
      faceColor: rgbToHex(faceColors.frontBack),
      fontColor: 'white',
    });

    // Z+ face (Top) -> 'S' (Superior) - uses default style (topBottom color)
    actor.setZPlusFaceProperty({
      text: 'S',
    });

    // Z- face (Bottom) -> 'I' (Inferior) - uses default style (topBottom color)
    actor.setZMinusFaceProperty({
      text: 'I',
    });

    return actor;
  }

  private createRhombicuboctahedronGeometry(): vtkPolyData {
    // Create a beveled cube (modified rhombicuboctahedron)
    // A rhombicuboctahedron has 24 vertices, 26 faces (8 triangular, 18 square), and 48 edges
    // Using a smaller phi value to make it look more cube-like with beveled edges

    const scale = 0.3;
    const phi = 1.4; // Reduced from 1+√2 (≈2.414) to make faces larger and shape more cube-like
    const faceSize = 0.95; // Make main faces 5% smaller (95% of original size) - balanced size

    // 24 vertices of a rhombicuboctahedron
    const vertices: number[] = [];

    // Group 1: (±faceSize, ±faceSize, ±phi) - 8 vertices forming top/bottom faces
    vertices.push(-faceSize, -faceSize, -phi); // 0
    vertices.push(faceSize, -faceSize, -phi); // 1
    vertices.push(faceSize, faceSize, -phi); // 2
    vertices.push(-faceSize, faceSize, -phi); // 3
    vertices.push(-faceSize, -faceSize, phi); // 4
    vertices.push(faceSize, -faceSize, phi); // 5
    vertices.push(faceSize, faceSize, phi); // 6
    vertices.push(-faceSize, faceSize, phi); // 7

    // Group 2: (±faceSize, ±phi, ±faceSize) - 8 vertices forming front/back faces
    vertices.push(-faceSize, -phi, -faceSize); // 8
    vertices.push(faceSize, -phi, -faceSize); // 9
    vertices.push(faceSize, -phi, faceSize); // 10
    vertices.push(-faceSize, -phi, faceSize); // 11
    vertices.push(-faceSize, phi, -faceSize); // 12
    vertices.push(faceSize, phi, -faceSize); // 13
    vertices.push(faceSize, phi, faceSize); // 14
    vertices.push(-faceSize, phi, faceSize); // 15

    // Group 3: (±phi, ±faceSize, ±faceSize) - 8 vertices forming left/right faces
    vertices.push(-phi, -faceSize, -faceSize); // 16
    vertices.push(-phi, -faceSize, faceSize); // 17
    vertices.push(-phi, faceSize, faceSize); // 18
    vertices.push(-phi, faceSize, -faceSize); // 19
    vertices.push(phi, -faceSize, -faceSize); // 20
    vertices.push(phi, -faceSize, faceSize); // 21
    vertices.push(phi, faceSize, faceSize); // 22
    vertices.push(phi, faceSize, -faceSize); // 23

    // Scale all vertices
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] *= scale;
    }

    // Create polyData
    const polyData = vtkPolyData.newInstance();
    polyData.getPoints().setData(vertices, 3);

    // Generate faces - SKIP the 6 main square faces (0-5), they will be handled by AnnotatedCubeActor
    const faces: number[] = [];

    // Skip the 6 main square faces (0-5) - these will be handled by AnnotatedCubeActor
    // Face 0: Bottom (z = -phi) - SKIPPED
    // Face 1: Top (z = +phi) - SKIPPED
    // Face 2: Front (y = -phi) - SKIPPED
    // Face 3: Back (y = +phi) - SKIPPED
    // Face 4: Left (x = -phi) - SKIPPED
    // Face 5: Right (x = +phi) - SKIPPED

    // 8 triangular corner faces (now indexed as 0-7 instead of 6-13)
    // Corner (-,-,-)
    faces.push(3, 0, 16, 8); // Face 0 (was 6)
    // Corner (+,-,-)
    faces.push(3, 1, 9, 20); // Face 1 (was 7)
    // Corner (+,+,-)
    faces.push(3, 2, 23, 13); // Face 2 (was 8)
    // Corner (-,+,-)
    faces.push(3, 3, 12, 19); // Face 3 (was 9)
    // Corner (-,-,+)
    faces.push(3, 4, 17, 11); // Face 4 (was 10)
    // Corner (+,-,+)
    faces.push(3, 5, 10, 21); // Face 5 (was 11)
    // Corner (+,+,+)
    faces.push(3, 6, 14, 22); // Face 6 (was 12)
    // Corner (-,+,+)
    faces.push(3, 7, 18, 15); // Face 7 (was 13)

    // 12 square edge faces (now indexed as 8-19 instead of 14-25)
    // Edges around bottom face (between bottom and other faces)
    faces.push(4, 0, 1, 9, 8); // Edge 8 (was 14): bottom-front
    faces.push(4, 1, 2, 23, 20); // Edge 9 (was 15): bottom-right
    faces.push(4, 2, 3, 12, 13); // Edge 10 (was 16): bottom-back
    faces.push(4, 3, 0, 16, 19); // Edge 11 (was 17): bottom-left

    // Edges around top face (between top and other faces)
    faces.push(4, 4, 5, 10, 11); // Edge 12 (was 18): top-front
    faces.push(4, 5, 6, 22, 21); // Edge 13 (was 19): top-right
    faces.push(4, 6, 7, 15, 14); // Edge 14 (was 20): top-back
    faces.push(4, 7, 4, 17, 18); // Edge 15 (was 21): top-left

    // Vertical edges (between front/back/left/right faces)
    faces.push(4, 8, 11, 17, 16); // Edge 16 (was 22): front-left
    faces.push(4, 9, 20, 21, 10); // Edge 17 (was 23): front-right
    faces.push(4, 13, 23, 22, 14); // Edge 18 (was 24): back-right
    faces.push(4, 12, 19, 18, 15); // Edge 19 (was 25): back-left

    const cellArray = vtkCellArray.newInstance({
      values: new Uint32Array(faces),
    });

    polyData.setPolys(cellArray);

    // Build links and compute normals for proper rendering
    polyData.buildLinks();

    // Add cell colors: 20 cells total (8 corners + 12 edges)
    const cellColors = new Uint8Array(20 * 3); // RGB for each cell

    // Get colors from configuration using color scheme
    const faceColors = this.getFaceColors();

    const blue = faceColors.corners;
    const grey = faceColors.edges;

    // 8 triangular corner faces: Blue (0-7)
    for (let i = 0; i < 8; i++) {
      cellColors[i * 3] = blue[0];
      cellColors[i * 3 + 1] = blue[1];
      cellColors[i * 3 + 2] = blue[2];
    }

    // 12 rectangular edge faces: Grey (8-19)
    for (let i = 8; i < 20; i++) {
      cellColors[i * 3] = grey[0];
      cellColors[i * 3 + 1] = grey[1];
      cellColors[i * 3 + 2] = grey[2];
    }

    const colorArray = vtkDataArray.newInstance({
      name: 'Colors',
      numberOfComponents: 3,
      values: cellColors,
    });

    polyData.getCellData().setScalars(colorArray);

    // Debug: Log face count
    console.log(
      'OrientationControlTool: Created polyData with',
      polyData.getNumberOfCells(),
      'faces (8 corners + 12 edges)'
    );

    return polyData;
  }

  private getOrientationForSurface(cellId: number): {
    viewPlaneNormal: number[];
    viewUp: number[];
  } | null {
    // Map surfaces to camera orientations
    // 0-7: 8 triangular corner faces (was 6-13)
    // 8-19: 12 rectangular edge faces (was 14-25)
    // Main faces (0-5) are now handled by AnnotatedCubeActor

    const orientations: Map<
      number,
      { viewPlaneNormal: number[]; viewUp: number[] }
    > = new Map();

    // 8 triangular corner faces - diagonal views
    const sqrt3 = 1 / Math.sqrt(3);
    orientations.set(0, {
      viewPlaneNormal: [-sqrt3, -sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, -Y, -Z (was 6)
    orientations.set(1, {
      viewPlaneNormal: [sqrt3, -sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, -Y, -Z (was 7)
    orientations.set(2, {
      viewPlaneNormal: [sqrt3, sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, +Y, -Z (was 8)
    orientations.set(3, {
      viewPlaneNormal: [-sqrt3, sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, +Y, -Z (was 9)
    orientations.set(4, {
      viewPlaneNormal: [-sqrt3, -sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, -Y, +Z (was 10)
    orientations.set(5, {
      viewPlaneNormal: [sqrt3, -sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, -Y, +Z (was 11)
    orientations.set(6, {
      viewPlaneNormal: [sqrt3, sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, +Y, +Z (was 12)
    orientations.set(7, {
      viewPlaneNormal: [-sqrt3, sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, +Y, +Z (was 13)

    // 12 square edge faces - edge views
    const sqrt2 = 1 / Math.sqrt(2);

    // Bottom edges (8-11)
    orientations.set(8, {
      viewPlaneNormal: [0, -sqrt2, -sqrt2],
      viewUp: [0, sqrt2, -sqrt2],
    }); // (was 14)
    orientations.set(9, {
      viewPlaneNormal: [sqrt2, 0, -sqrt2],
      viewUp: [-sqrt2, 0, -sqrt2],
    }); // (was 15)
    orientations.set(10, {
      viewPlaneNormal: [0, sqrt2, -sqrt2],
      viewUp: [0, -sqrt2, -sqrt2],
    }); // (was 16)
    orientations.set(11, {
      viewPlaneNormal: [-sqrt2, 0, -sqrt2],
      viewUp: [sqrt2, 0, -sqrt2],
    }); // (was 17)

    // Top edges (12-15)
    orientations.set(12, {
      viewPlaneNormal: [0, -sqrt2, sqrt2],
      viewUp: [0, sqrt2, sqrt2],
    }); // (was 18)
    orientations.set(13, {
      viewPlaneNormal: [sqrt2, 0, sqrt2],
      viewUp: [sqrt2, 0, -sqrt2],
    }); // (was 19)
    orientations.set(14, {
      viewPlaneNormal: [0, sqrt2, sqrt2],
      viewUp: [0, -sqrt2, sqrt2],
    }); // (was 20)
    orientations.set(15, {
      viewPlaneNormal: [-sqrt2, 0, sqrt2],
      viewUp: [-sqrt2, 0, -sqrt2],
    }); // (was 21)

    // Vertical edges (16-19)
    orientations.set(16, {
      viewPlaneNormal: [-sqrt2, -sqrt2, 0],
      viewUp: [0, 0, 1],
    }); // (was 22)
    orientations.set(17, {
      viewPlaneNormal: [sqrt2, -sqrt2, 0],
      viewUp: [0, 0, 1],
    }); // (was 23)
    orientations.set(18, {
      viewPlaneNormal: [sqrt2, sqrt2, 0],
      viewUp: [0, 0, 1],
    }); // (was 24)
    orientations.set(19, {
      viewPlaneNormal: [-sqrt2, sqrt2, 0],
      viewUp: [0, 0, 1],
    }); // (was 25)

    return orientations.get(cellId) || null;
  }

  private getSurfaceLabel(cellId: number): string {
    // 0-7: corner faces, 8-19: edge faces
    const labels: Record<number, string> = {
      // 0-7: corner faces
      0: 'Corner (-X,-Y,-Z)',
      1: 'Corner (+X,-Y,-Z)',
      2: 'Corner (+X,+Y,-Z)',
      3: 'Corner (-X,+Y,-Z)',
      4: 'Corner (-X,-Y,+Z)',
      5: 'Corner (+X,-Y,+Z)',
      6: 'Corner (+X,+Y,+Z)',
      7: 'Corner (-X,+Y,+Z)',
      // 8-19: edge faces
      8: 'Edge (Bottom-Front)',
      9: 'Edge (Bottom-Right)',
      10: 'Edge (Bottom-Back)',
      11: 'Edge (Bottom-Left)',
      12: 'Edge (Top-Front)',
      13: 'Edge (Top-Right)',
      14: 'Edge (Top-Back)',
      15: 'Edge (Top-Left)',
      16: 'Edge (Front-Left)',
      17: 'Edge (Front-Right)',
      18: 'Edge (Back-Right)',
      19: 'Edge (Back-Left)',
    };

    return labels[cellId] ?? `Face ${cellId}: (Unknown)`;
  }

  private addMarkerToViewport(
    viewportId: string,
    renderingEngineId: string
  ): void {
    console.log(
      'OrientationControlTool: addMarkerToViewport called for',
      viewportId
    );
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );

    if (!enabledElement) {
      console.warn(
        'OrientationControlTool: enabledElement not found for',
        viewportId
      );
      return;
    }

    const { viewport } = enabledElement;
    console.log(
      'OrientationControlTool: viewport type:',
      viewport?.type,
      'expected:',
      Enums.ViewportType.VOLUME_3D
    );

    if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
      console.warn(
        'OrientationControlTool: viewport is not VOLUME_3D, it is:',
        viewport.type
      );
      return;
    }

    // For volume3d viewports, element is on the viewport
    const { element } = viewport;

    if (!element) {
      console.warn(
        'OrientationControlTool: element is null/undefined on viewport'
      );
      return;
    }

    console.log('OrientationControlTool: Creating marker geometry...');

    // Create AnnotatedCubeActor for the 6 main faces
    const cubeActor = this.createAnnotatedCubeActor();

    // Create geometry for corners and edges only
    const polyData = this.createRhombicuboctahedronGeometry();

    // Create mapper for corners/edges
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setScalarModeToUseCellData();
    mapper.setColorModeToDirectScalars();

    // Create actor for corners/edges
    const cornersActor = vtkActor.newInstance();
    cornersActor.setMapper(mapper);

    const property = cornersActor.getProperty();
    property.setOpacity(1.0);
    property.setRepresentationToSurface();
    property.setEdgeVisibility(false);
    property.setBackfaceCulling(false);
    property.setFrontfaceCulling(false);
    cornersActor.setVisibility(true);

    // Add both actors to viewport
    // Add cube actor first so it renders behind, then corners/edges on top
    const cornersActorUID = `orientation-control-corners-${viewportId}`;
    const cubeActorUID = `orientation-control-cube-${viewportId}`;

    viewport.addActor({ actor: cubeActor, uid: cubeActorUID });
    viewport.addActor({ actor: cornersActor, uid: cornersActorUID });

    this.markerActors.set(viewportId, cornersActor);
    this.annotatedCubeActors.set(viewportId, cubeActor);

    // Position both markers
    const positioned = this.positionMarkerInViewport(
      viewport as Types.IVolumeViewport,
      cornersActor,
      cubeActor
    );

    if (!positioned) {
      console.warn(
        'OrientationControlTool: Could not position marker, bounds not available'
      );
      setTimeout(() => {
        const repositioned = this.positionMarkerInViewport(
          viewport as Types.IVolumeViewport,
          cornersActor,
          cubeActor
        );
        if (repositioned) {
          viewport.render();
        }
      }, 1000);
    } else {
      console.log(
        'OrientationControlTool: Marker added and positioned to viewport',
        viewportId
      );
    }

    // Setup picker - add both actors
    const picker = vtkCellPicker.newInstance({ opacityThreshold: 0.0001 });
    picker.setPickFromList(true);
    picker.setTolerance(0.001);
    picker.initializePickList();
    picker.addPickList(cornersActor);
    picker.addPickList(cubeActor);
    this.pickers.set(viewportId, picker);

    // Setup click handler - pass both actors
    this.setupClickHandler(
      viewportId,
      renderingEngineId,
      element,
      cornersActor,
      cubeActor
    );

    viewport.render();
  }

  private positionMarkerInViewport(
    viewport: Types.IVolumeViewport,
    cornersActor: vtkActor,
    cubeActor: vtkAnnotatedCubeActor
  ): boolean {
    // Get viewport bounds for size calculation
    const bounds = viewport.getBounds();
    if (!bounds || bounds.length < 6) {
      console.warn('OrientationControlTool: Bounds not available yet');
      return false;
    }

    const size = this.configuration.size || 0.06375;
    const position = this.configuration.position || 'bottom-right';

    // Calculate marker size based on viewport bounds
    const diagonal = Math.sqrt(
      Math.pow(bounds[1] - bounds[0], 2) +
        Math.pow(bounds[3] - bounds[2], 2) +
        Math.pow(bounds[5] - bounds[4], 2)
    );
    const markerSize = diagonal * size;

    // Scale both actors
    // The corners/edges geometry has a scale factor of 0.3 applied to vertices,
    // and main faces are at ±faceSize (0.95) * scale = ±0.285.
    // The AnnotatedCubeActor is a unit cube from -1 to 1 (2 units wide).
    // To match the main face size, scale cube by: scale * faceSize = 0.3 * 0.95 = 0.285
    // Make it bigger to fill the black square border: 0.285 * 2.33521875 = 0.6655 (50% bigger twice, then 15% more, then 5% less, then 5% less)
    const geometryScale = 0.3; // Match the scale used in geometry creation
    const faceSize = 0.95; // Match the faceSize used in geometry creation
    const cubeScaleFactor = geometryScale * faceSize * 2.33521875; // 0.285 * 2.33521875 = 0.6655
    cornersActor.setScale(markerSize, markerSize, markerSize);
    cubeActor.setScale(
      markerSize * cubeScaleFactor,
      markerSize * cubeScaleFactor,
      markerSize * cubeScaleFactor
    );

    // Position both actors at the same location
    const worldPos = this.getMarkerPositionInScreenSpace(viewport, position);
    if (!worldPos) {
      return false;
    }
    cornersActor.setPosition(worldPos[0], worldPos[1], worldPos[2]);
    cubeActor.setPosition(worldPos[0], worldPos[1], worldPos[2]);

    // Update marker orientation to match camera (so it rotates with the view)
    this.updateMarkerOrientation(viewport, cornersActor, cubeActor);

    return true;
  }

  private getMarkerPositionInScreenSpace(
    viewport: Types.IVolumeViewport,
    position: string
  ): [number, number, number] | null {
    // Get canvas dimensions
    const canvas = viewport.canvas;
    if (!canvas) {
      return null;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Define fixed screen position (in canvas pixels, closer to corner)
    const cornerOffset = 35; // pixels from corner
    let canvasX = 0;
    let canvasY = 0;

    switch (position) {
      case 'bottom-right':
        canvasX = canvasWidth - cornerOffset;
        canvasY = canvasHeight - cornerOffset;
        break;
      case 'bottom-left':
        canvasX = cornerOffset;
        canvasY = canvasHeight - cornerOffset;
        break;
      case 'top-right':
        canvasX = canvasWidth - cornerOffset;
        canvasY = cornerOffset;
        break;
      case 'top-left':
        canvasX = cornerOffset;
        canvasY = cornerOffset;
        break;
      default:
        canvasX = canvasWidth - cornerOffset;
        canvasY = canvasHeight - cornerOffset;
    }

    // Convert canvas coordinates to world coordinates
    // This ensures the marker stays in the same screen position
    const canvasPos: Types.Point2 = [canvasX, canvasY];
    const worldPos = viewport.canvasToWorld(canvasPos);

    return [worldPos[0], worldPos[1], worldPos[2]];
  }

  private updateMarkerOrientation(
    viewport: Types.IVolumeViewport,
    cornersActor: vtkActor,
    cubeActor: vtkAnnotatedCubeActor
  ): void {
    const keepOrientationUp = this.configuration.keepOrientationUp !== false; // Default to true

    if (keepOrientationUp) {
      // Keep the marker in world-aligned orientation (no rotation).
      // This allows it to naturally show the world axes as the camera rotates.
      cornersActor.setOrientation(0, 0, 0);
      cubeActor.setOrientation(0, 0, 0);
      // Clear previous orientation when keeping world-aligned
      const viewportId = viewport.id;
      this.previousOrientations.delete(viewportId);
    } else {
      // Rotate marker with camera - keep it screen-aligned (billboard effect)
      // Get camera orientation
      const camera = viewport.getCamera();
      const viewPlaneNormal = camera.viewPlaneNormal;
      const viewUp = camera.viewUp;

      // Calculate the rotation needed to align marker with camera
      // We want the marker's forward to point along -viewPlaneNormal (toward camera)
      // and its up to align with viewUp
      const forward = vec3.fromValues(
        -viewPlaneNormal[0],
        -viewPlaneNormal[1],
        -viewPlaneNormal[2]
      );
      vec3.normalize(forward, forward);

      const up = vec3.fromValues(viewUp[0], viewUp[1], viewUp[2]);
      vec3.normalize(up, up);

      // Calculate right vector
      const right = vec3.create();
      vec3.cross(right, forward, up);
      vec3.normalize(right, right);

      // Recalculate up to ensure orthogonality
      vec3.cross(up, right, forward);
      vec3.normalize(up, up);

      // Build rotation matrix (column-major for VTK)
      const rotationMatrix = mat4.create();
      // First column: right vector
      rotationMatrix[0] = right[0];
      rotationMatrix[1] = right[1];
      rotationMatrix[2] = right[2];
      rotationMatrix[3] = 0;
      // Second column: up vector
      rotationMatrix[4] = up[0];
      rotationMatrix[5] = up[1];
      rotationMatrix[6] = up[2];
      rotationMatrix[7] = 0;
      // Third column: forward vector (negated to point toward camera)
      rotationMatrix[8] = -forward[0];
      rotationMatrix[9] = -forward[1];
      rotationMatrix[10] = -forward[2];
      rotationMatrix[11] = 0;
      // Fourth column: translation (identity)
      rotationMatrix[12] = 0;
      rotationMatrix[13] = 0;
      rotationMatrix[14] = 0;
      rotationMatrix[15] = 1;

      // Convert to quaternion
      const currentQuat = quat.create();
      mat4.getRotation(currentQuat, rotationMatrix);

      // Get previous quaternion for this viewport
      const viewportId = viewport.id;
      const previousQuat = this.previousOrientations.get(viewportId);

      // If we have a previous orientation, ensure we take the shortest path
      if (previousQuat) {
        const dot = quat.dot(previousQuat, currentQuat);
        // If dot product is negative, quaternions represent opposite rotations
        // Negate one to take the shorter path
        if (dot < 0) {
          quat.scale(currentQuat, currentQuat, -1);
        }
      }

      // Store current quaternion for next time
      this.previousOrientations.set(viewportId, quat.clone(currentQuat));

      // Convert to Euler angles
      const euler = this.quaternionToEulerXYZ(currentQuat);

      // Convert from radians to degrees
      const eulerDegrees = [
        (euler[0] * 180) / Math.PI,
        (euler[1] * 180) / Math.PI,
        (euler[2] * 180) / Math.PI,
      ];

      cornersActor.setOrientation(
        eulerDegrees[0],
        eulerDegrees[1],
        eulerDegrees[2]
      );
      cubeActor.setOrientation(
        eulerDegrees[0],
        eulerDegrees[1],
        eulerDegrees[2]
      );
    }
  }

  private quaternionToEulerXYZ(q: quat): [number, number, number] {
    const x = q[0];
    const y = q[1];
    const z = q[2];
    const w = q[3];

    const sinrCosp = 2 * (w * x + y * z);
    const cosrCosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinrCosp, cosrCosp);

    const sinp = 2 * (w * y - z * x);
    const pitch =
      Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

    const sinyCosp = 2 * (w * z + x * y);
    const cosyCosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(sinyCosp, cosyCosp);

    return [roll, pitch, yaw];
  }

  private onCameraModified = (evt: CustomEvent): void => {
    const { viewportId } = evt.detail as { viewportId: string };
    if (!viewportId) {
      return;
    }

    const cornersActor = this.markerActors.get(viewportId);
    const cubeActor = this.annotatedCubeActors.get(viewportId);

    if (!cornersActor || !cubeActor) {
      return;
    }

    const viewportsInfo = this._getViewportsInfo();
    const viewportInfo = viewportsInfo.find(
      (vp) => vp.viewportId === viewportId
    );

    if (!viewportInfo) {
      return;
    }

    const enabledElement = getEnabledElementByIds(
      viewportId,
      viewportInfo.renderingEngineId
    );

    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;
    if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
      return;
    }

    // Update marker position (to stay in fixed screen space) and orientation
    this.positionMarkerInViewport(
      viewport as Types.IVolumeViewport,
      cornersActor,
      cubeActor
    );
  };

  private updateMarkerPosition(
    viewportId: string,
    renderingEngineId: string
  ): void {
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );

    if (!enabledElement) {
      return;
    }

    const cornersActor = this.markerActors.get(viewportId);
    const cubeActor = this.annotatedCubeActors.get(viewportId);

    if (!cornersActor || !cubeActor) {
      return;
    }

    const { viewport } = enabledElement;
    if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
      return;
    }

    this.positionMarkerInViewport(
      viewport as Types.IVolumeViewport,
      cornersActor,
      cubeActor
    );
  }

  private animateCameraToOrientation(
    viewport: Types.IVolumeViewport,
    targetViewPlaneNormal: number[],
    targetViewUp: number[]
  ): void {
    const camera = viewport.getVtkActiveCamera();
    const directionOfProjection = camera.getDirectionOfProjection();
    const startViewUpArray = camera.getViewUp();

    // Build rotation matrices from camera orientations
    // Start orientation matrix
    // Note: DirectionOfProjection points FROM camera TO scene,
    // but viewPlaneNormal points FROM scene TO camera, so we negate
    const startForward = vec3.fromValues(
      -directionOfProjection[0],
      -directionOfProjection[1],
      -directionOfProjection[2]
    );
    const startUp = vec3.fromValues(
      startViewUpArray[0],
      startViewUpArray[1],
      startViewUpArray[2]
    );
    const startRight = vec3.create();
    vec3.cross(startRight, startUp, startForward);
    vec3.normalize(startRight, startRight);

    const startMatrix = mat4.create();
    startMatrix[0] = startRight[0];
    startMatrix[1] = startRight[1];
    startMatrix[2] = startRight[2];
    startMatrix[4] = startUp[0];
    startMatrix[5] = startUp[1];
    startMatrix[6] = startUp[2];
    startMatrix[8] = startForward[0];
    startMatrix[9] = startForward[1];
    startMatrix[10] = startForward[2];
    startMatrix[15] = 1;

    // Target orientation matrix
    const targetForward = vec3.fromValues(
      targetViewPlaneNormal[0],
      targetViewPlaneNormal[1],
      targetViewPlaneNormal[2]
    );
    const targetUp = vec3.fromValues(
      targetViewUp[0],
      targetViewUp[1],
      targetViewUp[2]
    );
    const targetRight = vec3.create();
    vec3.cross(targetRight, targetUp, targetForward);
    vec3.normalize(targetRight, targetRight);

    const targetMatrix = mat4.create();
    targetMatrix[0] = targetRight[0];
    targetMatrix[1] = targetRight[1];
    targetMatrix[2] = targetRight[2];
    targetMatrix[4] = targetUp[0];
    targetMatrix[5] = targetUp[1];
    targetMatrix[6] = targetUp[2];
    targetMatrix[8] = targetForward[0];
    targetMatrix[9] = targetForward[1];
    targetMatrix[10] = targetForward[2];
    targetMatrix[15] = 1;

    // Convert matrices to quaternions
    const startQuat = quat.create();
    const targetQuat = quat.create();
    mat4.getRotation(startQuat, startMatrix);
    mat4.getRotation(targetQuat, targetMatrix);

    // Ensure we take the shortest path (handle quaternion double-cover)
    let dotProduct = quat.dot(startQuat, targetQuat);
    if (dotProduct < 0) {
      // Negate target quaternion to take shorter path
      targetQuat[0] = -targetQuat[0];
      targetQuat[1] = -targetQuat[1];
      targetQuat[2] = -targetQuat[2];
      targetQuat[3] = -targetQuat[3];
      dotProduct = -dotProduct;
    }

    // Check if orientations are already very close (avoid unnecessary rotation)
    const threshold = 0.99996; // ~1 degrees difference
    console.log('Quaternion dot product:', dotProduct, 'threshold:', threshold);
    if (dotProduct > threshold) {
      console.log('Skipping animation - already at target orientation');
      // Already at target orientation, no animation needed
      return;
    }

    const steps = 10;
    const duration = 300; // milliseconds
    const stepDuration = duration / steps;
    let currentStep = 0;

    const animate = () => {
      currentStep++;
      const t = currentStep / steps;

      // Use ease-in-out interpolation for smoother animation
      const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // Use SLERP (spherical linear interpolation) for shortest path rotation
      const interpolatedQuat = quat.create();
      quat.slerp(interpolatedQuat, startQuat, targetQuat, easedT);

      // Convert quaternion back to rotation matrix
      const interpolatedMatrix = mat4.create();
      mat4.fromQuat(interpolatedMatrix, interpolatedQuat);

      // Extract viewPlaneNormal and viewUp from the matrix
      const interpolatedForward = vec3.fromValues(
        interpolatedMatrix[8],
        interpolatedMatrix[9],
        interpolatedMatrix[10]
      );
      const interpolatedUp = vec3.fromValues(
        interpolatedMatrix[4],
        interpolatedMatrix[5],
        interpolatedMatrix[6]
      );

      // Set camera orientation
      viewport.setCamera({
        viewPlaneNormal: Array.from(interpolatedForward) as [
          number,
          number,
          number,
        ],
        viewUp: Array.from(interpolatedUp) as [number, number, number],
      });
      viewport.resetCamera();
      viewport.render();

      // Continue animation or finish
      if (currentStep < steps) {
        setTimeout(animate, stepDuration);
      }
    };

    // Start animation
    animate();
  }

  private setupClickHandler(
    viewportId: string,
    renderingEngineId: string,
    element: HTMLDivElement,
    cornersActor: vtkActor,
    cubeActor: vtkAnnotatedCubeActor
  ): void {
    let isMouseDown = false;

    const clickHandler = (evt: MouseEvent) => {
      // Only handle left clicks
      if (evt.button !== 0) {
        return;
      }

      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
        return;
      }

      const picker = this.pickers.get(viewportId);
      if (!picker) {
        return;
      }

      // Get mouse position relative to element
      const rect = element.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;

      // Convert to VTK display coordinates
      const displayCoords = (
        viewport as Types.IVolumeViewport
      ).getVtkDisplayCoords([x, y]);

      // Pick
      picker.pick(displayCoords, viewport.getRenderer());

      const pickedActors = picker.getActors();
      if (pickedActors.length === 0) {
        return;
      }

      const pickedActor = pickedActors[0];
      const cellId = picker.getCellId();

      isMouseDown = true;

      // Handle clicks on cube actor (main faces)
      if (pickedActor === cubeActor) {
        // Get the picked position to determine which face was clicked
        const pickedPositions = picker.getPickedPositions();
        if (pickedPositions && pickedPositions.length > 0) {
          const pickedPoint = pickedPositions[0];

          // Get the cube actor's position (center)
          const cubePosition = cubeActor.getPosition();

          // Calculate the direction from cube center to picked point
          const direction = [
            pickedPoint[0] - cubePosition[0],
            pickedPoint[1] - cubePosition[1],
            pickedPoint[2] - cubePosition[2],
          ];

          // Normalize the direction
          const length = Math.sqrt(
            direction[0] * direction[0] +
              direction[1] * direction[1] +
              direction[2] * direction[2]
          );

          if (length > 0) {
            const normalizedDir = [
              direction[0] / length,
              direction[1] / length,
              direction[2] / length,
            ];

            // Determine which face was clicked based on the dominant axis
            // Find the axis with the largest absolute value
            const absX = Math.abs(normalizedDir[0]);
            const absY = Math.abs(normalizedDir[1]);
            const absZ = Math.abs(normalizedDir[2]);

            let viewPlaneNormal: number[];
            let viewUp: number[];

            if (absX >= absY && absX >= absZ) {
              // X axis face
              if (normalizedDir[0] > 0) {
                // X+ face (Right)
                viewPlaneNormal = [1, 0, 0];
                viewUp = [0, 0, 1];
              } else {
                // X- face (Left)
                viewPlaneNormal = [-1, 0, 0];
                viewUp = [0, 0, 1];
              }
            } else if (absY >= absX && absY >= absZ) {
              // Y axis face
              if (normalizedDir[1] > 0) {
                // Y+ face (Back)
                viewPlaneNormal = [0, 1, 0];
                viewUp = [0, 0, 1];
              } else {
                // Y- face (Front)
                viewPlaneNormal = [0, -1, 0];
                viewUp = [0, 0, 1];
              }
            } else {
              // Z axis face
              if (normalizedDir[2] > 0) {
                // Z+ face (Top)
                viewPlaneNormal = [0, 0, 1];
                viewUp = [0, -1, 0];
              } else {
                // Z- face (Bottom)
                viewPlaneNormal = [0, 0, -1];
                viewUp = [0, -1, 0];
              }
            }

            // Animate camera to the clicked face orientation
            this.animateCameraToOrientation(
              viewport as Types.IVolumeViewport,
              viewPlaneNormal,
              viewUp
            );
          }
        }

        evt.preventDefault();
        evt.stopPropagation();
        return;
      }

      // Handle clicks on corners/edges actor
      if (pickedActor === cornersActor && cellId !== -1) {
        const label = this.getSurfaceLabel(cellId);
        console.info(
          'OrientationControlTool: Clicked surface',
          cellId,
          '-',
          label
        );

        const orientation = this.getOrientationForSurface(cellId);
        if (orientation) {
          this.animateCameraToOrientation(
            viewport as Types.IVolumeViewport,
            orientation.viewPlaneNormal,
            orientation.viewUp
          );
        }

        evt.preventDefault();
        evt.stopPropagation();
      }
    };

    // Handle mouse move to detect dragging
    const dragHandler = (evt: MouseEvent) => {
      if (!isMouseDown) {
        return;
      }

      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
        return;
      }

      const picker = this.pickers.get(viewportId);
      if (!picker) {
        return;
      }

      // Get mouse position relative to element
      const rect = element.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;

      // Convert to VTK display coordinates
      const displayCoords = (
        viewport as Types.IVolumeViewport
      ).getVtkDisplayCoords([x, y]);

      // Pick
      picker.pick(displayCoords, viewport.getRenderer());

      // Check if we're still over the marker actors
      const pickedActors = picker.getActors();
      if (pickedActors.length > 0) {
        const pickedActor = pickedActors[0];
        if (pickedActor === cornersActor) {
          const cellId = picker.getCellId();
          if (cellId !== -1) {
            const label = this.getSurfaceLabel(cellId);
            console.log(
              'OrientationControlTool: Dragging over control - surface',
              cellId,
              '-',
              label
            );
          }
        } else if (pickedActor === cubeActor) {
          console.log('OrientationControlTool: Dragging over cube face');
        }
      }
    };

    // Handle mouse up to stop drag detection
    const mouseUpHandler = () => {
      isMouseDown = false;
    };

    element.addEventListener('mousedown', clickHandler);
    element.addEventListener('mousemove', dragHandler);
    element.addEventListener('mouseup', mouseUpHandler);
    element.addEventListener('mouseleave', mouseUpHandler);

    this.clickHandlers.set(viewportId, clickHandler);
    this.dragHandlers.set(viewportId, dragHandler);
    this.mouseUpHandlers.set(viewportId, mouseUpHandler);
  }

  private cleanUpData = (): void => {
    const renderingEngines = getRenderingEngines();
    if (!renderingEngines || renderingEngines.length === 0) {
      return;
    }

    this.markerActors.forEach((actor, viewportId) => {
      const viewportsInfo = this._getViewportsInfo();
      const viewportInfo = viewportsInfo.find(
        (vp) => vp.viewportId === viewportId
      );

      if (viewportInfo) {
        const enabledElement = getEnabledElementByIds(
          viewportId,
          viewportInfo.renderingEngineId
        );

        if (enabledElement) {
          const { viewport } = enabledElement;

          // For volume3d viewports, element is on the viewport
          const element =
            viewport.type === Enums.ViewportType.VOLUME_3D
              ? (viewport as Types.IVolumeViewport).element
              : enabledElement.element;

          // Only remove event listeners if element exists
          if (element) {
            // Remove click handler
            const clickHandler = this.clickHandlers.get(viewportId);
            if (clickHandler) {
              element.removeEventListener('mousedown', clickHandler);
              this.clickHandlers.delete(viewportId);
            }

            // Remove drag handler
            const dragHandler = this.dragHandlers.get(viewportId);
            if (dragHandler) {
              element.removeEventListener('mousemove', dragHandler);
              this.dragHandlers.delete(viewportId);
            }

            // Remove mouse up handler
            const mouseUpHandler = this.mouseUpHandlers.get(viewportId);
            if (mouseUpHandler) {
              element.removeEventListener('mouseup', mouseUpHandler);
              element.removeEventListener('mouseleave', mouseUpHandler);
              this.mouseUpHandlers.delete(viewportId);
            }

            // Remove camera handler
            const cameraHandler = this.cameraHandlers.get(viewportId);
            if (cameraHandler) {
              element.removeEventListener(
                Enums.Events.CAMERA_MODIFIED,
                cameraHandler
              );
              this.cameraHandlers.delete(viewportId);
            }
          }

          // Remove actors
          if (viewport && typeof viewport.removeActors === 'function') {
            viewport.removeActors([
              `orientation-control-corners-${viewportId}`,
              `orientation-control-cube-${viewportId}`,
            ]);
          }
          actor.delete();
        }
      }
    });

    this.annotatedCubeActors.forEach((actor, viewportId) => {
      actor.delete();
    });

    this.markerActors.clear();
    this.annotatedCubeActors.clear();
    this.previousOrientations.clear();
    this.pickers.clear();
    this.clickHandlers.clear();
    this.dragHandlers.clear();
    this.mouseUpHandlers.clear();
    this.cameraHandlers.clear();
  };
}

OrientationControlTool.toolName = 'OrientationControl';
export default OrientationControlTool;
