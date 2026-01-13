import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { BaseTool } from './base';
import {
  getEnabledElementByIds,
  getRenderingEngines,
  Enums,
  Types,
  eventTarget,
} from '@cornerstonejs/core';
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
  private pickers = new Map<string, vtkCellPicker>();
  private clickHandlers = new Map<string, (evt: MouseEvent) => void>();
  private resizeObservers = new Map<string, ResizeObserver>();
  private cameraHandlers = new Map<string, (evt: CustomEvent) => void>();

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        enabled: true,
        opacity: 1,
        size: 0.06375, // Relative size of marker (6.375% of viewport, 15% smaller)
        position: 'bottom-right', // Position in viewport
        color: [0.8, 0.8, 0.8],
        hoverColor: [1.0, 0.8, 0.0], // Orange when hovering
        faceColors: {
          topBottom: [255, 0, 0], // Red - faces 0-1 (top/bottom)
          frontBack: [0, 255, 0], // Green - faces 2-3 (front/back)
          leftRight: [255, 255, 0], // Yellow - faces 4-5 (left/right)
          corners: [0, 0, 255], // Blue - faces 6-13 (corner triangles)
          edges: [200, 100, 255], // Light purple/magenta - faces 14-25 (edge rectangles)
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
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
      if (clickHandler) {
        element.removeEventListener('mousedown', clickHandler);
        this.clickHandlers.delete(viewportId);
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

    // Generate 26 faces
    const faces: number[] = [];

    // 6 large square faces on main axes
    // Face 0: Bottom (z = -phi)
    faces.push(4, 0, 3, 2, 1);
    // Face 1: Top (z = +phi)
    faces.push(4, 4, 5, 6, 7);
    // Face 2: Front (y = -phi)
    faces.push(4, 8, 11, 10, 9);
    // Face 3: Back (y = +phi)
    faces.push(4, 12, 13, 14, 15);
    // Face 4: Left (x = -phi)
    faces.push(4, 16, 19, 18, 17);
    // Face 5: Right (x = +phi)
    faces.push(4, 20, 21, 22, 23);

    // 8 triangular corner faces
    // Corner (-,-,-)
    faces.push(3, 0, 16, 8); // Face 6
    // Corner (+,-,-)
    faces.push(3, 1, 9, 20); // Face 7
    // Corner (+,+,-)
    faces.push(3, 2, 23, 13); // Face 8
    // Corner (-,+,-)
    faces.push(3, 3, 12, 19); // Face 9
    // Corner (-,-,+)
    faces.push(3, 4, 17, 11); // Face 10
    // Corner (+,-,+)
    faces.push(3, 5, 10, 21); // Face 11
    // Corner (+,+,+)
    faces.push(3, 6, 14, 22); // Face 12
    // Corner (-,+,+)
    faces.push(3, 7, 18, 15); // Face 13

    // 12 square edge faces - carefully selected 4-vertex quads
    // Edges around bottom face (between bottom and other faces)
    faces.push(4, 0, 1, 9, 8); // Edge 14: bottom-front
    faces.push(4, 1, 2, 23, 20); // Edge 15: bottom-right
    faces.push(4, 2, 3, 12, 13); // Edge 16: bottom-back
    faces.push(4, 3, 0, 16, 19); // Edge 17: bottom-left

    // Edges around top face (between top and other faces)
    faces.push(4, 4, 5, 10, 11); // Edge 18: top-front
    faces.push(4, 5, 6, 22, 21); // Edge 19: top-right
    faces.push(4, 6, 7, 15, 14); // Edge 20: top-back
    faces.push(4, 7, 4, 17, 18); // Edge 21: top-left

    // Vertical edges (between front/back/left/right faces)
    faces.push(4, 8, 11, 17, 16); // Edge 22: front-left
    faces.push(4, 9, 20, 21, 10); // Edge 23: front-right
    faces.push(4, 13, 23, 22, 14); // Edge 24: back-right
    faces.push(4, 12, 19, 18, 15); // Edge 25: back-left

    const cellArray = vtkCellArray.newInstance({
      values: new Uint32Array(faces),
    });

    polyData.setPolys(cellArray);

    // Build links and compute normals for proper rendering
    polyData.buildLinks();

    // Add cell colors: 26 cells total
    // Faces 0-5: 6 square faces - Red, Yellow, Green (2 each)
    // Faces 6-13: 8 triangular corner faces - Blue
    // Faces 14-25: 12 rectangular edge faces - Grey
    const cellColors = new Uint8Array(26 * 3); // RGB for each cell

    // Get colors from configuration (RGB 0-255)
    const faceColors = this.configuration.faceColors || {
      topBottom: [255, 0, 0],
      frontBack: [0, 255, 0],
      leftRight: [255, 255, 0],
      corners: [0, 0, 255],
      edges: [200, 100, 255], // Light purple/magenta
    };

    const red = faceColors.topBottom;
    const green = faceColors.frontBack;
    const yellow = faceColors.leftRight;
    const blue = faceColors.corners;
    const grey = faceColors.edges;

    // 6 square faces: Red (0-1), Green (2-3), Yellow (4-5)
    for (let i = 0; i < 2; i++) {
      cellColors[i * 3] = red[0];
      cellColors[i * 3 + 1] = red[1];
      cellColors[i * 3 + 2] = red[2];
    }
    for (let i = 2; i < 4; i++) {
      cellColors[i * 3] = green[0];
      cellColors[i * 3 + 1] = green[1];
      cellColors[i * 3 + 2] = green[2];
    }
    for (let i = 4; i < 6; i++) {
      cellColors[i * 3] = yellow[0];
      cellColors[i * 3 + 1] = yellow[1];
      cellColors[i * 3 + 2] = yellow[2];
    }

    // 8 triangular corner faces: Blue (6-13)
    for (let i = 6; i < 14; i++) {
      cellColors[i * 3] = blue[0];
      cellColors[i * 3 + 1] = blue[1];
      cellColors[i * 3 + 2] = blue[2];
    }

    // 12 rectangular edge faces: Grey (14-25)
    for (let i = 14; i < 26; i++) {
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
      'faces'
    );
    console.log(
      'OrientationControlTool: Face types - 6 main squares (0-5), 8 triangular corners (6-13), 12 edge squares (14-25)'
    );
    console.log(
      'OrientationControlTool: Colors - Red top/bottom (0-1), Green front/back (2-3), Yellow left/right (4-5), Blue corners (6-13), Grey edges (14-25)'
    );

    return polyData;
  }

  private getOrientationForSurface(cellId: number): {
    viewPlaneNormal: number[];
    viewUp: number[];
  } | null {
    // Map each of the 26 surfaces to camera orientations
    // 0-5: 6 square faces (main axes)
    // 6-13: 8 triangular corner faces
    // 14-25: 12 rectangular edge faces

    const orientations: Map<
      number,
      { viewPlaneNormal: number[]; viewUp: number[] }
    > = new Map();

    // 6 square faces - main axes
    orientations.set(0, { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] }); // Bottom
    orientations.set(1, { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] }); // Top
    orientations.set(2, { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] }); // Front
    orientations.set(3, { viewPlaneNormal: [0, 1, 0], viewUp: [0, 0, 1] }); // Back
    orientations.set(4, { viewPlaneNormal: [-1, 0, 0], viewUp: [0, 0, 1] }); // Left
    orientations.set(5, { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] }); // Right

    // 8 triangular corner faces - diagonal views
    const sqrt3 = 1 / Math.sqrt(3);
    orientations.set(6, {
      viewPlaneNormal: [-sqrt3, -sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, -Y, -Z
    orientations.set(7, {
      viewPlaneNormal: [sqrt3, -sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, -Y, -Z
    orientations.set(8, {
      viewPlaneNormal: [sqrt3, sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, +Y, -Z
    orientations.set(9, {
      viewPlaneNormal: [-sqrt3, sqrt3, -sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, +Y, -Z
    orientations.set(10, {
      viewPlaneNormal: [-sqrt3, -sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, -Y, +Z
    orientations.set(11, {
      viewPlaneNormal: [sqrt3, -sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, -Y, +Z
    orientations.set(12, {
      viewPlaneNormal: [sqrt3, sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // +X, +Y, +Z
    orientations.set(13, {
      viewPlaneNormal: [-sqrt3, sqrt3, sqrt3],
      viewUp: [0, 0, 1],
    }); // -X, +Y, +Z

    // 12 square edge faces - edge views
    const sqrt2 = 1 / Math.sqrt(2);

    // Bottom edges (14-17) - for these, viewUp should point upward to avoid inversion
    // Edge 14: bottom-front - between Bottom (0,0,-1) and Front (0,-1,0)
    // viewPlaneNormal = [0, -sqrt2, -sqrt2]
    // Project [0, 0, 1] onto plane: [0, 0, 1] - dot([0,0,1], normal)*normal = [0, 0, 1] - (-sqrt2)*[0, -sqrt2, -sqrt2] = [0, 0, 1] - [0, 1/2, 1/2] = [0, -1/2, 1/2]
    // Normalize: [0, -sqrt2, sqrt2] but we want positive Z, so use [0, sqrt2, -sqrt2] flipped
    // Actually, simpler: use [1, 0, 0] which is perpendicular, but ensure correct orientation
    orientations.set(14, {
      viewPlaneNormal: [0, -sqrt2, -sqrt2],
      viewUp: [0, sqrt2, -sqrt2], // Perpendicular and maintains orientation (flipped from original to fix inversion)
    });
    // Edge 15: bottom-right - between Bottom (0,0,-1) and Right (+1,0,0) - WORKS
    orientations.set(15, {
      viewPlaneNormal: [sqrt2, 0, -sqrt2],
      viewUp: [-sqrt2, 0, -sqrt2], // Original working value
    });
    // Edge 16: bottom-back - between Bottom (0,0,-1) and Back (0,+1,0)
    orientations.set(16, {
      viewPlaneNormal: [0, sqrt2, -sqrt2],
      viewUp: [0, -sqrt2, -sqrt2], // Perpendicular and maintains orientation (flipped from original to fix inversion)
    });
    // Edge 17: bottom-left - between Bottom (0,0,-1) and Left (-1,0,0) - WORKS
    orientations.set(17, {
      viewPlaneNormal: [-sqrt2, 0, -sqrt2],
      viewUp: [sqrt2, 0, -sqrt2], // Original working value
    });

    // Top edges (18-21) - for these, viewUp should point to maintain correct orientation
    // Edge 18: top-front - between Top (0,0,+1) and Front (0,-1,0)
    orientations.set(18, {
      viewPlaneNormal: [0, -sqrt2, sqrt2],
      viewUp: [0, sqrt2, sqrt2], // Perpendicular and maintains orientation (flipped from original to fix inversion)
    });
    // Edge 19: top-right - between Top (0,0,+1) and Right (+1,0,0) - WORKS
    orientations.set(19, {
      viewPlaneNormal: [sqrt2, 0, sqrt2],
      viewUp: [sqrt2, 0, -sqrt2], // Original working value
    });
    // Edge 20: top-back - between Top (0,0,+1) and Back (0,+1,0)
    orientations.set(20, {
      viewPlaneNormal: [0, sqrt2, sqrt2],
      viewUp: [0, -sqrt2, sqrt2], // Perpendicular and maintains orientation (flipped from original to fix inversion)
    });
    // Edge 21: top-left - between Top (0,0,+1) and Left (-1,0,0) - WORKS
    orientations.set(21, {
      viewPlaneNormal: [-sqrt2, 0, sqrt2],
      viewUp: [-sqrt2, 0, -sqrt2], // Original working value
    });

    // Vertical edges (22-25) - between vertical faces
    // Edge 22: front-left - between Front (0,-1,0) and Left (-1,0,0)
    orientations.set(22, {
      viewPlaneNormal: [-sqrt2, -sqrt2, 0],
      viewUp: [0, 0, 1],
    });
    // Edge 23: front-right - between Front (0,-1,0) and Right (+1,0,0)
    orientations.set(23, {
      viewPlaneNormal: [sqrt2, -sqrt2, 0],
      viewUp: [0, 0, 1],
    });
    // Edge 24: back-right - between Back (0,+1,0) and Right (+1,0,0)
    orientations.set(24, {
      viewPlaneNormal: [sqrt2, sqrt2, 0],
      viewUp: [0, 0, 1],
    });
    // Edge 25: back-left - between Back (0,+1,0) and Left (-1,0,0)
    orientations.set(25, {
      viewPlaneNormal: [-sqrt2, sqrt2, 0],
      viewUp: [0, 0, 1],
    });

    return orientations.get(cellId) || null;
  }

  private getSurfaceLabel(cellId: number): string {
    // 0-5: main faces, 6-13: corners, 14-25: edges
    const labels: Record<number, string> = {
      0: 'Face 0: Bottom (Z-)',
      1: 'Face 1: Top (Z+)',
      2: 'Face 2: Front (Y-)',
      3: 'Face 3: Back (Y+)',
      4: 'Face 4: Left (X-)',
      5: 'Face 5: Right (X+)',
      6: 'Face 6: Corner (-X,-Y,-Z)',
      7: 'Face 7: Corner (+X,-Y,-Z)',
      8: 'Face 8: Corner (+X,+Y,-Z)',
      9: 'Face 9: Corner (-X,+Y,-Z)',
      10: 'Face 10: Corner (-X,-Y,+Z)',
      11: 'Face 11: Corner (+X,-Y,+Z)',
      12: 'Face 12: Corner (+X,+Y,+Z)',
      13: 'Face 13: Corner (-X,+Y,+Z)',
      14: 'Face 14: Edge (Bottom-Front)',
      15: 'Face 15: Edge (Bottom-Right)',
      16: 'Face 16: Edge (Bottom-Back)',
      17: 'Face 17: Edge (Bottom-Left)',
      18: 'Face 18: Edge (Top-Front)',
      19: 'Face 19: Edge (Top-Right)',
      20: 'Face 20: Edge (Top-Back)',
      21: 'Face 21: Edge (Top-Left)',
      22: 'Face 22: Edge (Front-Left)',
      23: 'Face 23: Edge (Front-Right)',
      24: 'Face 24: Edge (Back-Right)',
      25: 'Face 25: Edge (Back-Left)',
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

    // Create geometry
    const polyData = this.createRhombicuboctahedronGeometry();

    // Create mapper
    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    mapper.setScalarModeToUseCellData(); // Use cell colors
    mapper.setColorModeToDirectScalars(); // Use RGB values directly

    // Create actor
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    // Set properties - translucent with cell colors
    const property = actor.getProperty();
    const opacity = this.configuration.opacity ?? 0.95; // Use configured opacity or default to 0.3
    property.setOpacity(opacity); // Translucent to see inside
    property.setRepresentationToSurface();
    property.setEdgeVisibility(false); // No edges needed with colored surfaces
    property.setBackfaceCulling(false); // Render both sides of faces
    property.setFrontfaceCulling(false); // Ensure all faces are visible
    actor.setVisibility(true);

    // Add actor to viewport first
    const actorUID = `orientation-control-${viewportId}`;
    viewport.addActor({ actor, uid: actorUID });
    this.markerActors.set(viewportId, actor);

    // Verify actor was added
    const actors = viewport.getActors();
    const addedActor = actors.find((a) => a.uid === actorUID);
    console.log(
      'OrientationControlTool: Actor added?',
      !!addedActor,
      'Total actors:',
      actors.length
    );

    // Position marker in viewport corner (after adding to viewport so bounds are available)
    const positioned = this.positionMarkerInViewport(
      viewport as Types.IVolumeViewport3D,
      actor
    );
    if (!positioned) {
      console.warn(
        'OrientationControlTool: Could not position marker, bounds not available'
      );
      // Try again after a delay
      setTimeout(() => {
        const repositioned = this.positionMarkerInViewport(
          viewport as Types.IVolumeViewport3D,
          actor
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

    // Setup picker
    const picker = vtkCellPicker.newInstance({ opacityThreshold: 0.0001 });
    picker.setPickFromList(1);
    picker.setTolerance(0.001);
    picker.initializePickList();
    picker.addPickList(actor);
    this.pickers.set(viewportId, picker);

    // Setup click handler
    this.setupClickHandler(viewportId, renderingEngineId, element, actor);

    viewport.render();
  }

  private positionMarkerInViewport(
    viewport: Types.IVolumeViewport3D,
    actor: vtkActor
  ): boolean {
    // Get viewport bounds for size calculation
    const bounds = viewport.getBounds();
    if (!bounds || bounds.length < 6) {
      console.warn('OrientationControlTool: Bounds not available yet');
      return false;
    }

    const size = this.configuration.size || 0.10625; // 15% smaller than 0.125
    const position = this.configuration.position || 'bottom-right';

    // Calculate marker size based on viewport bounds
    const diagonal = Math.sqrt(
      Math.pow(bounds[1] - bounds[0], 2) +
        Math.pow(bounds[3] - bounds[2], 2) +
        Math.pow(bounds[5] - bounds[4], 2)
    );
    const markerSize = diagonal * size;

    // Scale actor
    actor.setScale(markerSize, markerSize, markerSize);

    // Position marker in fixed screen space (canvas corner)
    const worldPos = this.getMarkerPositionInScreenSpace(viewport, position);
    if (!worldPos) {
      return false;
    }
    actor.setPosition(worldPos[0], worldPos[1], worldPos[2]);

    // Update marker orientation to match camera (so it rotates with the view)
    this.updateMarkerOrientation(viewport, actor);

    return true;
  }

  private getMarkerPositionInScreenSpace(
    viewport: Types.IVolumeViewport3D,
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
    const cornerOffset = 50; // pixels from corner
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
    viewport: Types.IVolumeViewport3D,
    actor: vtkActor
  ): void {
    // Keep the marker in world-aligned orientation (no rotation).
    // This allows it to naturally show the world axes as the camera rotates.
    // The marker geometry itself represents world directions:
    // - Green faces (2-3): Front/Back (Y axis)
    // - Yellow faces (4-5): Left/Right (X axis)
    // - Red faces (0-1): Bottom/Top (Z axis)
    actor.setOrientation(0, 0, 0);
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

    const actor = this.markerActors.get(viewportId);
    if (!actor) {
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
    this.positionMarkerInViewport(viewport as Types.IVolumeViewport3D, actor);
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

    const actor = this.markerActors.get(viewportId);
    if (!actor) {
      return;
    }

    const { viewport } = enabledElement;
    if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
      return;
    }

    this.positionMarkerInViewport(viewport as Types.IVolumeViewport3D, actor);
  }

  private animateCameraToOrientation(
    viewport: Types.IVolumeViewport3D,
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
    actor: vtkActor
  ): void {
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
        viewport as Types.IVolumeViewport3D
      ).getVtkDisplayCoords([x, y]);

      // Pick
      picker.pick(displayCoords, viewport.getRenderer());

      // Check if we picked the marker actor
      const pickedActors = picker.getActors();
      if (pickedActors.length === 0 || pickedActors[0] !== actor) {
        return;
      }

      // Get picked cell ID
      const cellId = picker.getCellId();
      if (cellId === -1) {
        return;
      }

      // Log which of the 26 surfaces was clicked
      const label = this.getSurfaceLabel(cellId);
      console.info(
        'OrientationControlTool: Clicked surface',
        cellId,
        '-',
        label
      );

      // Get orientation for this surface
      const orientation = this.getOrientationForSurface(cellId);
      if (!orientation) {
        return;
      }

      // Animate camera rotation to new orientation
      this.animateCameraToOrientation(
        viewport as Types.IVolumeViewport3D,
        orientation.viewPlaneNormal,
        orientation.viewUp
      );

      evt.preventDefault();
      evt.stopPropagation();
    };

    element.addEventListener('mousedown', clickHandler);
    this.clickHandlers.set(viewportId, clickHandler);
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
          const { viewport, element } = enabledElement;

          // Remove click handler
          const clickHandler = this.clickHandlers.get(viewportId);
          if (clickHandler) {
            element.removeEventListener('mousedown', clickHandler);
            this.clickHandlers.delete(viewportId);
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

          // Remove actor
          viewport.removeActor(`orientation-control-${viewportId}`);
          actor.delete();
        }
      }
    });

    this.markerActors.clear();
    this.pickers.clear();
    this.cameraHandlers.clear();
  };
}

OrientationControlTool.toolName = 'OrientationControl';
export default OrientationControlTool;
