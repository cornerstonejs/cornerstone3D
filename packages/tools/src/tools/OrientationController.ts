import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import { BaseTool } from './base';
import {
  getEnabledElementByIds,
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getToolGroup } from '../store/ToolGroupManager';
import * as ToolsEnums from '../enums';
import { vec3, mat4, quat } from 'gl-matrix';
import vtkAnnotatedRhombicuboctahedronActor from '../utilities/vtkjs/AnnotatedRhombicuboctahedronActor';

/**
 * OrientationController provides an interactive orientation marker
 * using a rhombicuboctahedron (26-faced polyhedron) with clickable surfaces
 * for intuitive 3D volume reorientation.
 *
 * Features:
 * - 6 main square faces with anatomical labels (L/R, A/P, S/I)
 * - 12 edge squares for diagonal orientations
 * - 8 corner triangles for tri-axial views
 * - Smooth animated camera transitions
 * - Configurable appearance and positioning
 *
 * @public
 * @class OrientationController
 * @extends BaseTool
 */
class OrientationController extends BaseTool {
  static toolName = 'OrientationController';

  private actors = new Map<string, vtkActor[]>();
  private pickers = new Map<string, vtkCellPicker>();
  private clickHandlers = new Map<string, (evt: MouseEvent) => void>();
  private dragHandlers = new Map<string, (evt: MouseEvent) => void>();
  private mouseUpHandlers = new Map<string, () => void>();
  private resizeObservers = new Map<string, ResizeObserver>();
  private cameraHandlers = new Map<string, (evt: CustomEvent) => void>();

  // Store highlighted face info for mouse up reset
  private highlightedFace: {
    actor: vtkActor;
    cellId: number;
    originalColor: number[];
    viewport: Types.IVolumeViewport;
  } | null = null;

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        enabled: true,
        opacity: 1.0,
        size: 0.02,
        position: 'bottom-right',
        colorScheme: 'rgb',
        showEdgeFaces: true,
        showCornerFaces: true,
        faceColors: {
          topBottom: [255, 0, 0],
          frontBack: [0, 255, 0],
          leftRight: [255, 255, 0],
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  private _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId)?.viewportsInfo;
    return viewports || [];
  };

  private getFaceColors(): {
    topBottom: number[];
    frontBack: number[];
    leftRight: number[];
  } {
    const colorScheme = this.configuration.colorScheme || 'rgb';

    if (this.configuration.faceColors) {
      return this.configuration.faceColors;
    }

    switch (colorScheme) {
      case 'marker':
        return {
          topBottom: [0, 0, 255],
          frontBack: [0, 255, 255],
          leftRight: [255, 255, 0],
        };
      case 'gray':
        return {
          topBottom: [180, 180, 180],
          frontBack: [180, 180, 180],
          leftRight: [180, 180, 180],
        };
      default:
        return {
          topBottom: [255, 0, 0],
          frontBack: [0, 255, 0],
          leftRight: [255, 255, 0],
        };
    }
  }

  onSetToolEnabled(): void {
    console.log('OrientationController: Tool enabled');
    // Remove any existing markers first to ensure clean recreation
    this.removeMarkers();
    this.addMarkers();

    // Also listen for viewports being added to the tool group
    eventTarget.addEventListener(
      ToolsEnums.Events.TOOLGROUP_VIEWPORT_ADDED,
      this.onViewportAdded
    );
  }

  onSetToolDisabled(): void {
    console.log('OrientationController: Tool disabled');
    this.removeMarkers();

    eventTarget.removeEventListener(
      ToolsEnums.Events.TOOLGROUP_VIEWPORT_ADDED,
      this.onViewportAdded
    );
  }

  private onViewportAdded = (evt: CustomEvent): void => {
    const { viewportId, renderingEngineId, toolGroupId } = evt.detail;

    if (toolGroupId !== this.toolGroupId) {
      return;
    }

    console.log(
      'OrientationController: Viewport added to tool group',
      viewportId
    );

    if (this.actors.has(viewportId)) {
      console.log('OrientationController: Marker already exists for viewport');
      return;
    }

    setTimeout(() => {
      this.addMarkerToViewport(viewportId, renderingEngineId);
    }, 500);
  };

  private removeMarkers(): void {
    this.actors.forEach((actors, viewportId) => {
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
          // Remove all actors for this viewport
          const uids = actors.map(
            (_, index) => `orientation-controller-${viewportId}-${index}`
          );
          viewport.removeActors(uids);
        }
      }
    });

    this.clickHandlers.forEach((handler, viewportId) => {
      const viewportsInfo = this._getViewportsInfo();
      const viewportInfo = viewportsInfo.find(
        (vp) => vp.viewportId === viewportId
      );

      if (viewportInfo) {
        const enabledElement = getEnabledElementByIds(
          viewportId,
          viewportInfo.renderingEngineId
        );

        if (enabledElement?.viewport?.element) {
          const element = enabledElement.viewport.element;
          element.removeEventListener('mousedown', handler);

          const dragHandler = this.dragHandlers.get(viewportId);
          const mouseUpHandler = this.mouseUpHandlers.get(viewportId);

          if (dragHandler) {
            element.removeEventListener('mousemove', dragHandler);
          }
          if (mouseUpHandler) {
            element.removeEventListener('mouseup', mouseUpHandler);
            element.removeEventListener('mouseleave', mouseUpHandler);
          }
        }
      }
    });

    this.resizeObservers.forEach((observer) => observer.disconnect());
    // Note: camera handlers are added to elements, which are removed when actors are removed
    // so we don't need to explicitly remove them

    this.actors.clear();
    this.pickers.clear();
    this.clickHandlers.clear();
    this.dragHandlers.clear();
    this.mouseUpHandlers.clear();
    this.resizeObservers.clear();
    this.cameraHandlers.clear();
  }

  private addMarkers = (): void => {
    const viewportsInfo = this._getViewportsInfo();
    console.log(
      'OrientationController: addMarkers called, found',
      viewportsInfo.length,
      'viewports'
    );

    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        console.log(
          'OrientationController: No enabled element for',
          viewportId
        );
        return;
      }

      const { viewport } = enabledElement;

      if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
        console.log(
          'OrientationController: Viewport is not VOLUME_3D:',
          viewport.type
        );
        return;
      }

      if (this.actors.has(viewportId)) {
        console.log(
          'OrientationController: Marker already exists for',
          viewportId
        );
        return;
      }

      console.log(
        'OrientationController: Scheduling marker creation for',
        viewportId
      );
      setTimeout(() => {
        this.addMarkerToViewport(viewportId, renderingEngineId);
      }, 500);
    });
  };

  private createAnnotatedRhombActor(): vtkActor[] {
    const faceColors = this.getFaceColors();
    const rgbToHex = (rgb: number[]) => {
      return `#${rgb
        .map((x) => {
          const hex = Math.round(x).toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')}`;
    };

    const actorFactory = vtkAnnotatedRhombicuboctahedronActor.newInstance();

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

    actorFactory.setDefaultStyle(defaultStyle);

    // LPS coordinate system labels for the 6 main faces
    actorFactory.setXPlusFaceProperty({
      text: 'R',
      faceColor: rgbToHex(faceColors.leftRight),
      faceRotation: 0,
    });

    actorFactory.setXMinusFaceProperty({
      text: 'L',
      faceColor: rgbToHex(faceColors.leftRight),
      faceRotation: 0,
    });

    actorFactory.setYPlusFaceProperty({
      text: 'P',
      faceColor: rgbToHex(faceColors.frontBack),
      fontColor: 'white',
      faceRotation: 180,
    });

    actorFactory.setYMinusFaceProperty({
      text: 'A',
      faceColor: rgbToHex(faceColors.frontBack),
      fontColor: 'white',
      faceRotation: 0,
    });

    actorFactory.setZPlusFaceProperty({
      text: 'S',
      faceColor: rgbToHex(faceColors.topBottom),
    });

    actorFactory.setZMinusFaceProperty({
      text: 'I',
      faceColor: rgbToHex(faceColors.topBottom),
    });

    // Configure which faces to show
    actorFactory.setShowMainFaces(true);
    actorFactory.setShowEdgeFaces(this.configuration.showEdgeFaces !== false);
    actorFactory.setShowCornerFaces(
      this.configuration.showCornerFaces !== false
    );

    // Don't set scale on factory - we'll scale the actors directly in positionMarker

    const actors = actorFactory.getActors();

    // Set opacity for all actors
    const opacity = this.configuration.opacity ?? 1.0;
    actors.forEach((actor) => {
      const property = actor.getProperty();
      property.setOpacity(opacity);
      actor.setVisibility(true);
    });

    return actors;
  }

  private addMarkerToViewport(
    viewportId: string,
    renderingEngineId: string
  ): void {
    console.log('OrientationController: Adding marker to viewport', viewportId);

    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );

    if (!enabledElement) {
      console.warn('OrientationController: No enabled element found');
      return;
    }

    const { viewport } = enabledElement;

    if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
      console.warn('OrientationController: Viewport is not VOLUME_3D');
      return;
    }

    const element = viewport.element;

    // Remove existing actors if they exist to ensure clean recreation
    const existingActors = this.actors.get(viewportId);
    if (existingActors) {
      const uids = existingActors.map(
        (_, index) => `orientation-controller-${viewportId}-${index}`
      );
      viewport.removeActors(uids);
      this.actors.delete(viewportId);
    }

    const actors = this.createAnnotatedRhombActor();

    console.log(
      `OrientationController: Created ${actors.length} actors for viewport`,
      viewportId
    );

    // Add each actor with unique UID
    const uids: string[] = [];
    actors.forEach((actor, index) => {
      const uid = `orientation-controller-${viewportId}-${index}`;
      viewport.addActor({ actor, uid });
      uids.push(uid);
    });

    this.actors.set(viewportId, actors);

    const positioned = this.positionMarker(
      viewport as Types.IVolumeViewport,
      actors
    );

    if (!positioned) {
      console.warn(
        'OrientationController: Initial positioning failed, retrying...'
      );
      setTimeout(() => {
        const repositioned = this.positionMarker(
          viewport as Types.IVolumeViewport,
          actors
        );
        if (repositioned) {
          console.log('OrientationController: Retry positioning succeeded');
          viewport.render();
        } else {
          console.error('OrientationController: Retry positioning also failed');
        }
      }, 1000);
    } else {
      console.log('OrientationController: Initial positioning succeeded');
    }

    const picker = vtkCellPicker.newInstance({ opacityThreshold: 0.0001 });
    picker.setPickFromList(true);
    picker.setTolerance(0.001);
    picker.initializePickList();
    // Add all actors to the pick list
    actors.forEach((actor) => {
      picker.addPickList(actor);
    });
    this.pickers.set(viewportId, picker);

    this.setupClickHandler(viewportId, renderingEngineId, element, actors);

    const resizeObserver = new ResizeObserver(() => {
      this.updateMarkerPosition(viewportId, renderingEngineId);
    });
    resizeObserver.observe(element);
    this.resizeObservers.set(viewportId, resizeObserver);

    const cameraHandler = (evt: CustomEvent) => {
      const detail = evt.detail as { viewportId: string };
      if (detail.viewportId === viewportId) {
        this.onCameraModified(evt);
      }
    };
    element.addEventListener(
      Enums.Events.CAMERA_MODIFIED,
      cameraHandler as EventListener
    );
    this.cameraHandlers.set(viewportId, cameraHandler);
  }

  private positionMarker(
    viewport: Types.IVolumeViewport,
    actors: vtkActor[]
  ): boolean {
    const bounds = viewport.getBounds();
    if (!bounds || bounds.length < 6) {
      console.warn('OrientationController: No bounds available');
      return false;
    }

    const size = this.configuration.size || 0.15;
    const position = this.configuration.position || 'bottom-right';

    const diagonal = Math.sqrt(
      Math.pow(bounds[1] - bounds[0], 2) +
        Math.pow(bounds[3] - bounds[2], 2) +
        Math.pow(bounds[5] - bounds[4], 2)
    );
    const markerSize = diagonal * size;

    // Scale and position all actors
    actors.forEach((actor) => {
      actor.setScale(markerSize, markerSize, markerSize);

      const worldPos = this.getMarkerPositionInScreenSpace(viewport, position);
      if (!worldPos) {
        console.warn('OrientationController: Could not get world position');
        return false;
      }

      actor.setPosition(worldPos[0], worldPos[1], worldPos[2]);

      this.updateMarkerOrientation(viewport, actor);
    });

    return true;
  }

  private getMarkerPositionInScreenSpace(
    viewport: Types.IVolumeViewport,
    position: string
  ): [number, number, number] | null {
    const canvas = viewport.canvas;
    if (!canvas) {
      return null;
    }

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const cornerOffset = 35; // pixels from corner (match OrientationControlTool)

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

  private updateMarkerOrientation(
    viewport: Types.IVolumeViewport,
    actor: vtkActor
  ): void {
    actor.setOrientation(0, 0, 0);
  }

  private highlightFace(
    actor: vtkActor,
    cellId: number,
    viewport: Types.IVolumeViewport
  ): void {
    // Clear any existing highlight first
    this.clearHighlight();

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

  private clearHighlight(): void {
    if (!this.highlightedFace) {
      return;
    }

    const { actor, cellId, originalColor, viewport } = this.highlightedFace;
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

  private onCameraModified = (evt: CustomEvent): void => {
    const { viewportId } = evt.detail as { viewportId: string };
    if (!viewportId) {
      return;
    }

    const actors = this.actors.get(viewportId);

    if (!actors) {
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

    this.positionMarker(viewport as Types.IVolumeViewport, actors);
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

    const actors = this.actors.get(viewportId);

    if (!actors) {
      return;
    }

    const { viewport } = enabledElement;
    if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
      return;
    }

    this.positionMarker(viewport as Types.IVolumeViewport, actors);
  }

  private animateCameraToOrientation(
    viewport: Types.IVolumeViewport,
    targetViewPlaneNormal: number[],
    targetViewUp: number[]
  ): void {
    // Get the VTK camera from the renderer
    const renderer = viewport.getRenderer();
    const camera = renderer.getActiveCamera();
    const directionOfProjection = camera.getDirectionOfProjection();
    const startViewUpArray = camera.getViewUp();

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

    const startQuat = quat.create();
    const targetQuat = quat.create();
    mat4.getRotation(startQuat, startMatrix);
    mat4.getRotation(targetQuat, targetMatrix);

    let dotProduct = quat.dot(startQuat, targetQuat);
    if (dotProduct < 0) {
      targetQuat[0] = -targetQuat[0];
      targetQuat[1] = -targetQuat[1];
      targetQuat[2] = -targetQuat[2];
      targetQuat[3] = -targetQuat[3];
      dotProduct = -dotProduct;
    }

    const threshold = 0.99996;
    if (dotProduct > threshold) {
      return;
    }

    const steps = 10;
    const duration = 300;
    const stepDuration = duration / steps;
    let currentStep = 0;

    const animate = () => {
      currentStep++;
      const t = currentStep / steps;
      const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const interpolatedQuat = quat.create();
      quat.slerp(interpolatedQuat, startQuat, targetQuat, easedT);

      const interpolatedMatrix = mat4.create();
      mat4.fromQuat(interpolatedMatrix, interpolatedQuat);

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

      if (currentStep < steps) {
        setTimeout(animate, stepDuration);
      }
    };

    animate();
  }

  private getOrientationForFace(cellId: number): {
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
    orientations.set(1, { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] }); // Top
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

  private setupClickHandler(
    viewportId: string,
    renderingEngineId: string,
    element: HTMLDivElement,
    actors: vtkActor[]
  ): void {
    let isMouseDown = false;

    const clickHandler = (evt: MouseEvent) => {
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

      const rect = element.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;

      // Calculate VTK display coordinates manually (works for all rendering engines)
      const renderer = viewport.getRenderer();
      const devicePixelRatio = window.devicePixelRatio || 1;
      const canvasPosWithDPR = [x * devicePixelRatio, y * devicePixelRatio];

      const canvas = viewport.canvas;
      const { width, height } = canvas;

      // Get the actual renderer viewport bounds
      const [xMin, yMin, xMax, yMax] =
        renderer.getViewport() as unknown as number[];
      const viewportWidth = xMax - xMin;
      const viewportHeight = yMax - yMin;

      // Scale the canvas position to the actual viewport size
      const scaledX = (canvasPosWithDPR[0] / width) * viewportWidth * width;
      const scaledY = (canvasPosWithDPR[1] / height) * viewportHeight * height;

      // Canvas coordinates with origin at top-left
      // VTK display coordinates have origin at bottom-left
      const displayCoord = [scaledX, viewportHeight * height - scaledY];
      const displayCoords: [number, number, number] = [
        displayCoord[0],
        displayCoord[1],
        0,
      ];

      picker.pick(displayCoords, renderer);

      const pickedActors = picker.getActors();
      if (pickedActors.length === 0) {
        return;
      }

      const pickedActor = pickedActors[0];
      const cellId = picker.getCellId();

      isMouseDown = true;

      // Handle clicks on the rhombicuboctahedron actors
      if (actors.includes(pickedActor) && cellId !== -1) {
        // Add visual feedback by highlighting the clicked face
        this.highlightFace(
          pickedActor,
          cellId,
          viewport as Types.IVolumeViewport
        );

        const orientation = this.getOrientationForFace(cellId);
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

    const dragHandler = (_evt: MouseEvent) => {
      if (!isMouseDown) {
        return;
      }
    };

    const mouseUpHandler = () => {
      isMouseDown = false;
      // Clear highlight when mouse is released
      this.clearHighlight();
    };

    element.addEventListener('mousedown', clickHandler);
    element.addEventListener('mousemove', dragHandler);
    element.addEventListener('mouseup', mouseUpHandler);
    element.addEventListener('mouseleave', mouseUpHandler);

    this.clickHandlers.set(viewportId, clickHandler);
    this.dragHandlers.set(viewportId, dragHandler);
    this.mouseUpHandlers.set(viewportId, mouseUpHandler);
  }
}

export default OrientationController;
