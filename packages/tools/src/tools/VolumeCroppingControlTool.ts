import { vec2, vec3 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import { AnnotationTool } from './base';

import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  getEnabledElementByIds,
  getEnabledElement,
  utilities as csUtils,
  Enums,
  CONSTANTS,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';

import {
  getToolGroup,
  getToolGroupForViewport,
} from '../store/ToolGroupManager';

import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';

import {
  drawCircle as drawCircleSvg,
  drawLine as drawLineSvg,
} from '../drawingSvg';
import { state } from '../store/state';
import { Events } from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import liangBarksyClip from '../utilities/math/vec2/liangBarksyClip';

import * as lineSegment from '../utilities/math/line';
import type {
  Annotation,
  Annotations,
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
  SVGDrawingHelper,
} from '../types';
import { isAnnotationLocked } from '../stateManagement/annotation/annotationLocking';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';

const { RENDERING_DEFAULTS } = CONSTANTS;

type ReferenceLine = [
  viewport: {
    id: string;
    canvas?: HTMLCanvasElement;
    canvasToWorld?: (...args: unknown[]) => Types.Point3;
  },
  startPoint: Types.Point2,
  endPoint: Types.Point2,
  type: 'min' | 'max',
];

interface VolumeCroppingAnnotation extends Annotation {
  data: {
    handles: {
      activeOperation: number | null; // 0 translation, 1 rotation handles, 2 slab thickness handles
      toolCenter: Types.Point3;
      toolCenterMin: Types.Point3;
      toolCenterMax: Types.Point3;
    };
    activeViewportIds: string[]; // a list of the viewport ids connected to the reference lines being translated
    viewportId: string;
    referenceLines: ReferenceLine[]; // set in renderAnnotation
    clippingPlanes?: vtkPlane[]; // clipping planes for the viewport
    clippingPlaneReferenceLines?: ReferenceLine[];
    orientation?: string; // AXIAL, CORONAL, SAGITTAL
  };
  isVirtual?: boolean;
  virtualNormal?: Types.Point3;
}

function defaultReferenceLineColor() {
  return 'rgb(0, 200, 0)';
}

function defaultReferenceLineControllable() {
  return true;
}

const OPERATION = {
  DRAG: 1,
  ROTATE: 2,
  SLAB: 3,
};

/**
 * VolumeCroppingControlTool provides interactive reference lines to modify the cropping planes
 * of the VolumeCroppingTool. It renders  reference lines across 1 to 3 orthographic viewports and allows
 * users to drag these lines to adjust volume cropping boundaries in real-time.
 *
 * @remarks
 * This tool has no standalone functionality and must be used in conjunction with a VolumeCroppingTool that will be receiving volume.
 * Messaging between this tool and the main cropping tool is handled through Cornerstone events that are validated by the series instance UID of the volume.
 * Therefore the tool does not need to be in the same tool group as the volume cropping tool and
 * multiple cropping & control instances can be used on different series in the same display.
 *
 * @example
 * ```typescript
 * // Basic setup
 * const toolGroup = ToolGroupManager.createToolGroup('myToolGroup');
 * toolGroup.addTool(VolumeCroppingControlTool.toolName);
 * toolGroup.addTool(VolumeCroppingTool.toolName);
 *
 * // Configure with custom colors and settings
 * toolGroup.setToolConfiguration(VolumeCroppingControlTool.toolName, {
 *   lineColors: {
 *     AXIAL: [1.0, 0.0, 0.0],    // Red for axial views
 *     CORONAL: [0.0, 1.0, 0.0],  // Green for coronal views
 *     SAGITTAL: [1.0, 1.0, 0.0], // Yellow for sagittal views
 *   },
 *   lineWidth: 2.0,
 *   extendReferenceLines: true,
 *   viewportIndicators: true
 * });
 *
 * // Activate the tool
 * toolGroup.setToolActive(VolumeCroppingControlTool.toolName);
 * ```
 *
 * @public
 * @class VolumeCroppingControlTool
 * @extends AnnotationTool
 *
 * @property {string} seriesInstanceUID - Frame of reference for the tool
 * @property {VolumeCroppingAnnotation[]} _virtualAnnotations - Store virtual annotations for missing viewport orientations (e.g., CT_CORONAL when only axial and sagittal are present)
 * @property {string} toolName - Static tool identifier: 'VolumeCroppingControl'
 * @property {Array<SphereState>} sphereStates - Array of sphere state objects for 3D volume manipulation handles
 * @property {number|null} draggingSphereIndex - Index of currently dragged sphere, null when not dragging
 * @property {Types.Point3} toolCenter - Center point of the cropping volume in world coordinates [x, y, z]
 * @property {Types.Point3} toolCenterMin - Minimum bounds of the cropping volume in world coordinates [xMin, yMin, zMin]
 * @property {Types.Point3} toolCenterMax - Maximum bounds of the cropping volume in world coordinates [xMax, yMax, zMax]
 * @property {Function} _getReferenceLineColor - Optional callback to determine reference line color per viewport
 * @property {Function} _getReferenceLineControllable - Optional callback to determine if reference lines are interactive per viewport
 *
 * @configuration
 * @property {boolean} viewportIndicators - Whether to show colored circle indicators in viewport corners (default: false)
 * @property {Object} viewportIndicatorsConfig - Configuration for viewport indicators
 * @property {number} viewportIndicatorsConfig.radius - Radius of indicator circles in pixels (default: 5)
 * @property {number|null} viewportIndicatorsConfig.x - X position offset, null for auto-positioning
 * @property {number|null} viewportIndicatorsConfig.y - Y position offset, null for auto-positioning
 * @property {number} viewportIndicatorsConfig.xOffset - X position as fraction of viewport width (default: 0.95)
 * @property {number} viewportIndicatorsConfig.yOffset - Y position as fraction of viewport height (default: 0.05)
 * @property {number} viewportIndicatorsConfig.circleRadius - Circle radius as fraction of diagonal length
 * @property {boolean} extendReferenceLines - Whether to extend reference lines beyond intersection points with dashed lines (default: true)
 * @property {number} initialCropFactor - Initial cropping factor as percentage of volume bounds (default: 0.2)
 * @property {Object} mobile - Mobile-specific configuration
 * @property {boolean} mobile.enabled - Enable mobile touch interactions (default: false)
 * @property {number} mobile.opacity - Opacity for mobile interactions (default: 0.8)
 * @property {Object} lineColors - Color configuration for different viewport orientations
 * @property {number[]} lineColors.AXIAL - RGB color array for axial viewport lines [r, g, b] (default: [1.0, 0.0, 0.0])
 * @property {number[]} lineColors.CORONAL - RGB color array for coronal viewport lines [r, g, b] (default: [0.0, 1.0, 0.0])
 * @property {number[]} lineColors.SAGITTAL - RGB color array for sagittal viewport lines [r, g, b] (default: [1.0, 1.0, 0.0])
 * @property {number[]} lineColors.UNKNOWN - RGB color array for unknown orientation lines [r, g, b] (default: [0.0, 0.0, 1.0])
 * @property {number} lineWidth - Default width of reference lines in pixels (default: 1.5)
 * @property {number} lineWidthActive - Width of reference lines when actively dragging in pixels (default: 2.5)
 * @property {number} activeLineWidth - Alias for lineWidthActive for backward compatibility

 * @events
 * @event VOLUMECROPPINGCONTROL_TOOL_CHANGED - Fired when reference lines are dragged or tool state changes
 * @event VOLUMECROPPING_TOOL_CHANGED - Listens for changes from the main VolumeCroppingTool to synchronize state
 *
 *
 * @limitations
 * - Does not function independently without VolumeCroppingTool
 * - Requires volume data to be loaded before activation
 * - Limited to orthogonal viewport orientations (axial, coronal, sagittal)l
 */
class VolumeCroppingControlTool extends AnnotationTool {
  // Store virtual annotations (e.g., for missing orientations like CT_CORONAL)
  _virtualAnnotations: VolumeCroppingAnnotation[] = [];
  static toolName;
  seriesInstanceUID?: string;
  sphereStates: {
    point: Types.Point3;
    axis: string;
    uid: string;
    sphereSource;
    sphereActor;
  }[] = [];
  draggingSphereIndex: number | null = null;
  toolCenter: Types.Point3 = [0, 0, 0];
  toolCenterMin: Types.Point3 = [0, 0, 0];
  toolCenterMax: Types.Point3 = [0, 0, 0];
  _getReferenceLineColor?: (viewportId: string) => string;
  _getReferenceLineControllable?: (viewportId: string) => boolean;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        // renders a colored circle on top right of the viewports whose color
        // matches the color of the reference line
        viewportIndicators: false,
        viewportIndicatorsConfig: {
          radius: 5,
          x: null,
          y: null,
        },
        extendReferenceLines: true,
        initialCropFactor: 0.2,
        mobile: {
          enabled: false,
          opacity: 0.8,
        },
        lineColors: {
          AXIAL: [1.0, 0.0, 0.0], //  Red for axial
          CORONAL: [0.0, 1.0, 0.0], // Green for coronal
          SAGITTAL: [1.0, 1.0, 0.0], // Yellow for sagittal
          UNKNOWN: [0.0, 0.0, 1.0], // Blue for unknown
        },
        lineWidth: 1.5,
        lineWidthActive: 2.5,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._getReferenceLineColor =
      toolProps.configuration?.getReferenceLineColor ||
      defaultReferenceLineColor;
    this._getReferenceLineControllable =
      toolProps.configuration?.getReferenceLineControllable ||
      defaultReferenceLineControllable;

    const viewportsInfo = getToolGroup(this.toolGroupId)?.viewportsInfo;

    eventTarget.addEventListener(
      Events.VOLUMECROPPING_TOOL_CHANGED,
      this._onSphereMoved
    );

    if (viewportsInfo && viewportsInfo.length > 0) {
      const { viewportId, renderingEngineId } = viewportsInfo[0];
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(viewportId);
      const volumeActors = viewport.getActors();
      if (!volumeActors || !volumeActors.length) {
        console.warn(
          `VolumeCroppingControlTool: No volume actors found in viewport ${viewportId}.`
        );
        return;
      }
      const imageData = volumeActors[0].actor.getMapper().getInputData();
      if (imageData) {
        const dimensions = imageData.getDimensions();
        const spacing = imageData.getSpacing();
        const origin = imageData.getOrigin();
        this.seriesInstanceUID = imageData.seriesInstanceUID || 'unknown';
        const cropFactor = this.configuration.initialCropFactor ?? 0.2;
        this.toolCenter = [
          origin[0] + cropFactor * (dimensions[0] - 1) * spacing[0],
          origin[1] + cropFactor * (dimensions[1] - 1) * spacing[1],
          origin[2] + cropFactor * (dimensions[2] - 1) * spacing[2],
        ];
        const maxCropFactor = 1 - cropFactor;
        this.toolCenterMin = [
          origin[0] + cropFactor * (dimensions[0] - 1) * spacing[0],
          origin[1] + cropFactor * (dimensions[1] - 1) * spacing[1],
          origin[2] + cropFactor * (dimensions[2] - 1) * spacing[2],
        ];
        this.toolCenterMax = [
          origin[0] + maxCropFactor * (dimensions[0] - 1) * spacing[0],
          origin[1] + maxCropFactor * (dimensions[1] - 1) * spacing[1],
          origin[2] + maxCropFactor * (dimensions[2] - 1) * spacing[2],
        ];
      }
    }
  }

  _updateToolCentersFromViewport(viewport) {
    const volumeActors = viewport.getActors();
    if (!volumeActors || !volumeActors.length) {
      return;
    }
    const imageData = volumeActors[0].actor.getMapper().getInputData();
    if (!imageData) {
      return;
    }
    this.seriesInstanceUID = imageData.seriesInstanceUID || 'unknown';
    const dimensions = imageData.getDimensions();
    const spacing = imageData.getSpacing();
    const origin = imageData.getOrigin();
    const cropFactor = this.configuration.initialCropFactor ?? 0.2;
    const cropStart = cropFactor / 2;
    const cropEnd = 1 - cropFactor / 2;
    this.toolCenter = [
      origin[0] +
        ((cropStart + cropEnd) / 2) * (dimensions[0] - 1) * spacing[0],
      origin[1] +
        ((cropStart + cropEnd) / 2) * (dimensions[1] - 1) * spacing[1],
      origin[2] +
        ((cropStart + cropEnd) / 2) * (dimensions[2] - 1) * spacing[2],
    ];
    this.toolCenterMin = [
      origin[0] + cropStart * (dimensions[0] - 1) * spacing[0],
      origin[1] + cropStart * (dimensions[1] - 1) * spacing[1],
      origin[2] + cropStart * (dimensions[2] - 1) * spacing[2],
    ];
    this.toolCenterMax = [
      origin[0] + cropEnd * (dimensions[0] - 1) * spacing[0],
      origin[1] + cropEnd * (dimensions[1] - 1) * spacing[1],
      origin[2] + cropEnd * (dimensions[2] - 1) * spacing[2],
    ];
  }
  /**
   * Gets the camera from the viewport, and adds  annotation for the viewport
   * to the annotationManager. If any annotation is found in the annotationManager, it
   * overwrites it.
   * @param viewportInfo - The viewportInfo for the viewport
   * @returns viewPlaneNormal and center of viewport canvas in world space
   */
  initializeViewport = ({
    renderingEngineId,
    viewportId,
  }: Types.IViewportId): {
    normal: Types.Point3;
    point: Types.Point3;
  } => {
    if (!renderingEngineId || !viewportId) {
      console.warn(
        'VolumeCroppingControlTool: Missing renderingEngineId or viewportId'
      );
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
    this._updateToolCentersFromViewport(viewport);
    const { element } = viewport;
    const { position, focalPoint, viewPlaneNormal } = viewport.getCamera();

    // Check if there is already annotation for this viewport
    let annotations = this._getAnnotations(enabledElement);
    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (annotations?.length) {
      // If found, it will override it by removing the annotation and adding it later
      removeAnnotation(annotations[0].annotationUID);
    }

    // Determine orientation from camera normal, fallback to viewportId string
    const orientation = this._getOrientationFromNormal(
      viewport.getCamera().viewPlaneNormal
    );

    const annotation = {
      highlighted: false,
      metadata: {
        cameraPosition: <Types.Point3>[...position],
        cameraFocalPoint: <Types.Point3>[...focalPoint],
        toolName: this.getToolName(),
      },
      data: {
        handles: {
          toolCenter: this.toolCenter,
          toolCenterMin: this.toolCenterMin,
          toolCenterMax: this.toolCenterMax,
        },
        activeOperation: null, // 0 translation, 1 rotation handles, 2 slab thickness handles
        activeViewportIds: [], // a list of the viewport ids connected to the reference lines being translated
        viewportId,
        referenceLines: [], // set in renderAnnotation
        orientation,
      },
    };

    addAnnotation(annotation, element);
    return {
      normal: viewPlaneNormal,
      point: viewport.canvasToWorld([100, 100]),
    };
  };

  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports;
  };

  onSetToolInactive() {
    console.debug(
      `VolumeCroppingControlTool: onSetToolInactive called for tool ${this.getToolName()}`
    );
  }

  onSetToolActive() {
    // console.debug(
    //   `VolumeCroppingControlTool: onSetToolActive called for tool ${this.getToolName()}`
    // );
    const viewportsInfo = this._getViewportsInfo();

    // Check if any annotation exists before proceeding
    let anyAnnotationExists = false;
    for (const vpInfo of viewportsInfo) {
      const enabledElement = getEnabledElementByIds(
        vpInfo.viewportId,
        vpInfo.renderingEngineId
      );
      const annotations = this._getAnnotations(enabledElement);
      if (annotations && annotations.length > 0) {
        anyAnnotationExists = true;
        break;
      }
    }
    if (!anyAnnotationExists) {
      this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
      this._subscribeToViewportNewVolumeSet(viewportsInfo);
      // Request the volume cropping tool to send current planes
      this._computeToolCenter(viewportsInfo);
      triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
        toolGroupId: this.toolGroupId,
        viewportsInfo: viewportsInfo,
        seriesInstanceUID: this.seriesInstanceUID,
      });
    } else {
      // Turn off visibility of existing annotations
      for (const vpInfo of viewportsInfo) {
        const enabledElement = getEnabledElementByIds(
          vpInfo.viewportId,
          vpInfo.renderingEngineId
        );

        if (!enabledElement) {
          continue;
        }

        const annotations = this._getAnnotations(enabledElement);
        if (annotations && annotations.length > 0) {
          annotations.forEach((annotation) => {
            removeAnnotation(annotation.annotationUID);
          });
        }

        // Render after removing annotations to clear reference lines
        enabledElement.viewport.render();
      }
    }
  }

  onSetToolEnabled() {
    console.debug(
      `VolumeCroppingControlTool: onSetToolEnabled called for tool ${this.getToolName()}`
    );
    const viewportsInfo = this._getViewportsInfo();

    //this._computeToolCenter(viewportsInfo);
  }

  onSetToolDisabled() {
    console.debug(
      `VolumeCroppingControlTool: onSetToolDisabled called for tool ${this.getToolName()}`
    );
    const viewportsInfo = this._getViewportsInfo();

    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);

    // has no value when the tool is disabled
    // since viewports can change (zoom, pan, scroll)
    // between disabled and enabled/active states.
    // so we just remove the annotations from the state
    viewportsInfo.forEach(({ renderingEngineId, viewportId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const annotations = this._getAnnotations(enabledElement);
      if (annotations?.length) {
        annotations.forEach((annotation) => {
          removeAnnotation(annotation.annotationUID);
        });
      }
    });
  }

  resetCroppingSpheres = () => {
    const viewportsInfo = this._getViewportsInfo();
    for (const viewportInfo of viewportsInfo) {
      const { viewportId, renderingEngineId } = viewportInfo;
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const viewport = enabledElement.viewport as Types.IVolumeViewport;
      const resetPan = true;
      const resetZoom = true;
      const resetToCenter = true;
      const resetRotation = true;
      const suppressEvents = true;
      viewport.resetCamera({
        resetPan,
        resetZoom,
        resetToCenter,
        resetRotation,
        suppressEvents,
      });
      (viewport as Types.IVolumeViewport).resetSlabThickness();
      const { element } = viewport;
      let annotations = this._getAnnotations(enabledElement);
      annotations = this.filterInteractableAnnotationsForElement(
        element,
        annotations
      );
      if (annotations.length) {
        removeAnnotation(annotations[0].annotationUID);
      }
      viewport.render();
    }

    this._computeToolCenter(viewportsInfo);
  };

  computeToolCenter = () => {
    const viewportsInfo = this._getViewportsInfo();
  };

  _computeToolCenter = (viewportsInfo): void => {
    if (!viewportsInfo || !viewportsInfo[0]) {
      console.warn(
        '  _computeToolCenter : No valid viewportsInfo for computeToolCenter.'
      );
      return;
    }
    // Support any missing orientation
    const orientationIds = ['AXIAL', 'CORONAL', 'SAGITTAL'];
    // Get present orientations from viewportsInfo
    const presentOrientations = viewportsInfo
      .map((vp) => {
        if (vp.renderingEngineId) {
          const renderingEngine = getRenderingEngine(vp.renderingEngineId);
          const viewport = renderingEngine.getViewport(vp.viewportId);
          if (viewport && viewport.getCamera) {
            const orientation = this._getOrientationFromNormal(
              viewport.getCamera().viewPlaneNormal
            );
            if (orientation) {
              return orientation;
            }
          }
        }
        return null;
      })
      .filter(Boolean);

    const missingOrientation = orientationIds.find(
      (id) => !presentOrientations.includes(id)
    );

    // Initialize present viewports

    const presentNormals: Types.Point3[] = [];
    const presentCenters: Types.Point3[] = [];
    // Find present viewport infos by matching orientation, not viewportId
    const presentViewportInfos = viewportsInfo.filter((vp) => {
      let orientation = null;
      if (vp.renderingEngineId) {
        const renderingEngine = getRenderingEngine(vp.renderingEngineId);
        const viewport = renderingEngine.getViewport(vp.viewportId);
        if (viewport && viewport.getCamera) {
          orientation = this._getOrientationFromNormal(
            viewport.getCamera().viewPlaneNormal
          );
        }
      }
      return orientation && orientationIds.includes(orientation);
    });
    presentViewportInfos.forEach((vpInfo) => {
      const { normal, point } = this.initializeViewport(vpInfo);
      presentNormals.push(normal);
      presentCenters.push(point);
    });

    // If all three orientations are present, nothing to synthesize
    if (presentViewportInfos.length === 2 && missingOrientation) {
      // Synthesize virtual annotation for the missing orientation
      const virtualNormal: Types.Point3 = [0, 0, 0];
      vec3.cross(virtualNormal, presentNormals[0], presentNormals[1]);
      vec3.normalize(virtualNormal, virtualNormal);
      const virtualCenter: Types.Point3 = [
        (presentCenters[0][0] + presentCenters[1][0]) / 2,
        (presentCenters[0][1] + presentCenters[1][1]) / 2,
        (presentCenters[0][2] + presentCenters[1][2]) / 2,
      ];
      const orientation = null;
      const virtualAnnotation: VolumeCroppingAnnotation = {
        highlighted: false,
        metadata: {
          cameraPosition: <Types.Point3>[...virtualCenter],
          cameraFocalPoint: <Types.Point3>[...virtualCenter],
          toolName: this.getToolName(),
        },
        data: {
          handles: {
            activeOperation: null,
            toolCenter: this.toolCenter,
            toolCenterMin: this.toolCenterMin,
            toolCenterMax: this.toolCenterMax,
          },
          activeViewportIds: [],
          viewportId: missingOrientation,
          referenceLines: [],
          orientation,
        },
        isVirtual: true,
        virtualNormal,
      };
      this._virtualAnnotations = [virtualAnnotation];
    } else if (presentViewportInfos.length === 1) {
      // Synthesize two virtual annotations for the two missing orientations
      // Get present orientation from camera normal
      let presentOrientation = null;
      const vpInfo = presentViewportInfos[0];
      if (vpInfo.renderingEngineId) {
        const renderingEngine = getRenderingEngine(vpInfo.renderingEngineId);
        const viewport = renderingEngine.getViewport(vpInfo.viewportId);
        if (viewport && viewport.getCamera) {
          presentOrientation = this._getOrientationFromNormal(
            viewport.getCamera().viewPlaneNormal
          );
        }
      }
      const presentCenter = presentCenters[0];
      // Map canonical normals to orientation strings
      const canonicalNormals = {
        AXIAL: [0, 0, 1],
        CORONAL: [0, 1, 0],
        SAGITTAL: [1, 0, 0],
      };
      // missingIds: AXIAL, CORONAL, SAGITTAL
      const missingIds = orientationIds.filter(
        (id) => id !== presentOrientation
      );
      const virtualAnnotations: VolumeCroppingAnnotation[] = missingIds.map(
        (orientation) => {
          // Use orientation string to get canonical normal
          const normal = canonicalNormals[orientation];
          const virtualAnnotation = {
            highlighted: false,
            metadata: {
              cameraPosition: <Types.Point3>[...presentCenter],
              cameraFocalPoint: <Types.Point3>[...presentCenter],
              toolName: this.getToolName(),
            },
            data: {
              handles: {
                activeOperation: null,
                toolCenter: this.toolCenter,
                toolCenterMin: this.toolCenterMin,
                toolCenterMax: this.toolCenterMax,
              },
              activeViewportIds: [],
              viewportId: orientation, // Use orientation string for virtual annotation
              referenceLines: [],
              orientation,
            },
            isVirtual: true,
            virtualNormal: normal,
          };

          return virtualAnnotation;
        }
      );
      this._virtualAnnotations = virtualAnnotations;
    }

    if (viewportsInfo && viewportsInfo.length) {
      triggerAnnotationRenderForViewportIds(
        viewportsInfo.map(({ viewportId }) => viewportId)
      );
    }
  };
  /**
   * Utility function to map a camera normal to an orientation string.
   * Returns 'AXIAL', 'CORONAL', 'SAGITTAL', or null if not matched.
   */
  _getOrientationFromNormal(normal: Types.Point3): string | null {
    if (!normal) {
      return null;
    }
    // Canonical normals
    const canonical = {
      AXIAL: [0, 0, 1],
      CORONAL: [0, 1, 0],
      SAGITTAL: [1, 0, 0],
    };
    // Use a tolerance for floating point comparison
    const tol = 1e-2;
    for (const [key, value] of Object.entries(canonical)) {
      if (
        Math.abs(normal[0] - value[0]) < tol &&
        Math.abs(normal[1] - value[1]) < tol &&
        Math.abs(normal[2] - value[2]) < tol
      ) {
        return key;
      }
      // Also check negative direction
      if (
        Math.abs(normal[0] + value[0]) < tol &&
        Math.abs(normal[1] + value[1]) < tol &&
        Math.abs(normal[2] + value[2]) < tol
      ) {
        return key;
      }
    }
    return null;
  }
  _syncWithVolumeCroppingTool(originalClippingPlanes) {
    // Sync our tool centers with the clipping plane bounds
    const planes = originalClippingPlanes;
    if (planes.length >= 6) {
      this.toolCenterMin = [
        planes[0].origin[0], // XMIN
        planes[2].origin[1], // YMIN
        planes[4].origin[2], // ZMIN
      ];
      this.toolCenterMax = [
        planes[1].origin[0], // XMAX
        planes[3].origin[1], // YMAX
        planes[5].origin[2], // ZMAX
      ];
      this.toolCenter = [
        (this.toolCenterMin[0] + this.toolCenterMax[0]) / 2,
        (this.toolCenterMin[1] + this.toolCenterMax[1]) / 2,
        (this.toolCenterMin[2] + this.toolCenterMax[2]) / 2,
      ];

      // Update annotations based on their specific orientation
      const viewportsInfo = this._getViewportsInfo();
      viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
        const enabledElement = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        );
        if (enabledElement) {
          const annotations = this._getAnnotations(enabledElement);
          annotations.forEach((annotation) => {
            if (
              annotation.data &&
              annotation.data.handles &&
              annotation.data.orientation
            ) {
              const orientation = annotation.data.orientation;

              // Update tool centers based on the specific orientation
              if (orientation === 'AXIAL') {
                // Axial views see X and Y clipping planes
                annotation.data.handles.toolCenterMin = [
                  planes[0].origin[0], // XMIN
                  planes[2].origin[1], // YMIN
                  annotation.data.handles.toolCenterMin[2], // Keep existing Z
                ];
                annotation.data.handles.toolCenterMax = [
                  planes[1].origin[0], // XMAX
                  planes[3].origin[1], // YMAX
                  annotation.data.handles.toolCenterMax[2], // Keep existing Z
                ];
              } else if (orientation === 'CORONAL') {
                // Coronal views see X and Z clipping planes
                annotation.data.handles.toolCenterMin = [
                  planes[0].origin[0], // XMIN
                  annotation.data.handles.toolCenterMin[1], // Keep existing Y
                  planes[4].origin[2], // ZMIN
                ];
                annotation.data.handles.toolCenterMax = [
                  planes[1].origin[0], // XMAX
                  annotation.data.handles.toolCenterMax[1], // Keep existing Y
                  planes[5].origin[2], // ZMAX
                ];
              } else if (orientation === 'SAGITTAL') {
                // Sagittal views see Y and Z clipping planes
                annotation.data.handles.toolCenterMin = [
                  annotation.data.handles.toolCenterMin[0], // Keep existing X
                  planes[2].origin[1], // YMIN
                  planes[4].origin[2], // ZMIN
                ];
                annotation.data.handles.toolCenterMax = [
                  annotation.data.handles.toolCenterMax[0], // Keep existing X
                  planes[3].origin[1], // YMAX
                  planes[5].origin[2], // ZMAX
                ];
              }

              // Update the tool center as midpoint
              annotation.data.handles.toolCenter = [
                (annotation.data.handles.toolCenterMin[0] +
                  annotation.data.handles.toolCenterMax[0]) /
                  2,
                (annotation.data.handles.toolCenterMin[1] +
                  annotation.data.handles.toolCenterMax[1]) /
                  2,
                (annotation.data.handles.toolCenterMin[2] +
                  annotation.data.handles.toolCenterMax[2]) /
                  2,
              ];
            }
          });
        }
      });

      // Update virtual annotations as well
      if (this._virtualAnnotations && this._virtualAnnotations.length > 0) {
        this._virtualAnnotations.forEach((annotation) => {
          if (
            annotation.data &&
            annotation.data.handles &&
            annotation.data.orientation
          ) {
            const orientation = annotation.data.orientation.toUpperCase();

            // Apply the same orientation-specific logic to virtual annotations
            if (orientation === 'AXIAL') {
              annotation.data.handles.toolCenterMin = [
                planes[0].origin[0], // XMIN
                planes[2].origin[1], // YMIN
                annotation.data.handles.toolCenterMin[2],
              ];
              annotation.data.handles.toolCenterMax = [
                planes[1].origin[0], // XMAX
                planes[3].origin[1], // YMAX
                annotation.data.handles.toolCenterMax[2],
              ];
            } else if (orientation === 'CORONAL') {
              annotation.data.handles.toolCenterMin = [
                planes[0].origin[0], // XMIN
                annotation.data.handles.toolCenterMin[1],
                planes[4].origin[2], // ZMIN
              ];
              annotation.data.handles.toolCenterMax = [
                planes[1].origin[0], // XMAX
                annotation.data.handles.toolCenterMax[1],
                planes[5].origin[2], // ZMAX
              ];
            } else if (orientation === 'SAGITTAL') {
              annotation.data.handles.toolCenterMin = [
                annotation.data.handles.toolCenterMin[0],
                planes[2].origin[1], // YMIN
                planes[4].origin[2], // ZMIN
              ];
              annotation.data.handles.toolCenterMax = [
                annotation.data.handles.toolCenterMax[0],
                planes[3].origin[1], // YMAX
                planes[5].origin[2], // ZMAX
              ];
            }

            annotation.data.handles.toolCenter = [
              (annotation.data.handles.toolCenterMin[0] +
                annotation.data.handles.toolCenterMax[0]) /
                2,
              (annotation.data.handles.toolCenterMin[1] +
                annotation.data.handles.toolCenterMax[1]) /
                2,
              (annotation.data.handles.toolCenterMin[2] +
                annotation.data.handles.toolCenterMax[2]) /
                2,
            ];
          }
        });
      }

      // Trigger re-render to show updated reference lines
      triggerAnnotationRenderForViewportIds(
        viewportsInfo.map(({ viewportId }) => viewportId)
      );
    }
  }

  setToolCenter(toolCenter: Types.Point3, handleType): void {
    if (handleType === 'min') {
      this.toolCenterMin = [...toolCenter];
    } else if (handleType === 'max') {
      this.toolCenterMax = [...toolCenter];
    }
    const viewportsInfo = this._getViewportsInfo();

    // assuming all viewports are in the same rendering engine
    triggerAnnotationRenderForViewportIds(
      viewportsInfo.map(({ viewportId }) => viewportId)
    );
  }

  /**
   * addNewAnnotation is called when the user clicks on the image.
   * It does not store the annotation in the stateManager though.
   *
   * @param evt - The mouse event
   * @param interactionType - The type of interaction (e.g., mouse, touch, etc.)
   * @returns  annotation
   */

  addNewAnnotation(
    evt: EventTypes.InteractionEventType
  ): VolumeCroppingAnnotation {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const annotations = this._getAnnotations(enabledElement);
    const filteredAnnotations = this.filterInteractableAnnotationsForElement(
      viewport.element,
      annotations
    );

    // Guard clause: if no interactable annotation, return null
    if (
      !filteredAnnotations ||
      filteredAnnotations.length === 0 ||
      !filteredAnnotations[0]
    ) {
      return null;
    }

    const { data } = filteredAnnotations[0];

    const viewportIdArray = [];
    // put all the draggable reference lines in the viewportIdArray

    const referenceLines = data.referenceLines || [];
    for (let i = 0; i < referenceLines.length; ++i) {
      const otherViewport = referenceLines[i][0];
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );

      if (!viewportControllable) {
        continue;
      }
      viewportIdArray.push(otherViewport.id);
      i++;
    }

    data.activeViewportIds = [...viewportIdArray];
    // set translation operation
    data.handles.activeOperation = OPERATION.DRAG;

    evt.preventDefault();

    hideElementCursor(element);

    this._activateModify(element);
    return filteredAnnotations[0];
  }

  cancel = () => {
    console.log('Not implemented yet');
  };

  /**
   * It returns if the canvas point is near the provided volume cropping annotation in the
   * provided element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: VolumeCroppingAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    if (this._pointNearTool(element, annotation, canvasCoords, 6)) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    annotation.highlighted = true;
    this._activateModify(element);

    hideElementCursor(element);

    evt.preventDefault();
  };

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    handle: ToolHandle,
    interactionType: InteractionTypes
  ): void {
    // You can customize this logic as needed
    // For now, just call toolSelectedCallback if you want default behavior
    this.toolSelectedCallback(evt, annotation, interactionType);
  }

  onResetCamera = (evt) => {
    this.resetCroppingSpheres();
  };

  mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    filteredToolAnnotations: Annotations
  ): boolean => {
    if (!filteredToolAnnotations) {
      return;
    }
    const { element, currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas;
    let imageNeedsUpdate = false;

    for (let i = 0; i < filteredToolAnnotations.length; i++) {
      const annotation = filteredToolAnnotations[i] as VolumeCroppingAnnotation;

      if (isAnnotationLocked(annotation.annotationUID)) {
        continue;
      }

      const { data, highlighted } = annotation;
      if (!data.handles) {
        continue;
      }

      const previousActiveOperation = data.handles.activeOperation;
      const previousActiveViewportIds =
        data.activeViewportIds && data.activeViewportIds.length > 0
          ? [...data.activeViewportIds]
          : [];

      // This init are necessary, because when we move the mouse they are not cleaned by _endCallback
      data.activeViewportIds = [];
      let near = false;
      near = this._pointNearTool(element, annotation, canvasCoords, 6);

      const nearToolAndNotMarkedActive = near && !highlighted;
      const notNearToolAndMarkedActive = !near && highlighted;
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        annotation.highlighted = !highlighted;
        imageNeedsUpdate = true;
      }
    }

    return imageNeedsUpdate;
  };

  filterInteractableAnnotationsForElement = (element, annotations) => {
    if (!annotations || !annotations.length) {
      return [];
    }

    const enabledElement = getEnabledElement(element);
    // Use orientation property for matching
    let orientation = null;
    if (enabledElement.viewport && enabledElement.viewport.getCamera) {
      orientation = this._getOrientationFromNormal(
        enabledElement.viewport.getCamera().viewPlaneNormal
      );
    }

    // Filter annotations for this orientation, including virtual annotations
    const filtered = annotations.filter((annotation) => {
      // Always include virtual annotations for reference line rendering
      if (annotation.isVirtual) {
        return true;
      }
      // Match by orientation property
      if (
        annotation.data.orientation &&
        orientation &&
        annotation.data.orientation === orientation
      ) {
        return true;
      }
      return false;
    });

    return filtered;
  };

  /**
   * renders the volume cropping lines and handles in the requestAnimationFrame callback
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    function lineIntersection2D(p1, p2, q1, q2) {
      const s1_x = p2[0] - p1[0];
      const s1_y = p2[1] - p1[1];
      const s2_x = q2[0] - q1[0];
      const s2_y = q2[1] - q1[1];
      const denom = -s2_x * s1_y + s1_x * s2_y;
      if (Math.abs(denom) < 1e-8) {
        return null;
      } // Parallel
      const s = (-s1_y * (p1[0] - q1[0]) + s1_x * (p1[1] - q1[1])) / denom;
      const t = (s2_x * (p1[1] - q1[1]) - s2_y * (p1[0] - q1[0])) / denom;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return [p1[0] + t * s1_x, p1[1] + t * s1_y];
      }
      return null;
    }
    const viewportsInfo = this._getViewportsInfo();
    if (!viewportsInfo || viewportsInfo.length === 0) {
      // No viewports available
      return false;
    }
    let renderStatus = false;
    const { viewport, renderingEngine } = enabledElement;
    const { element } = viewport;
    let annotations = this._getAnnotations(enabledElement);
    // If we have virtual annotations , always include them
    if (this._virtualAnnotations && this._virtualAnnotations.length) {
      annotations = annotations.concat(this._virtualAnnotations);
    }
    const camera = viewport.getCamera();
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations);

    // viewport Annotation: use the first annotation for the current viewport
    const viewportAnnotation = filteredToolAnnotations[0];
    if (!viewportAnnotation || !viewportAnnotation.data) {
      // No annotation for this viewport
      return renderStatus;
    }

    const annotationUID = viewportAnnotation.annotationUID;

    // Get cameras/canvases for each of these.
    // -- Get two world positions for this canvas in this line (e.g. the diagonal)
    // -- Convert these world positions to this canvas.
    // -- Extend/confine this line to fit in this canvas.
    // -- Render this line.
    const { clientWidth, clientHeight } = viewport.canvas;
    const canvasDiagonalLength = Math.sqrt(
      clientWidth * clientWidth + clientHeight * clientHeight
    );

    const data = viewportAnnotation.data;
    // Get all other annotations except the current viewport's
    const otherViewportAnnotations = annotations;

    const volumeCroppingCenterCanvasMin = viewport.worldToCanvas(
      this.toolCenterMin
    );
    const volumeCroppingCenterCanvasMax = viewport.worldToCanvas(
      this.toolCenterMax
    );

    const referenceLines = [];

    // get canvas information for points and lines (canvas box, canvas horizontal distances)
    const canvasBox = [0, 0, clientWidth, clientHeight];

    otherViewportAnnotations.forEach((annotation) => {
      const data = annotation.data;
      // Type guard for isVirtual property
      const isVirtual =
        'isVirtual' in annotation &&
        (annotation as { isVirtual?: boolean }).isVirtual === true;
      data.handles.toolCenter = this.toolCenter;
      let otherViewport,
        otherCamera,
        clientWidth,
        clientHeight,
        otherCanvasDiagonalLength,
        otherCanvasCenter,
        otherViewportCenterWorld;
      if (isVirtual) {
        // Synthesize a virtual viewport/camera for any missing orientation
        const realViewports = viewportsInfo.filter(
          (vp) => vp.viewportId !== data.viewportId
        );
        if (realViewports.length === 2) {
          const vp1 = renderingEngine.getViewport(realViewports[0].viewportId);
          const vp2 = renderingEngine.getViewport(realViewports[1].viewportId);
          const normal1 = vp1.getCamera().viewPlaneNormal;
          const normal2 = vp2.getCamera().viewPlaneNormal;
          const virtualNormal = vec3.create();
          vec3.cross(virtualNormal, normal1, normal2);
          vec3.normalize(virtualNormal, virtualNormal);
          otherCamera = {
            viewPlaneNormal: virtualNormal,
            position: data.handles.toolCenter,
            focalPoint: data.handles.toolCenter,
            viewUp: [0, 1, 0],
          };
          clientWidth = viewport.canvas.clientWidth;
          clientHeight = viewport.canvas.clientHeight;
          otherCanvasDiagonalLength = Math.sqrt(
            clientWidth * clientWidth + clientHeight * clientHeight
          );
          otherCanvasCenter = [clientWidth * 0.5, clientHeight * 0.5];
          otherViewportCenterWorld = data.handles.toolCenter;
          otherViewport = {
            id: data.viewportId,
            canvas: viewport.canvas,
            canvasToWorld: () => data.handles.toolCenter,
          };
        } else {
          // Only one real viewport: use canonical normal from virtual annotation
          const virtualNormal = (annotation as VolumeCroppingAnnotation)
            .virtualNormal ?? [0, 0, 1];
          otherCamera = {
            viewPlaneNormal: virtualNormal,
            position: data.handles.toolCenter,
            focalPoint: data.handles.toolCenter,
            viewUp: [0, 1, 0],
          };
          clientWidth = viewport.canvas.clientWidth;
          clientHeight = viewport.canvas.clientHeight;
          otherCanvasDiagonalLength = Math.sqrt(
            clientWidth * clientWidth + clientHeight * clientHeight
          );
          otherCanvasCenter = [clientWidth * 0.5, clientHeight * 0.5];
          otherViewportCenterWorld = data.handles.toolCenter;
          otherViewport = {
            id: data.viewportId,
            canvas: viewport.canvas,
            canvasToWorld: () => data.handles.toolCenter,
          };
        }
      } else {
        otherViewport = renderingEngine.getViewport(data.viewportId as string);
        otherCamera = otherViewport.getCamera();
        clientWidth = otherViewport.canvas.clientWidth;
        clientHeight = otherViewport.canvas.clientHeight;
        otherCanvasDiagonalLength = Math.sqrt(
          clientWidth * clientWidth + clientHeight * clientHeight
        );
        otherCanvasCenter = [clientWidth * 0.5, clientHeight * 0.5];
        otherViewportCenterWorld =
          otherViewport.canvasToWorld(otherCanvasCenter);
      }

      const otherViewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );

      const direction = [0, 0, 0];
      vtkMath.cross(
        camera.viewPlaneNormal as [number, number, number],
        otherCamera.viewPlaneNormal as [number, number, number],
        direction as [number, number, number]
      );
      vtkMath.normalize(direction as [number, number, number]);
      vtkMath.multiplyScalar(
        direction as [number, number, number],
        otherCanvasDiagonalLength
      );

      const pointWorld0: [number, number, number] = [0, 0, 0];
      vtkMath.add(
        otherViewportCenterWorld as [number, number, number],
        direction as [number, number, number],
        pointWorld0
      );
      const pointWorld1: [number, number, number] = [0, 0, 0];
      vtkMath.subtract(
        otherViewportCenterWorld as [number, number, number],
        direction as [number, number, number],
        pointWorld1
      );

      const pointCanvas0 = viewport.worldToCanvas(pointWorld0 as Types.Point3);
      const otherViewportCenterCanvas = viewport.worldToCanvas([
        otherViewportCenterWorld[0] ?? 0,
        otherViewportCenterWorld[1] ?? 0,
        otherViewportCenterWorld[2] ?? 0,
      ] as [number, number, number] as Types.Point3);

      const canvasUnitVectorFromCenter = vec2.create();
      vec2.subtract(
        canvasUnitVectorFromCenter,
        pointCanvas0,
        otherViewportCenterCanvas
      );
      vec2.normalize(canvasUnitVectorFromCenter, canvasUnitVectorFromCenter);

      const canvasVectorFromCenterLong = vec2.create();
      vec2.scale(
        canvasVectorFromCenterLong,
        canvasUnitVectorFromCenter,
        canvasDiagonalLength * 100
      );

      // For min
      const refLinesCenterMin = otherViewportControllable
        ? vec2.clone(volumeCroppingCenterCanvasMin)
        : vec2.clone(otherViewportCenterCanvas);
      const refLinePointMinOne = vec2.create();
      const refLinePointMinTwo = vec2.create();
      vec2.add(
        refLinePointMinOne,
        refLinesCenterMin,
        canvasVectorFromCenterLong
      );
      vec2.subtract(
        refLinePointMinTwo,
        refLinesCenterMin,
        canvasVectorFromCenterLong
      );
      liangBarksyClip(refLinePointMinOne, refLinePointMinTwo, canvasBox);
      referenceLines.push([
        otherViewport,
        refLinePointMinOne,
        refLinePointMinTwo,
        'min',
      ]);

      // For max center
      const refLinesCenterMax = otherViewportControllable
        ? vec2.clone(volumeCroppingCenterCanvasMax)
        : vec2.clone(otherViewportCenterCanvas);
      const refLinePointMaxOne = vec2.create();
      const refLinePointMaxTwo = vec2.create();
      vec2.add(
        refLinePointMaxOne,
        refLinesCenterMax,
        canvasVectorFromCenterLong
      );
      vec2.subtract(
        refLinePointMaxTwo,
        refLinesCenterMax,
        canvasVectorFromCenterLong
      );
      liangBarksyClip(refLinePointMaxOne, refLinePointMaxTwo, canvasBox);
      referenceLines.push([
        otherViewport,
        refLinePointMaxOne,
        refLinePointMaxTwo,
        'max',
      ]);
    });

    data.referenceLines = referenceLines;

    const viewportColor = this._getReferenceLineColor(viewport.id);
    const color =
      viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)';

    referenceLines.forEach((line, lineIndex) => {
      // Calculate intersections with other lines in this viewport
      const intersections = [];
      for (let j = 0; j < referenceLines.length; ++j) {
        if (j === lineIndex) {
          continue;
        }
        const otherLine = referenceLines[j];
        const intersection = lineIntersection2D(
          line[1],
          line[2],
          otherLine[1],
          otherLine[2]
        );
        if (intersection) {
          intersections.push({
            with: otherLine[3], // 'min' or 'max'
            point: intersection,
          });
        }
      }

      // get color for the reference line using orientation
      const otherViewport = line[0];
      let orientation = null;
      // Try to get orientation from annotation data or viewportId
      if (otherViewport && otherViewport.id) {
        // Try to get from annotation if available
        const annotationForViewport = annotations.find(
          (a) => a.data.viewportId === otherViewport.id
        );
        if (annotationForViewport && annotationForViewport.data.orientation) {
          orientation = String(
            annotationForViewport.data.orientation
          ).toUpperCase();
        } else {
          // Fallback: try to infer from viewportId
          const idUpper = otherViewport.id.toUpperCase();
          if (idUpper.includes('AXIAL')) {
            orientation = 'AXIAL';
          } else if (idUpper.includes('CORONAL')) {
            orientation = 'CORONAL';
          } else if (idUpper.includes('SAGITTAL')) {
            orientation = 'SAGITTAL';
          }
        }
      }
      // Use lineColors from configuration
      const lineColors = this.configuration.lineColors || {};
      const colorArr = lineColors[orientation] ||
        lineColors.unknown || [1.0, 0.0, 0.0]; // fallback to red
      // Convert [r,g,b] to rgb string if needed
      const color = Array.isArray(colorArr)
        ? `rgb(${colorArr.map((v) => Math.round(v * 255)).join(',')})`
        : colorArr;

      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );
      const selectedViewportId = data.activeViewportIds.find(
        (id) => id === otherViewport.id
      );

      let lineWidth = this.configuration.lineWidth ?? 1.5;
      const lineActive =
        data.handles.activeOperation !== null &&
        data.handles.activeOperation === OPERATION.DRAG &&
        selectedViewportId;
      if (lineActive) {
        lineWidth = this.configuration.activeLineWidth ?? 2.5;
      }

      const lineUID = `${lineIndex}`;
      if (viewportControllable) {
        if (intersections.length === 2) {
          drawLineSvg(
            svgDrawingHelper,
            annotationUID,
            lineUID,
            intersections[0].point,
            intersections[1].point,
            {
              color,
              lineWidth,
            }
          );
        }
        if (
          this.configuration.extendReferenceLines &&
          intersections.length === 2
        ) {
          if (
            this.configuration.extendReferenceLines &&
            intersections.length === 2
          ) {
            // Sort intersections by distance from line start
            const sortedIntersections = intersections
              .map((intersection) => ({
                ...intersection,
                distance: vec2.distance(line[1], intersection.point),
              }))
              .sort((a, b) => a.distance - b.distance);

            // Draw dashed lines in correct order
            drawLineSvg(
              svgDrawingHelper,
              annotationUID,
              lineUID + '_dashed_before',
              line[1],
              sortedIntersections[0].point,
              { color, lineWidth, lineDash: [4, 4] }
            );

            drawLineSvg(
              svgDrawingHelper,
              annotationUID,
              lineUID + '_dashed_after',
              sortedIntersections[1].point,
              line[2],
              { color, lineWidth, lineDash: [4, 4] }
            );
          }
        }
      }
    });

    renderStatus = true;

    if (this.configuration.viewportIndicators) {
      const { viewportIndicatorsConfig } = this.configuration;
      const xOffset = viewportIndicatorsConfig?.xOffset || 0.95;
      const yOffset = viewportIndicatorsConfig?.yOffset || 0.05;
      const referenceColorCoordinates = [
        clientWidth * xOffset,
        clientHeight * yOffset,
      ];

      const circleRadius =
        viewportIndicatorsConfig?.circleRadius || canvasDiagonalLength * 0.01;

      const circleUID = '0';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID,
        referenceColorCoordinates as Types.Point2,
        circleRadius,
        { color, fill: color }
      );
    }

    return renderStatus;
  };

  _getAnnotations = (enabledElement: Types.IEnabledElement) => {
    const { viewport } = enabledElement;
    const annotations =
      getAnnotations(this.getToolName(), viewport.element) || [];
    const viewportIds = this._getViewportsInfo().map(
      ({ viewportId }) => viewportId
    );

    // filter the annotations to only keep that are for this toolGroup
    const toolGroupAnnotations = annotations.filter((annotation) => {
      const { data } = annotation;
      return viewportIds.includes(data.viewportId);
    });

    return toolGroupAnnotations;
  };

  _onSphereMoved = (evt) => {
    if (evt.detail.originalClippingPlanes) {
      this._syncWithVolumeCroppingTool(evt.detail.originalClippingPlanes);
    } else {
      if (evt.detail.seriesInstanceUID !== this.seriesInstanceUID) {
        return;
      }
      // This is called when a sphere is moved
      const { draggingSphereIndex, toolCenter } = evt.detail;
      const newMin: [number, number, number] = [...this.toolCenterMin];
      const newMax: [number, number, number] = [...this.toolCenterMax];
      // face spheres
      if (draggingSphereIndex >= 0 && draggingSphereIndex <= 5) {
        const axis = Math.floor(draggingSphereIndex / 2);
        const isMin = draggingSphereIndex % 2 === 0;
        (isMin ? newMin : newMax)[axis] = toolCenter[axis];
        this.setToolCenter(newMin, 'min');
        this.setToolCenter(newMax, 'max');
        return;
      }
      // corner spheres
      if (draggingSphereIndex >= 6 && draggingSphereIndex <= 13) {
        const idx = draggingSphereIndex;
        if (idx < 10) {
          newMin[0] = toolCenter[0];
        } else {
          newMax[0] = toolCenter[0];
        }
        if ([6, 7, 10, 11].includes(idx)) {
          newMin[1] = toolCenter[1];
        } else {
          newMax[1] = toolCenter[1];
        }
        if (idx % 2 === 0) {
          newMin[2] = toolCenter[2];
        } else {
          newMax[2] = toolCenter[2];
        }
        this.setToolCenter(newMin, 'min');
        this.setToolCenter(newMax, 'max');
      }
    }
  };

  _onNewVolume = () => {
    const viewportsInfo = this._getViewportsInfo();
    if (viewportsInfo && viewportsInfo.length > 0) {
      const { viewportId, renderingEngineId } = viewportsInfo[0];
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(viewportId);
      const volumeActors = viewport.getActors();
      if (volumeActors.length > 0) {
        const imageData = volumeActors[0].actor.getMapper().getInputData();
        if (imageData) {
          this.seriesInstanceUID = imageData.seriesInstanceUID;
          this._updateToolCentersFromViewport(viewport);
          // Update all annotations' handles.toolCenter
          const annotations =
            getAnnotations(this.getToolName(), viewportId) || [];
          annotations.forEach((annotation) => {
            if (annotation.data && annotation.data.handles) {
              annotation.data.handles.toolCenter = [...this.toolCenter];
            }
          });
        }
      }
    }
    this._computeToolCenter(viewportsInfo);
    triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
      toolGroupId: this.toolGroupId,
      viewportsInfo: viewportsInfo,
      seriesInstanceUID: this.seriesInstanceUID,
    });
  };

  _unsubscribeToViewportNewVolumeSet(viewportsInfo) {
    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const { viewport } = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const { element } = viewport;

      element.removeEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        this._onNewVolume
      );
    });
  }

  _subscribeToViewportNewVolumeSet(viewports) {
    viewports.forEach(({ viewportId, renderingEngineId }) => {
      const { viewport } = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const { element } = viewport;

      element.addEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        this._onNewVolume
      );
    });
  }

  _getAnnotationsForViewportsWithDifferentCameras = (
    enabledElement,
    annotations
  ) => {
    const { viewportId, renderingEngine, viewport } = enabledElement;

    const otherViewportAnnotations = annotations.filter(
      (annotation) => annotation.data.viewportId !== viewportId
    );

    if (!otherViewportAnnotations || !otherViewportAnnotations.length) {
      return [];
    }

    const camera = viewport.getCamera();
    const { viewPlaneNormal, position } = camera;

    const viewportsWithDifferentCameras = otherViewportAnnotations.filter(
      (annotation) => {
        const { viewportId } = annotation.data;
        const targetViewport = renderingEngine.getViewport(viewportId);
        const cameraOfTarget = targetViewport.getCamera();

        return !(
          csUtils.isEqual(
            cameraOfTarget.viewPlaneNormal,
            viewPlaneNormal,
            1e-2
          ) && csUtils.isEqual(cameraOfTarget.position, position, 1)
        );
      }
    );

    return viewportsWithDifferentCameras;
  };

  _filterViewportWithSameOrientation = (
    enabledElement,
    referenceAnnotation,
    annotations
  ) => {
    const { renderingEngine } = enabledElement;
    const { data } = referenceAnnotation;
    const viewport = renderingEngine.getViewport(data.viewportId);

    const linkedViewportAnnotations = annotations.filter((annotation) => {
      const { data } = annotation;
      const otherViewport = renderingEngine.getViewport(data.viewportId);
      const otherViewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );

      return otherViewportControllable === true;
    });

    if (!linkedViewportAnnotations || !linkedViewportAnnotations.length) {
      return [];
    }

    const camera = viewport.getCamera();
    const viewPlaneNormal = camera.viewPlaneNormal;
    vtkMath.normalize(viewPlaneNormal);

    const otherViewportsAnnotationsWithSameCameraDirection =
      linkedViewportAnnotations.filter((annotation) => {
        const { viewportId } = annotation.data;
        const otherViewport = renderingEngine.getViewport(viewportId);
        const otherCamera = otherViewport.getCamera();
        const otherViewPlaneNormal = otherCamera.viewPlaneNormal;
        vtkMath.normalize(otherViewPlaneNormal);

        return (
          csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) &&
          csUtils.isEqual(camera.viewUp, otherCamera.viewUp, 1e-2)
        );
      });

    return otherViewportsAnnotationsWithSameCameraDirection;
  };

  _activateModify = (element) => {
    // mobile sometimes has lingering interaction even when touchEnd triggers
    // this check allows for multiple handles to be active which doesn't affect
    // tool usage.
    state.isInteractingWithTool = !this.configuration.mobile?.enabled;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _endCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    this.editData.annotation.data.handles.activeOperation = null;
    this.editData.annotation.data.activeViewportIds = [];

    this._deactivateModify(element);

    resetElementCursor(element);

    this.editData = null;

    const requireSameOrientation = false;
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      requireSameOrientation
    );

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const delta = eventDetail.deltaPoints.world;

    if (
      Math.abs(delta[0]) < 1e-3 &&
      Math.abs(delta[1]) < 1e-3 &&
      Math.abs(delta[2]) < 1e-3
    ) {
      return;
    }

    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    if (viewport.type === Enums.ViewportType.VOLUME_3D) {
      return;
    }
    const annotations = this._getAnnotations(
      enabledElement
    ) as VolumeCroppingAnnotation[];
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations);

    // viewport Annotation
    const viewportAnnotation = filteredToolAnnotations[0];
    if (!viewportAnnotation) {
      return;
    }

    const { handles } = viewportAnnotation.data;

    if (handles.activeOperation === OPERATION.DRAG) {
      if (handles.activeType === 'min') {
        this.toolCenterMin[0] += delta[0];
        this.toolCenterMin[1] += delta[1];
        this.toolCenterMin[2] += delta[2];
      } else if (handles.activeType === 'max') {
        this.toolCenterMax[0] += delta[0];
        this.toolCenterMax[1] += delta[1];
        this.toolCenterMax[2] += delta[2];
      } else {
        this.toolCenter[0] += delta[0];
        this.toolCenter[1] += delta[1];
        this.toolCenter[2] += delta[2];
      }
      const viewportsInfo = this._getViewportsInfo();
      triggerAnnotationRenderForViewportIds(
        viewportsInfo.map(({ viewportId }) => viewportId)
      );
      triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
        toolGroupId: this.toolGroupId,
        toolCenter: this.toolCenter,
        toolCenterMin: this.toolCenterMin,
        toolCenterMax: this.toolCenterMax,
        handleType: handles.activeType,
        viewportOrientation: [],
        seriesInstanceUID: this.seriesInstanceUID,
      });
    }
  };

  _applyDeltaShiftToSelectedViewportCameras(
    renderingEngine,
    viewportsAnnotationsToUpdate,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    viewportsAnnotationsToUpdate.forEach((annotation) => {
      this._applyDeltaShiftToViewportCamera(renderingEngine, annotation, delta);
    });
  }

  _applyDeltaShiftToViewportCamera(
    renderingEngine: Types.IRenderingEngine,
    annotation,
    delta
  ) {
    const { data } = annotation;

    const viewport = renderingEngine.getViewport(data.viewportId);
    const camera = viewport.getCamera();
    const normal = camera.viewPlaneNormal;

    // Project delta over camera normal
    // (we don't need to pan, we need only to scroll the camera as in the wheel stack scroll tool)
    const dotProd = vtkMath.dot(delta, normal);
    const projectedDelta: Types.Point3 = [...normal];
    vtkMath.multiplyScalar(projectedDelta, dotProd);

    if (
      Math.abs(projectedDelta[0]) > 1e-3 ||
      Math.abs(projectedDelta[1]) > 1e-3 ||
      Math.abs(projectedDelta[2]) > 1e-3
    ) {
      const newFocalPoint: Types.Point3 = [0, 0, 0];
      const newPosition: Types.Point3 = [0, 0, 0];

      vtkMath.add(camera.focalPoint, projectedDelta, newFocalPoint);
      vtkMath.add(camera.position, projectedDelta, newPosition);

      viewport.setCamera({
        focalPoint: newFocalPoint,
        position: newPosition,
      });
      viewport.render();
    }
  }

  _pointNearTool(element, annotation, canvasCoords, proximity) {
    const { data } = annotation;

    // You must have referenceLines available in annotation.data.
    // If not, you can recompute them here or store them in renderAnnotation.
    // For this example, let's assume you store them as data.referenceLines.
    const referenceLines = data.referenceLines;

    const viewportIdArray = [];

    if (referenceLines) {
      for (let i = 0; i < referenceLines.length; ++i) {
        // Each line: [otherViewport, refLinePointOne, refLinePointMinOne, ...]
        const otherViewport = referenceLines[i][0];
        // First segment
        const start1 = referenceLines[i][1];
        const end1 = referenceLines[i][2];
        const type = referenceLines[i][3]; // 'min' or 'max'

        const distance1 = lineSegment.distanceToPoint(start1, end1, [
          canvasCoords[0],
          canvasCoords[1],
        ]);

        if (distance1 <= proximity) {
          viewportIdArray.push(otherViewport.id);
          data.handles.activeOperation = 1; // DRAG
          data.handles.activeType = type;
        }
      }
    }

    data.activeViewportIds = [...viewportIdArray];

    this.editData = {
      annotation,
    };
    return data.handles.activeOperation === 1 ? true : false;
  }
}

VolumeCroppingControlTool.toolName = 'VolumeCroppingControl';
export default VolumeCroppingControlTool;
