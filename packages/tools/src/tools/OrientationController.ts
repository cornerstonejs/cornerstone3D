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
import {
  vtkOrientationControllerWidget,
  type OrientationControllerConfig,
} from '../utilities/vtkjs/OrientationControllerWidget';

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

  private widget = new vtkOrientationControllerWidget();
  private resizeObservers = new Map<string, ResizeObserver>();
  private cameraHandlers = new Map<string, (evt: CustomEvent) => void>();

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        enabled: true,
        opacity: 1.0,
        size: 0.04,
        position: 'bottom-right',
        colorScheme: 'marker',
        letterColorScheme: 'rgb',
        showEdgeFaces: true,
        showCornerFaces: true,
        keepOrientationUp: true,
        // Don't set default faceColors - let getFaceColors() determine them from colorScheme
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
    const colorScheme = this.configuration.colorScheme || 'marker';

    // If faceColors are explicitly provided, use them (but ensure they have the required properties)
    if (this.configuration.faceColors) {
      const provided = this.configuration.faceColors;
      if (provided.topBottom && provided.frontBack && provided.leftRight) {
        return {
          topBottom: provided.topBottom,
          frontBack: provided.frontBack,
          leftRight: provided.leftRight,
        };
      }
    }

    // Otherwise, use colorScheme to determine colors
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
      case 'rgb':
        return {
          topBottom: [255, 0, 0],
          frontBack: [0, 255, 0],
          leftRight: [255, 255, 0],
        };
      default:
        return {
          topBottom: [0, 0, 255],
          frontBack: [0, 255, 255],
          leftRight: [255, 255, 0],
        };
    }
  }

  private getLetterColors(): {
    zMinus: number[];
    zPlus: number[];
    yMinus: number[];
    yPlus: number[];
    xMinus: number[];
    xPlus: number[];
  } {
    const letterColorScheme = this.configuration.letterColorScheme || 'rgb';
    const faceColors = this.getFaceColors();

    switch (letterColorScheme) {
      case 'rgb':
        // Match the face color scheme logic - choose contrasting colors based on face colors
        // For rgb face scheme: topBottom=Red, frontBack=Green, leftRight=Yellow
        // Red and Green backgrounds: use white letters for contrast
        // Yellow background: use black letters for contrast
        return {
          zMinus: [255, 255, 255], // White for I (on red background - topBottom)
          zPlus: [255, 255, 255], // White for S (on red background - topBottom)
          yMinus: [255, 255, 255], // White for A (on green background - frontBack)
          yPlus: [255, 255, 255], // White for P (on green background - frontBack)
          xMinus: [0, 0, 0], // Black for L (on yellow background - leftRight)
          xPlus: [0, 0, 0], // Black for R (on yellow background - leftRight)
        };
      case 'all-white':
        return {
          zMinus: [255, 255, 255],
          zPlus: [255, 255, 255],
          yMinus: [255, 255, 255],
          yPlus: [255, 255, 255],
          xMinus: [255, 255, 255],
          xPlus: [255, 255, 255],
        };
      case 'all-black':
        return {
          zMinus: [0, 0, 0],
          zPlus: [0, 0, 0],
          yMinus: [0, 0, 0],
          yPlus: [0, 0, 0],
          xMinus: [0, 0, 0],
          xPlus: [0, 0, 0],
        };
      default:
        // Default matches rgb scheme
        return {
          zMinus: [255, 255, 255],
          zPlus: [255, 255, 255],
          yMinus: [255, 255, 255],
          yPlus: [255, 255, 255],
          xMinus: [0, 0, 0],
          xPlus: [0, 0, 0],
        };
    }
  }

  onSetToolEnabled(): void {
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

    if (this.widget.getActors(viewportId)) {
      return;
    }

    setTimeout(() => {
      this.addMarkerToViewport(viewportId, renderingEngineId);
    }, 500);
  };

  private removeMarkers(): void {
    const viewportsInfo = this._getViewportsInfo();

    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (enabledElement) {
        const { viewport } = enabledElement;
        if (viewport.type === Enums.ViewportType.VOLUME_3D) {
          this.widget.removeActorsFromViewport(
            viewportId,
            viewport as Types.IVolumeViewport
          );
        }
      }
    });

    this.widget.cleanup();
    this.resizeObservers.forEach((observer) => observer.disconnect());
    this.resizeObservers.clear();
    this.cameraHandlers.clear();
  }

  private addMarkers = (): void => {
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

      if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
        return;
      }

      if (this.widget.getActors(viewportId)) {
        return;
      }

      setTimeout(() => {
        this.addMarkerToViewport(viewportId, renderingEngineId);
      }, 500);
    });
  };

  private createAnnotatedRhombActor(): ReturnType<
    vtkOrientationControllerWidget['createActors']
  > {
    const faceColors = this.getFaceColors();
    const letterColors = this.getLetterColors();

    return this.widget.createActors({
      faceColors,
      letterColors,
      opacity: this.configuration.opacity ?? 1.0,
      showEdgeFaces: this.configuration.showEdgeFaces !== false,
      showCornerFaces: this.configuration.showCornerFaces !== false,
    });
  }

  private addMarkerToViewport(
    viewportId: string,
    renderingEngineId: string
  ): void {
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
    const volumeViewport = viewport as Types.IVolumeViewport;

    const actors = this.createAnnotatedRhombActor();

    this.widget.addActorsToViewport(viewportId, volumeViewport, actors);

    const positioned = this.widget.positionActors(volumeViewport, actors, {
      position: this.configuration.position || 'bottom-right',
      size: this.configuration.size || 0.04,
    });

    if (!positioned) {
      console.warn(
        'OrientationController: Initial positioning failed, retrying...'
      );
      setTimeout(() => {
        const repositioned = this.widget.positionActors(
          volumeViewport,
          actors,
          {
            position: this.configuration.position || 'bottom-right',
            size: this.configuration.size || 0.04,
          }
        );
        if (repositioned) {
          viewport.render();
        } else {
          console.error('OrientationController: Retry positioning also failed');
        }
      }, 1000);
    } else {
      viewport.render();
    }

    this.widget.setupPicker(viewportId, actors);

    this.widget.setupMouseHandlers(
      viewportId,
      element,
      volumeViewport,
      actors,
      {
        onFacePicked: (result) => {
          const orientation = this.widget.getOrientationForFace(result.cellId);
          if (orientation) {
            this.animateCameraToOrientation(
              volumeViewport,
              orientation.viewPlaneNormal,
              orientation.viewUp
            );
          }
        },
        onFaceHover: (result) => {
          if (result && result.actorIndex !== 0) {
            this.widget.highlightFace(
              result.pickedActor,
              result.cellId,
              volumeViewport,
              false
            );
          } else {
            this.widget.clearHighlight();
          }
        },
      }
    );

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

  private onCameraModified = (evt: CustomEvent): void => {
    const { viewportId } = evt.detail as { viewportId: string };
    if (!viewportId) {
      return;
    }

    const actors = this.widget.getActors(viewportId);

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

    // Recalculate both size and position to maintain fixed screen size
    // Size needs to be recalculated because parallel scale changes with zoom
    const volumeViewport = viewport as Types.IVolumeViewport;
    this.widget.positionActors(volumeViewport, actors, {
      position: this.configuration.position || 'bottom-right',
      size: this.configuration.size || 0.04,
    });
    viewport.render();
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

    const actors = this.widget.getActors(viewportId);

    if (!actors) {
      return;
    }

    const { viewport } = enabledElement;
    if (viewport.type !== Enums.ViewportType.VOLUME_3D) {
      return;
    }

    this.widget.positionActors(viewport as Types.IVolumeViewport, actors, {
      position: this.configuration.position || 'bottom-right',
      size: this.configuration.size || 0.04,
    });
  }

  private animateCameraToOrientation(
    viewport: Types.IVolumeViewport,
    targetViewPlaneNormal: number[],
    targetViewUp: number[]
  ): void {
    const keepOrientationUp = this.configuration.keepOrientationUp !== false; // Default to true

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

    let targetUp: vec3;
    if (keepOrientationUp) {
      // Use the target viewUp as specified (original behavior)
      targetUp = vec3.fromValues(
        targetViewUp[0],
        targetViewUp[1],
        targetViewUp[2]
      );
    } else {
      // Keep current viewUp, but project it onto the plane perpendicular to targetForward
      // to ensure orthogonality
      const currentUp = vec3.fromValues(startUp[0], startUp[1], startUp[2]);
      vec3.normalize(currentUp, currentUp);

      // Normalize targetForward for projection
      const normalizedForward = vec3.create();
      vec3.normalize(normalizedForward, targetForward);

      // Project currentUp onto the plane perpendicular to targetForward
      // Remove the component of currentUp that's parallel to targetForward
      const dot = vec3.dot(currentUp, normalizedForward);
      targetUp = vec3.create();
      vec3.scaleAndAdd(targetUp, currentUp, normalizedForward, -dot);
      vec3.normalize(targetUp, targetUp);

      // If the projection results in a zero vector (currentUp was parallel to targetForward),
      // use a default up vector
      if (vec3.length(targetUp) < 0.001) {
        // Use a default up vector perpendicular to targetForward
        if (Math.abs(normalizedForward[2]) < 0.9) {
          targetUp = vec3.fromValues(0, 0, 1);
        } else {
          targetUp = vec3.fromValues(0, 1, 0);
        }
        // Project and normalize
        const dot2 = vec3.dot(targetUp, normalizedForward);
        vec3.scaleAndAdd(targetUp, targetUp, normalizedForward, -dot2);
        vec3.normalize(targetUp, targetUp);
      }
    }

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
}

export default OrientationController;
