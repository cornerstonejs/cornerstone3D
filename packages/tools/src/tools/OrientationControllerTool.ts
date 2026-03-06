import { BaseTool } from './base';
import {
  getEnabledElementByIds,
  Enums,
  eventTarget,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { Point3 } from '@cornerstonejs/core/types';
import { getToolGroup } from '../store/ToolGroupManager';
import * as ToolsEnums from '../enums';
import { vec3, mat4, quat } from 'gl-matrix';
import { vtkOrientationControllerWidget } from '../utilities/vtkjs/OrientationControllerWidget';

/**
 * OrientationControllerTool provides an interactive orientation marker
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
 * @class OrientationControllerTool
 * @extends BaseTool
 */
const ADD_MARKER_DELAY_MS = 500;
const POSITION_RETRY_DELAY_MS = 1000;

type FaceColors = {
  topBottom: number[];
  frontBack: number[];
  leftRight: number[];
};

type LetterColors = {
  zMinus: number[];
  zPlus: number[];
  yMinus: number[];
  yPlus: number[];
  xMinus: number[];
  xPlus: number[];
};

const FACE_COLOR_SCHEMES: Record<string, FaceColors> = {
  marker: {
    topBottom: [0, 0, 255],
    frontBack: [0, 255, 255],
    leftRight: [255, 255, 0],
  },
  gray: {
    topBottom: [180, 180, 180],
    frontBack: [180, 180, 180],
    leftRight: [180, 180, 180],
  },
  rgy: {
    topBottom: [255, 0, 0],
    frontBack: [0, 255, 0],
    leftRight: [255, 255, 0],
  },
};

const LETTER_COLOR_SCHEMES: Record<string, LetterColors> = {
  mixed: {
    zMinus: [255, 255, 255],
    zPlus: [255, 255, 255],
    yMinus: [255, 255, 255],
    yPlus: [255, 255, 255],
    xMinus: [0, 0, 0],
    xPlus: [0, 0, 0],
  },
  rgy: {
    zMinus: [255, 255, 255],
    zPlus: [255, 255, 255],
    yMinus: [255, 255, 255],
    yPlus: [255, 255, 255],
    xMinus: [0, 0, 0],
    xPlus: [0, 0, 0],
  },
  white: {
    zMinus: [255, 255, 255],
    zPlus: [255, 255, 255],
    yMinus: [255, 255, 255],
    yPlus: [255, 255, 255],
    xMinus: [255, 255, 255],
    xPlus: [255, 255, 255],
  },
  black: {
    zMinus: [0, 0, 0],
    zPlus: [0, 0, 0],
    yMinus: [0, 0, 0],
    yPlus: [0, 0, 0],
    xMinus: [0, 0, 0],
    xPlus: [0, 0, 0],
  },
};

const DEFAULT_FACE_COLOR_SCHEME = 'rgy';
const DEFAULT_LETTER_COLOR_SCHEME = 'mixed';

const ANIMATE_RESET_CAMERA_OPTIONS = {
  resetZoom: false,
  resetPan: true,
  resetToCenter: true,
} as const;

class OrientationControllerTool extends BaseTool {
  static toolName = 'OrientationControllerTool';

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
        colorScheme: 'rgy',
        letterColorScheme: 'mixed',
        showEdgeFaces: true,
        showCornerFaces: true,
        keepOrientationUp: true,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  private _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId)?.viewportsInfo;
    return viewports || [];
  };

  private getPositionConfig() {
    return {
      position: this.configuration.position || 'bottom-right',
      size: this.configuration.size || 0.04,
    };
  }

  private getFaceColors(): {
    topBottom: number[];
    frontBack: number[];
    leftRight: number[];
  } {
    const colorScheme = this.configuration.colorScheme || 'rgy';

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

    return (
      FACE_COLOR_SCHEMES[colorScheme] ??
      FACE_COLOR_SCHEMES[DEFAULT_FACE_COLOR_SCHEME]
    );
  }

  private getLetterColors(): {
    zMinus: number[];
    zPlus: number[];
    yMinus: number[];
    yPlus: number[];
    xMinus: number[];
    xPlus: number[];
  } {
    const letterColorScheme = this.configuration.letterColorScheme || 'mixed';
    return (
      LETTER_COLOR_SCHEMES[letterColorScheme] ??
      LETTER_COLOR_SCHEMES[DEFAULT_LETTER_COLOR_SCHEME]
    );
  }

  onSetToolEnabled(): void {
    // Remove any existing markers first to ensure clean recreation
    this.removeMarkers();
    this.addMarkers();

    eventTarget.addEventListener(
      ToolsEnums.Events.TOOLGROUP_VIEWPORT_ADDED,
      this.onViewportAdded
    );
    eventTarget.addEventListener(
      ToolsEnums.Events.TOOLGROUP_VIEWPORT_REMOVED,
      this.onViewportRemoved
    );
  }

  onSetToolDisabled(): void {
    this.removeMarkers();

    eventTarget.removeEventListener(
      ToolsEnums.Events.TOOLGROUP_VIEWPORT_ADDED,
      this.onViewportAdded
    );
    eventTarget.removeEventListener(
      ToolsEnums.Events.TOOLGROUP_VIEWPORT_REMOVED,
      this.onViewportRemoved
    );
  }

  onSetToolConfiguration = (): void => {
    // If tool is enabled, recreate markers with new configuration
    const viewportsInfo = this._getViewportsInfo();
    const hasActiveMarkers = viewportsInfo.some(({ viewportId }) => {
      return this.widget.getActors(viewportId) !== null;
    });

    if (hasActiveMarkers) {
      // Remove existing markers and recreate with new configuration
      this.removeMarkers();
      this.addMarkers();
    }
  };

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
    }, ADD_MARKER_DELAY_MS);
  };

  private onViewportRemoved = (evt: CustomEvent): void => {
    const { viewportId, renderingEngineId, toolGroupId } = evt.detail;

    if (toolGroupId !== this.toolGroupId) {
      return;
    }

    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );

    if (enabledElement) {
      const { viewport } = enabledElement;
      if ((viewport as Types.IViewport).isOrientationChangeable()) {
        this.widget.removeActorsFromViewport(
          viewportId,
          viewport as Types.IVolumeViewport
        );
      }
      const cameraHandler = this.cameraHandlers.get(viewportId);
      if (cameraHandler) {
        viewport.element.removeEventListener(
          Enums.Events.CAMERA_MODIFIED,
          cameraHandler as EventListener
        );
        this.cameraHandlers.delete(viewportId);
      }
    }

    this.widget.cleanup(viewportId);

    const resizeObserver = this.resizeObservers.get(viewportId);
    if (resizeObserver) {
      resizeObserver.disconnect();
      this.resizeObservers.delete(viewportId);
    }
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
        if ((viewport as Types.IViewport).isOrientationChangeable()) {
          this.widget.removeActorsFromViewport(
            viewportId,
            viewport as Types.IVolumeViewport
          );
        }
        const cameraHandler = this.cameraHandlers.get(viewportId);
        if (cameraHandler) {
          viewport.element.removeEventListener(
            Enums.Events.CAMERA_MODIFIED,
            cameraHandler as EventListener
          );
          this.cameraHandlers.delete(viewportId);
        }
      }
      const resizeObserver = this.resizeObservers.get(viewportId);
      if (resizeObserver) {
        resizeObserver.disconnect();
        this.resizeObservers.delete(viewportId);
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

      if (!(viewport as Types.IViewport).isOrientationChangeable()) {
        return;
      }

      if (this.widget.getActors(viewportId)) {
        return;
      }

      setTimeout(() => {
        this.addMarkerToViewport(viewportId, renderingEngineId);
      }, ADD_MARKER_DELAY_MS);
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
      console.warn('OrientationControllerTool: No enabled element found');
      return;
    }

    const { viewport } = enabledElement;

    if (!(viewport as Types.IViewport).isOrientationChangeable()) {
      console.warn(
        'OrientationControllerTool: Viewport does not support orientation changes'
      );
      return;
    }

    const element = viewport.element;
    const volumeViewport = viewport as Types.IVolumeViewport;

    const actors = this.createAnnotatedRhombActor();

    this.widget.addActorsToViewport(viewportId, volumeViewport, actors);

    const positioned = this.widget.positionActors(
      volumeViewport,
      actors,
      this.getPositionConfig()
    );

    if (!positioned) {
      console.warn(
        'OrientationControllerTool: Initial positioning failed, retrying...'
      );
      setTimeout(() => {
        const repositioned = this.widget.positionActors(
          volumeViewport,
          actors,
          this.getPositionConfig()
        );
        if (repositioned) {
          viewport.render();
        } else {
          console.error(
            'OrientationControllerTool: Retry positioning also failed'
          );
        }
      }, POSITION_RETRY_DELAY_MS);
    } else {
      viewport.render();
    }

    this.widget.syncOverlayViewport(viewportId, volumeViewport);
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
    if (!(viewport as Types.IViewport).isOrientationChangeable()) {
      return;
    }

    // Recalculate both size and position to maintain fixed screen size
    // Size needs to be recalculated because parallel scale changes with zoom
    const volumeViewport = viewport as Types.IVolumeViewport;
    this.widget.positionActors(
      volumeViewport,
      actors,
      this.getPositionConfig()
    );
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
    if (!(viewport as Types.IViewport).isOrientationChangeable()) {
      return;
    }

    this.widget.positionActors(
      viewport as Types.IVolumeViewport,
      actors,
      this.getPositionConfig()
    );
    this.widget.syncOverlayViewport(
      viewportId,
      viewport as Types.IVolumeViewport
    );
    viewport.render();
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

    // prettier-ignore
    const startMatrix = mat4.fromValues(
      startRight[0], startRight[1], startRight[2], 0,
      startUp[0], startUp[1], startUp[2], 0,
      startForward[0], startForward[1], startForward[2], 0,
      0, 0, 0, 1
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
      // Keep current viewUp, but project it onto the plane perpendicular to targetViewPlaneNormal
      // to ensure orthogonality
      const currentUp = vec3.normalize(vec3.create(), startUp);

      // Normalize targetViewPlaneNormal for projection
      const normalizedForward = vec3.create();
      vec3.normalize(normalizedForward, targetViewPlaneNormal as vec3);

      // Project currentUp onto the plane perpendicular to targetViewPlaneNormal
      // Remove the component of currentUp that's parallel to targetViewPlaneNormal
      const dot = vec3.dot(currentUp, normalizedForward);
      targetUp = vec3.create();
      vec3.scaleAndAdd(targetUp, currentUp, normalizedForward, -dot);
      vec3.normalize(targetUp, targetUp);

      // If the projection results in a zero vector (currentUp was parallel to targetViewPlaneNormal),
      // use a default up vector
      if (vec3.length(targetUp) < 0.001) {
        // Use a default up vector perpendicular to targetViewPlaneNormal
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
    vec3.cross(targetRight, targetUp, targetViewPlaneNormal as vec3);
    vec3.normalize(targetRight, targetRight);

    // prettier-ignore
    const targetMatrix = mat4.fromValues(
      targetRight[0], targetRight[1], targetRight[2], 0,
      targetUp[0], targetUp[1], targetUp[2], 0,
      targetViewPlaneNormal[0], targetViewPlaneNormal[1], targetViewPlaneNormal[2], 0,
      0, 0, 0, 1
    );

    const startQuat = mat4.getRotation(quat.create(), startMatrix);
    const targetQuat = mat4.getRotation(quat.create(), targetMatrix);

    let dotProduct = quat.dot(startQuat, targetQuat);
    if (dotProduct < 0) {
      quat.scale(targetQuat, targetQuat, -1);
      dotProduct = -dotProduct;
    }

    const threshold = 0.99996;
    if (dotProduct > threshold) {
      return;
    }

    const steps = 10;
    const duration = 150;
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

      const interpolatedForward = interpolatedMatrix.slice(8, 11) as Point3;
      const interpolatedUp = interpolatedMatrix.slice(4, 7) as Point3;

      viewport.setCamera({
        viewPlaneNormal: interpolatedForward,
        viewUp: interpolatedUp,
      });
      viewport.resetCamera(ANIMATE_RESET_CAMERA_OPTIONS);
      viewport.render();

      if (currentStep < steps) {
        setTimeout(animate, stepDuration);
      }
    };

    animate();
  }
}

export default OrientationControllerTool;
