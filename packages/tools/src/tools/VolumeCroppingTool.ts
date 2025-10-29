import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import { mat3, mat4, vec3 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';

import { BaseTool } from './base';

import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  getEnabledElementByIds,
  getEnabledElement,
  Enums,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';

import { getToolGroup } from '../store/ToolGroupManager';
import { Events } from '../enums';

import type { EventTypes, PublicToolProps, ToolProps } from '../types';

const PLANEINDEX = {
  IMIN: 0,
  IMAX: 1,
  JMIN: 2,
  JMAX: 3,
  KMIN: 4,
  KMAX: 5,
};
const SPHEREINDEX = {
  // cube faces
  IMIN: 0,
  IMAX: 1,
  JMIN: 2,
  JMAX: 3,
  KMIN: 4,
  KMAX: 5,
  // cube corners
  IMIN_JMIN_KMIN: 6,
  IMIN_JMIN_KMAX: 7,
  IMIN_JMAX_KMIN: 8,
  IMIN_JMAX_KMAX: 9,
  IMAX_JMIN_KMIN: 10,
  IMAX_JMIN_KMAX: 11,
  IMAX_JMAX_KMIN: 12,
  IMAX_JMAX_KMAX: 13,
};

/**
 * VolumeCroppingTool provides manipulatable spheres and real-time volume cropping capabilities.
 *  It renders interactive handles (spheres) at face centers and corners of a cropping box, allowing users to precisely adjust volume boundaries through direct manipulation in 3D space.
 *
 * @remarks
 * This tool creates a complete 3D cropping interface with:
 * - 6 face spheres for individual axis cropping (along volume's I, J, K axes)
 * - 8 corner spheres for multi-axis cropping
 * - 12 edge lines connecting corner spheres
 * - Real-time clipping plane updates
 * - Synchronization with VolumeCroppingControlTool working on the same series instance UID for cross-viewport interaction
 * - Support for volumes with any orientation (including oblique/rotated volumes)
 *
 * The tool automatically adapts to the volume's orientation by using the volume's direction matrix.
 * Clipping planes are aligned with the volume's intrinsic axes (I, J, K) rather than world axes,
 * ensuring proper cropping regardless of how the volume is oriented in 3D space.
 *
 * @example
 * ```typescript
 * // Basic setup
 * const toolGroup = ToolGroupManager.createToolGroup('volume3D');
 * toolGroup.addTool(VolumeCroppingTool.toolName);
 *
 * // Configure with custom settings
 * toolGroup.setToolConfiguration(VolumeCroppingTool.toolName, {
 *   showCornerSpheres: true,
 *   showHandles: true,
 *   initialCropFactor: 0.1,
 *   sphereColors: {
 *     SAGITTAL: [1.0, 1.0, 0.0], // Yellow for I-axis (typically sagittal) spheres
 *     CORONAL: [0.0, 1.0, 0.0], // Green for J-axis (typically coronal) spheres
 *     AXIAL: [1.0, 0.0, 0.0], // Red for K-axis (typically axial) spheres
 *     CORNERS: [0.0, 0.0, 1.0] // Blue for corner spheres
 *   },
 *   sphereRadius: 10,
 *   grabSpherePixelDistance: 25
 * });
 *
 * // Activate the tool
 * toolGroup.setToolActive(VolumeCroppingTool.toolName);
 *
 * // Programmatically control visibility
 * const tool = toolGroup.getToolInstance(VolumeCroppingTool.toolName);
 * tool.setHandlesVisible(true);
 * tool.setClippingPlanesVisible(true);
 *
 * // Toggle visibility for interactive UI
 * function toggleCroppingInterface() {
 *   const handlesVisible = tool.getHandlesVisible();
 *   const planesVisible = tool.getClippingPlanesVisible();
 *
 *   // Toggle handles (spheres and edge lines)
 *   tool.setHandlesVisible(!handlesVisible);
 *
 *   // Toggle clipping effect
 *   tool.setClippingPlanesVisible(!planesVisible);
 *
 *   console.log(`Handles: ${!handlesVisible ? 'shown' : 'hidden'}`);
 *   console.log(`Cropping: ${!planesVisible ? 'active' : 'disabled'}`);
 * }
 *
 * // Common UI scenarios
 * // Show handles but disable cropping (for positioning)
 * tool.setHandlesVisible(true);
 * tool.setClippingPlanesVisible(false);
 *
 * // Hide handles but keep cropping active (for clean view)
 * tool.setHandlesVisible(false);
 * tool.setClippingPlanesVisible(true);
 * ```
 *
 * @public
 * @class VolumeCroppingTool
 * @extends BaseTool
 *
 * @property {string} toolName - Static tool identifier: 'VolumeCropping'
 * @property {string} seriesInstanceUID - Frame of reference for the tool
 * @property {Function} touchDragCallback - Touch drag event handler for mobile interactions
 * @property {Function} mouseDragCallback - Mouse drag event handler for desktop interactions
 * @property {Function} cleanUp - Cleanup function for resetting tool state after interactions
 * @property {Map} _resizeObservers - Map of ResizeObserver instances for viewport resize handling
 * @property {Function} _viewportAddedListener - Event listener for new viewport additions
 * @property {boolean} _hasResolutionChanged - Flag tracking if rendering resolution has been modified during interaction
 * @property {Array<Object>} originalClippingPlanes - Array of clipping plane objects with origin and normal vectors
 * @property {number|null} draggingSphereIndex - Index of currently dragged sphere, null when not dragging
 * @property {Types.Point3} toolCenter - Center point of the cropping volume in world coordinates [x, y, z]
 * @property {number[]|null} cornerDragOffset - 3D offset vector for corner sphere dragging [dx, dy, dz]
 * @property {number|null} faceDragOffset - 1D offset value for face sphere dragging along single axis
 * @property {Array<SphereState>} sphereStates - Array of sphere state objects containing position, VTK actors, and metadata
 * @property {Object} edgeLines - Dictionary of edge line actors connecting corner spheres for wireframe visualization
 *
 * @typedef {Object} SphereState
 * @property {Types.Point3} point - World coordinates of sphere center [x, y, z]
 * @property {string} axis - Axis identifier ('x', 'y', 'z', or 'corner')
 * @property {string} uid - Unique identifier for the sphere (e.g., 'x_min', 'corner_XMIN_YMIN_ZMIN')
 * @property {vtkSphereSource} sphereSource - VTK sphere geometry source
 * @property {vtkActor} sphereActor - VTK actor for rendering the sphere
 * @property {boolean} isCorner - Flag indicating if sphere is a corner (true) or face (false) sphere
 * @property {number[]} color - RGB color array [r, g, b] for sphere rendering
 *
 * @typedef {Object} EdgeLine
 * @property {vtkActor} actor - VTK actor for rendering the edge line
 * @property {vtkPolyData} source - VTK polydata source containing line geometry
 * @property {string} key1 - First corner identifier (e.g., 'XMIN_YMIN_ZMIN')
 * @property {string} key2 - Second corner identifier (e.g., 'XMAX_YMIN_ZMIN')
 *
 * @configuration
 * @property {boolean} showCornerSpheres - Whether to show corner manipulation spheres (default: true)
 * @property {boolean} showHandles - Whether to show all manipulation handles (spheres and edges) (default: true)
 * @property {boolean} showClippingPlanes - Whether to apply clipping planes to volume rendering (default: true)
 * @property {Object} mobile - Mobile device interaction settings
 * @property {boolean} mobile.enabled - Enable touch-based interactions on mobile devices (default: false)
 * @property {number} mobile.opacity - Opacity for mobile interaction feedback (default: 0.8)
 * @property {number} initialCropFactor - Initial cropping factor as fraction of volume bounds (default: 0.08)
 * @property {Object} sphereColors - Color configuration for different sphere types
 * @property {number[]} sphereColors.SAGITTAL - RGB color for sagittal (X-axis) face spheres [r, g, b] (default: [1.0, 1.0, 0.0])
 * @property {number[]} sphereColors.CORONAL - RGB color for coronal (Y-axis) face spheres [r, g, b] (default: [0.0, 1.0, 0.0])
 * @property {number[]} sphereColors.AXIAL - RGB color for axial (Z-axis) face spheres [r, g, b] (default: [1.0, 0.0, 0.0])
 * @property {number[]} sphereColors.CORNERS - RGB color for corner spheres [r, g, b] (default: [0.0, 0.0, 1.0])
 * @property {number} sphereRadius - Radius of manipulation spheres in world units (default: 8)
 * @property {number} grabSpherePixelDistance - Pixel distance threshold for sphere selection (default: 20)
 * @property {number} rotateIncrementDegrees - Rotation increment for camera rotation (default: 2)
 * @property {number} rotateSampleDistanceFactor - Sample distance multiplier during rotation for performance (default: 2)
 *
 * @events
 * @event VOLUMECROPPING_TOOL_CHANGED - Fired when sphere positions change or clipping planes are updated
 * @event VOLUMECROPPINGCONTROL_TOOL_CHANGED - Listens for changes from VolumeCroppingControlTool
 * @event VOLUME_VIEWPORT_NEW_VOLUME - Listens for new volume loading to reinitialize cropping bounds
 * @event TOOLGROUP_VIEWPORT_ADDED - Listens for new viewport additions to extend resize observation
 *
 * @methods
 * - **setHandlesVisible(visible: boolean)**: Show/hide manipulation spheres and edge lines
 * - **setClippingPlanesVisible(visible: boolean)**: Enable/disable volume clipping planes
 * - **getHandlesVisible()**: Get current handle visibility state
 * - **getClippingPlanesVisible()**: Get current clipping plane visibility state
 *
 *
 * @see {@link VolumeCroppingControlTool} - Companion tool for 2D viewport reference lines
 * @see {@link BaseTool} - Base class providing core tool functionality
 *
 */
class VolumeCroppingTool extends BaseTool {
  static toolName;
  seriesInstanceUID?: string;
  touchDragCallback: (evt: EventTypes.InteractionEventType) => void;
  mouseDragCallback: (evt: EventTypes.InteractionEventType) => void;
  cleanUp: () => void;
  _resizeObservers = new Map();
  _viewportAddedListener: (evt) => void;
  _hasResolutionChanged = false;
  originalClippingPlanes: { origin: number[]; normal: number[] }[] = [];
  draggingSphereIndex: number | null = null;
  toolCenter: Types.Point3 = [0, 0, 0];
  cornerDragOffset: [number, number, number] | null = null;
  faceDragOffset: number | null = null;
  // Store volume direction vectors for non-axis-aligned volumes
  volumeDirectionVectors: {
    iDir: Types.Point3; // First axis direction (rows)
    jDir: Types.Point3; // Second axis direction (columns)
    kDir: Types.Point3; // Third axis direction (slices)
  } | null = null;
  // Store  spheres for show/hide actor.
  sphereStates: {
    point: Types.Point3;
    axis: string;
    uid: string;
    sphereSource;
    sphereActor;
    isCorner: boolean;
    color: number[]; // [r, g, b] color for the sphere
  }[] = [];
  // Store 2D edge lines between corner spheres for show/hide actor.
  edgeLines: {
    [uid: string]: {
      actor: vtkActor;
      source: vtkPolyData;
      key1: string; //  key1,key2: Corner identifiers such as XMIN_YMIN_ZMIN to XMAX_YMIN_ZMIN
      key2: string;
    };
  } = {};

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {
        showCornerSpheres: true,
        showHandles: true,
        showClippingPlanes: true,
        mobile: {
          enabled: false,
          opacity: 0.8,
        },
        initialCropFactor: 0.08,
        sphereColors: {
          SAGITTAL: [1.0, 1.0, 0.0], //  Yellow for sagittal (X-axis)
          CORONAL: [0.0, 1.0, 0.0], // Green for coronal (Y-axis)
          AXIAL: [1.0, 0.0, 0.0], // Red for axial (Z-axis)
          CORNERS: [0.0, 0.0, 1.0], // Blue for corners
        },
        sphereRadius: 8,
        grabSpherePixelDistance: 20, //pixels threshold for closeness to the sphere being grabbed
        rotateIncrementDegrees: 2,
        rotateSampleDistanceFactor: 2, // Factor to increase sample distance (lower resolution) when rotating
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  onSetToolActive() {
    // console.debug('Setting tool active: volumeCropping', this.sphereStates);
    if (this.sphereStates && this.sphereStates.length > 0) {
      if (this.configuration.showHandles) {
        this.setHandlesVisible(false);
        this.setClippingPlanesVisible(false);
        //   console.debug('Setting tool active: hiding controls');
      } else {
        this.setHandlesVisible(true);
        this.setClippingPlanesVisible(true);
        // console.debug('Setting tool active: showing controls');
      }
    } else {
      const viewportsInfo = this._getViewportsInfo();
      const subscribeToElementResize = () => {
        viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
          if (!this._resizeObservers.has(viewportId)) {
            const { viewport } = getEnabledElementByIds(
              viewportId,
              renderingEngineId
            ) || { viewport: null };
            if (!viewport) {
              return;
            }
            const { element } = viewport;
            const resizeObserver = new ResizeObserver(() => {
              const element = getEnabledElementByIds(
                viewportId,
                renderingEngineId
              );
              if (!element) {
                return;
              }
              const { viewport } = element;
              const viewPresentation = viewport.getViewPresentation();
              viewport.resetCamera();
              viewport.setViewPresentation(viewPresentation);
              viewport.render();
            });
            resizeObserver.observe(element);
            this._resizeObservers.set(viewportId, resizeObserver);
          }
        });
      };

      subscribeToElementResize();

      this._viewportAddedListener = (evt) => {
        if (evt.detail.toolGroupId === this.toolGroupId) {
          subscribeToElementResize();
        }
      };

      eventTarget.addEventListener(
        Events.TOOLGROUP_VIEWPORT_ADDED,
        this._viewportAddedListener
      );

      this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
      this._subscribeToViewportNewVolumeSet(viewportsInfo);
      this._initialize3DViewports(viewportsInfo);

      if (this.sphereStates && this.sphereStates.length > 0) {
        this.setHandlesVisible(true);
      } else {
        //console.warn('Setting tool active: no spheres! trying to initialize');
        this.originalClippingPlanes = [];
        this._initialize3DViewports(viewportsInfo);
      }
    }
  }

  onSetToolConfiguration = (): void => {
    console.debug('Setting tool settoolconfiguration : volumeCropping');
    //this._init();
  };

  onSetToolEnabled = (): void => {
    console.debug('Setting tool enabled: volumeCropping');
  };

  onSetToolDisabled() {
    // console.debug('Setting tool disabled: volumeCropping');
    // Disconnect all resize observers
    this._resizeObservers.forEach((resizeObserver, viewportId) => {
      resizeObserver.disconnect();
      this._resizeObservers.delete(viewportId);
    });

    if (this._viewportAddedListener) {
      eventTarget.removeEventListener(
        Events.TOOLGROUP_VIEWPORT_ADDED,
        this._viewportAddedListener
      );
      this._viewportAddedListener = null; // Clear the reference to the listener
    }

    const viewportsInfo = this._getViewportsInfo();
    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
  }

  onCameraModified = (evt) => {
    const { element } = evt.currentTarget
      ? { element: evt.currentTarget }
      : evt.detail;
    const enabledElement = getEnabledElement(element);
    this._updateClippingPlanes(enabledElement.viewport);
    enabledElement.viewport.render();
  };

  preMouseDownCallback = (evt: EventTypes.InteractionEventType) => {
    //console.debug('VolumeCroppingTool.preMouseDownCallback called');
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const actorEntry = viewport.getDefaultActor();
    const actor = actorEntry.actor as Types.VolumeActor;
    const mapper = actor.getMapper();

    const mouseCanvas: [number, number] = [
      evt.detail.currentPoints.canvas[0],
      evt.detail.currentPoints.canvas[1],
    ];
    // Find the sphere under the mouse
    this.draggingSphereIndex = null;
    this.cornerDragOffset = null;
    this.faceDragOffset = null;
    for (let i = 0; i < this.sphereStates.length; ++i) {
      const sphereCanvas = viewport.worldToCanvas(this.sphereStates[i].point);
      const dist = Math.sqrt(
        Math.pow(mouseCanvas[0] - sphereCanvas[0], 2) +
          Math.pow(mouseCanvas[1] - sphereCanvas[1], 2)
      );
      if (dist < this.configuration.grabSpherePixelDistance) {
        this.draggingSphereIndex = i;
        element.style.cursor = 'grabbing';

        // --- Store offset for corners ---
        const sphereState = this.sphereStates[i];
        const mouseWorld = viewport.canvasToWorld(mouseCanvas);
        if (sphereState.isCorner) {
          this.cornerDragOffset = [
            sphereState.point[0] - mouseWorld[0],
            sphereState.point[1] - mouseWorld[1],
            sphereState.point[2] - mouseWorld[2],
          ];
          this.faceDragOffset = null;
        } else {
          // For face spheres, store the offset along the volume axis of movement
          const directionVector = this._getDirectionVectorForAxis(
            sphereState.axis
          );
          const delta = [
            sphereState.point[0] - mouseWorld[0],
            sphereState.point[1] - mouseWorld[1],
            sphereState.point[2] - mouseWorld[2],
          ];
          // Project offset onto axis direction
          this.faceDragOffset =
            delta[0] * directionVector[0] +
            delta[1] * directionVector[1] +
            delta[2] * directionVector[2];
          this.cornerDragOffset = null;
        }

        return true;
      }
    }

    const hasSampleDistance =
      'getSampleDistance' in mapper || 'getCurrentSampleDistance' in mapper;

    if (!hasSampleDistance) {
      return true;
    }

    const originalSampleDistance = mapper.getSampleDistance();

    if (!this._hasResolutionChanged) {
      const { rotateSampleDistanceFactor } = this.configuration;
      mapper.setSampleDistance(
        originalSampleDistance * rotateSampleDistanceFactor
      );
      this._hasResolutionChanged = true;

      if (this.cleanUp !== null) {
        // Clean up previous event listener
        document.removeEventListener('mouseup', this.cleanUp);
      }

      this.cleanUp = () => {
        mapper.setSampleDistance(originalSampleDistance);

        // Reset cursor style
        (evt.target as HTMLElement).style.cursor = '';
        if (this.draggingSphereIndex !== null) {
          const sphereState = this.sphereStates[this.draggingSphereIndex];
          const [viewport3D] = this._getViewportsInfo();
          const renderingEngine = getRenderingEngine(
            viewport3D.renderingEngineId
          );
          const viewport = renderingEngine.getViewport(viewport3D.viewportId);

          if (sphereState.isCorner) {
            this._updateCornerSpheres();
            this._updateFaceSpheresFromCorners();
            this._updateClippingPlanesFromFaceSpheres(viewport);
          }
        }
        this.draggingSphereIndex = null;
        this.cornerDragOffset = null;
        this.faceDragOffset = null;

        viewport.render();
        this._hasResolutionChanged = false;
      };

      document.addEventListener('mouseup', this.cleanUp, { once: true });
    }

    return true;
  };

  /**
   * Sets the visibility of the cropping handles (spheres and edge lines).
   *
   * When handles are being shown, this method automatically synchronizes the sphere positions
   * with the current clipping plane positions to ensure visual consistency. This includes
   * updating face spheres, corner spheres, and edge lines to match the current crop bounds.
   *
   * @param visible - Whether to show or hide the cropping handles
   *
   * @example
   * ```typescript
   * // Hide all cropping handles
   * volumeCroppingTool.setHandlesVisible(false);
   *
   * // Show handles and sync with current crop state
   * volumeCroppingTool.setHandlesVisible(true);
   * ```
   *
   */
  setHandlesVisible(visible: boolean) {
    this.configuration.showHandles = visible;
    // Before showing, update sphere positions to match clipping planes
    if (visible) {
      // Update face spheres from the current clipping planes
      this.sphereStates[SPHEREINDEX.IMIN].point = [
        ...this.originalClippingPlanes[PLANEINDEX.IMIN].origin,
      ] as Types.Point3;
      this.sphereStates[SPHEREINDEX.IMAX].point = [
        ...this.originalClippingPlanes[PLANEINDEX.IMAX].origin,
      ] as Types.Point3;
      this.sphereStates[SPHEREINDEX.JMIN].point = [
        ...this.originalClippingPlanes[PLANEINDEX.JMIN].origin,
      ] as Types.Point3;
      this.sphereStates[SPHEREINDEX.JMAX].point = [
        ...this.originalClippingPlanes[PLANEINDEX.JMAX].origin,
      ] as Types.Point3;
      this.sphereStates[SPHEREINDEX.KMIN].point = [
        ...this.originalClippingPlanes[PLANEINDEX.KMIN].origin,
      ] as Types.Point3;
      this.sphereStates[SPHEREINDEX.KMAX].point = [
        ...this.originalClippingPlanes[PLANEINDEX.KMAX].origin,
      ] as Types.Point3;

      // Update all sphere actors' positions
      [
        SPHEREINDEX.IMIN,
        SPHEREINDEX.IMAX,
        SPHEREINDEX.JMIN,
        SPHEREINDEX.JMAX,
        SPHEREINDEX.KMIN,
        SPHEREINDEX.KMAX,
      ].forEach((idx) => {
        const s = this.sphereStates[idx];
        s.sphereSource.setCenter(...s.point);
        s.sphereSource.modified();
      });

      // Update corners and edges as well
      this._updateCornerSpheres();
    }

    // Show/hide actors
    this._updateHandlesVisibility();

    // Render
    const viewportsInfo = this._getViewportsInfo();
    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);
    viewport.render();
  }

  /**
   * Gets the current visibility state of the cropping handles.
   *
   * @returns Whether the cropping handles (spheres and edge lines) are currently visible
   *
   * @example
   * ```typescript
   * // Check if handles are currently visible
   * const handlesVisible = volumeCroppingTool.getHandlesVisible();
   * if (handlesVisible) {
   *   console.log('Cropping handles are currently shown');
   * } else {
   *   console.log('Cropping handles are currently hidden');
   * }
   * ```
   *
   * @remarks
   * This method returns the configuration state, which controls the visibility of:
   * - Face spheres (6 spheres for individual axis cropping)
   * - Corner spheres (8 spheres for multi-axis cropping)
   * - Edge lines connecting the corner spheres
   */
  getHandlesVisible() {
    return this.configuration.showHandles;
  }

  /**
   * Gets the current visibility state of the clipping planes.
   *
   * @returns Whether the clipping planes are currently visible and actively cropping the volume
   *
   * @example
   * ```typescript
   * // Check if clipping planes are currently active
   * const planesVisible = volumeCroppingTool.getClippingPlanesVisible();
   * if (planesVisible) {
   *   console.log('Volume is currently being cropped');
   * } else {
   *   console.log('Volume is displayed in full');
   * }
   * ```
   *
   * @remarks
   * This method returns the configuration state that controls whether:
   * - The volume rendering respects the current clipping plane boundaries
   * - Parts of the volume outside the crop bounds are hidden from view
   * - The cropping effect is applied to the 3D volume visualization
   */
  getClippingPlanesVisible() {
    return this.configuration.showClippingPlanes;
  }

  /**
   * Sets the visibility of the clipping planes to enable or disable volume cropping.
   *
   * When clipping planes are visible, the volume rendering is cropped according to the
   * current sphere positions. When disabled, the full volume is displayed without cropping.
   * The viewport is automatically re-rendered after the change.
   *
   * @param visible - Whether to enable (true) or disable (false) volume clipping
   *
   * @example
   * ```typescript
   * // Enable volume cropping
   * volumeCroppingTool.setClippingPlanesVisible(true);
   *
   * // Disable volume cropping to show full volume
   * volumeCroppingTool.setClippingPlanesVisible(false);
   * ```
   *
   * @remarks
   * - When enabled, parts of the volume outside the crop bounds are hidden
   * - When disabled, all clipping planes are removed from the volume mapper
   * - The cropping bounds are determined by the current sphere positions
   * - The viewport is automatically re-rendered to reflect the change
   * - This method updates the internal configuration and applies changes immediately
   */
  setClippingPlanesVisible(visible: boolean) {
    this.configuration.showClippingPlanes = visible;
    const viewport = this._getViewport();
    this._updateClippingPlanes(viewport);
    viewport.render();
  }

  _dragCallback(evt: EventTypes.InteractionEventType): void {
    const { element, currentPoints, lastPoints } = evt.detail;

    if (this.draggingSphereIndex !== null) {
      // crop handles
      this._onMouseMoveSphere(evt);
    } else {
      // rotate
      const currentPointsCanvas = currentPoints.canvas;
      const lastPointsCanvas = lastPoints.canvas;
      const { rotateIncrementDegrees } = this.configuration;
      const enabledElement = getEnabledElement(element);
      const { viewport } = enabledElement;

      const camera = viewport.getCamera();
      const width = element.clientWidth;
      const height = element.clientHeight;

      const normalizedPosition = [
        currentPointsCanvas[0] / width,
        currentPointsCanvas[1] / height,
      ];

      const normalizedPreviousPosition = [
        lastPointsCanvas[0] / width,
        lastPointsCanvas[1] / height,
      ];

      const center: Types.Point2 = [width * 0.5, height * 0.5];
      // NOTE: centerWorld corresponds to the focal point in cornerstone3D
      const centerWorld = viewport.canvasToWorld(center);
      const normalizedCenter = [0.5, 0.5];

      const radsq = (1.0 + Math.abs(normalizedCenter[0])) ** 2.0;
      const op = [normalizedPreviousPosition[0], 0, 0];
      const oe = [normalizedPosition[0], 0, 0];

      const opsq = op[0] ** 2;
      const oesq = oe[0] ** 2;

      const lop = opsq > radsq ? 0 : Math.sqrt(radsq - opsq);
      const loe = oesq > radsq ? 0 : Math.sqrt(radsq - oesq);

      const nop: Types.Point3 = [op[0], 0, lop];
      vtkMath.normalize(nop);
      const noe: Types.Point3 = [oe[0], 0, loe];
      vtkMath.normalize(noe);

      const dot = vtkMath.dot(nop, noe);
      if (Math.abs(dot) > 0.0001) {
        const angleX =
          -2 *
          Math.acos(vtkMath.clampValue(dot, -1.0, 1.0)) *
          Math.sign(normalizedPosition[0] - normalizedPreviousPosition[0]) *
          rotateIncrementDegrees;

        const upVec = camera.viewUp;
        const atV = camera.viewPlaneNormal;
        const rightV: Types.Point3 = [0, 0, 0];
        const forwardV: Types.Point3 = [0, 0, 0];

        vtkMath.cross(upVec, atV, rightV);
        vtkMath.normalize(rightV);

        vtkMath.cross(atV, rightV, forwardV);
        vtkMath.normalize(forwardV);
        vtkMath.normalize(upVec);

        this._rotateCamera(viewport, centerWorld, forwardV, angleX);

        const angleY =
          (normalizedPreviousPosition[1] - normalizedPosition[1]) *
          rotateIncrementDegrees;

        this._rotateCamera(viewport, centerWorld, rightV, angleY);
      }

      viewport.render();
    }
  }

  _onMouseMoveSphere = (evt) => {
    if (this.draggingSphereIndex === null) {
      return false;
    }

    const sphereState = this.sphereStates[this.draggingSphereIndex];
    if (!sphereState) {
      return false;
    }

    // Get viewport and world coordinates
    const { viewport, world } = this._getViewportAndWorldCoords(evt);
    if (!viewport || !world) {
      return false;
    }

    // Handle sphere movement based on type WITHOUT updating clipping planes yet
    if (sphereState.isCorner) {
      // For corner dragging in arbitrarily-oriented volumes:
      // 1. Calculate the new corner position
      // 2. Determine which faces this corner belongs to
      // 3. Update those face spheres by projecting corner movement onto volume axes
      // 4. Update all corners from the new face positions

      const newCorner = this._calculateNewCornerPosition(world);
      const oldCorner = sphereState.point;

      // Parse which axes this corner belongs to (min or max for each of I, J, K)
      const axisFlags = this._parseCornerKey(sphereState.uid);

      if (!this.volumeDirectionVectors) return false;
      const { iDir, jDir, kDir } = this.volumeDirectionVectors;

      // Calculate movement delta
      const delta = [
        newCorner[0] - oldCorner[0],
        newCorner[1] - oldCorner[1],
        newCorner[2] - oldCorner[2],
      ];

      // Project delta onto each volume axis
      const deltaI =
        delta[0] * iDir[0] + delta[1] * iDir[1] + delta[2] * iDir[2];
      const deltaJ =
        delta[0] * jDir[0] + delta[1] * jDir[1] + delta[2] * jDir[2];
      const deltaK =
        delta[0] * kDir[0] + delta[1] * kDir[1] + delta[2] * kDir[2];

      // Update the appropriate face spheres based on which corner this is
      if (axisFlags.isIMin) {
        const faceIMin = this.sphereStates[SPHEREINDEX.IMIN];
        faceIMin.point = [
          faceIMin.point[0] + deltaI * iDir[0],
          faceIMin.point[1] + deltaI * iDir[1],
          faceIMin.point[2] + deltaI * iDir[2],
        ];
        faceIMin.sphereSource.setCenter(...faceIMin.point);
        faceIMin.sphereSource.modified();
      } else if (axisFlags.isIMax) {
        const faceIMax = this.sphereStates[SPHEREINDEX.IMAX];
        faceIMax.point = [
          faceIMax.point[0] + deltaI * iDir[0],
          faceIMax.point[1] + deltaI * iDir[1],
          faceIMax.point[2] + deltaI * iDir[2],
        ];
        faceIMax.sphereSource.setCenter(...faceIMax.point);
        faceIMax.sphereSource.modified();
      }

      if (axisFlags.isJMin) {
        const faceJMin = this.sphereStates[SPHEREINDEX.JMIN];
        faceJMin.point = [
          faceJMin.point[0] + deltaJ * jDir[0],
          faceJMin.point[1] + deltaJ * jDir[1],
          faceJMin.point[2] + deltaJ * jDir[2],
        ];
        faceJMin.sphereSource.setCenter(...faceJMin.point);
        faceJMin.sphereSource.modified();
      } else if (axisFlags.isJMax) {
        const faceJMax = this.sphereStates[SPHEREINDEX.JMAX];
        faceJMax.point = [
          faceJMax.point[0] + deltaJ * jDir[0],
          faceJMax.point[1] + deltaJ * jDir[1],
          faceJMax.point[2] + deltaJ * jDir[2],
        ];
        faceJMax.sphereSource.setCenter(...faceJMax.point);
        faceJMax.sphereSource.modified();
      }

      if (axisFlags.isKMin) {
        const faceKMin = this.sphereStates[SPHEREINDEX.KMIN];
        faceKMin.point = [
          faceKMin.point[0] + deltaK * kDir[0],
          faceKMin.point[1] + deltaK * kDir[1],
          faceKMin.point[2] + deltaK * kDir[2],
        ];
        faceKMin.sphereSource.setCenter(...faceKMin.point);
        faceKMin.sphereSource.modified();
      } else if (axisFlags.isKMax) {
        const faceKMax = this.sphereStates[SPHEREINDEX.KMAX];
        faceKMax.point = [
          faceKMax.point[0] + deltaK * kDir[0],
          faceKMax.point[1] + deltaK * kDir[1],
          faceKMax.point[2] + deltaK * kDir[2],
        ];
        faceKMax.sphereSource.setCenter(...faceKMax.point);
        faceKMax.sphereSource.modified();
      }

      // Now update all corners from the new face positions
      this._updateCornerSpheres();
    } else {
      // Update face sphere position - project movement onto volume axis
      const directionVector = this._getDirectionVectorForAxis(sphereState.axis);

      // Project the mouse world position onto the line defined by the sphere's axis
      const delta = [
        world[0] - sphereState.point[0],
        world[1] - sphereState.point[1],
        world[2] - sphereState.point[2],
      ];

      // Dot product to get distance along axis
      const distanceAlongAxis =
        delta[0] * directionVector[0] +
        delta[1] * directionVector[1] +
        delta[2] * directionVector[2];

      // Apply offset if we have one
      let adjustedDistance = distanceAlongAxis;
      if (this.faceDragOffset !== null) {
        adjustedDistance += this.faceDragOffset;
      }

      // Update sphere position along the axis
      sphereState.point = [
        sphereState.point[0] + adjustedDistance * directionVector[0],
        sphereState.point[1] + adjustedDistance * directionVector[1],
        sphereState.point[2] + adjustedDistance * directionVector[2],
      ];
      sphereState.sphereSource.setCenter(...sphereState.point);
      sphereState.sphereSource.modified();

      // Update corners from face spheres
      this._updateCornerSpheresFromFaces();
      this._updateFaceSpheresFromCorners();
      this._updateCornerSpheres();
    }

    // // THEN update clipping planes
    this._updateClippingPlanesFromFaceSpheres(viewport);

    // Final render and event trigger
    viewport.render();

    this._triggerToolChangedEvent(sphereState);

    return true;
  };

  _onControlToolChange = (evt) => {
    const viewport = this._getViewport();
    if (!evt.detail.toolCenter) {
      triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, {
        originalClippingPlanes: this.originalClippingPlanes,
        viewportId: viewport.id,
        renderingEngineId: viewport.renderingEngineId,
        seriesInstanceUID: this.seriesInstanceUID,
      });
    } else {
      if (evt.detail.seriesInstanceUID !== this.seriesInstanceUID) {
        return;
      }
      const isMin = evt.detail.handleType === 'min';
      const toolCenter = isMin
        ? evt.detail.toolCenterMin
        : evt.detail.toolCenterMax;

      if (!this.volumeDirectionVectors) {
        console.warn('Volume direction vectors not initialized');
        return;
      }

      const { iDir, jDir, kDir } = this.volumeDirectionVectors;
      const normals = isMin
        ? [iDir, jDir, kDir]
        : [
            [-iDir[0], -iDir[1], -iDir[2]],
            [-jDir[0], -jDir[1], -jDir[2]],
            [-kDir[0], -kDir[1], -kDir[2]],
          ];
      const planeIndices = isMin
        ? [PLANEINDEX.IMIN, PLANEINDEX.JMIN, PLANEINDEX.KMIN]
        : [PLANEINDEX.IMAX, PLANEINDEX.JMAX, PLANEINDEX.KMAX];
      const sphereIndices = isMin
        ? [SPHEREINDEX.IMIN, SPHEREINDEX.JMIN, SPHEREINDEX.KMIN]
        : [SPHEREINDEX.IMAX, SPHEREINDEX.JMAX, SPHEREINDEX.KMAX];
      const axes = ['i', 'j', 'k'];
      const orientationAxes = [
        Enums.OrientationAxis.SAGITTAL,
        Enums.OrientationAxis.CORONAL,
        Enums.OrientationAxis.AXIAL,
      ];

      // Update planes and spheres for each axis
      for (let i = 0; i < 3; ++i) {
        const origin: [number, number, number] = [0, 0, 0];
        origin[i] = toolCenter[i];
        const plane = vtkPlane.newInstance({
          origin,
          normal: normals[i] as [number, number, number],
        });
        this.originalClippingPlanes[planeIndices[i]].origin = plane.getOrigin();

        // Update face sphere
        this.sphereStates[sphereIndices[i]].point[i] = plane.getOrigin()[i];
        this.sphereStates[sphereIndices[i]].sphereSource.setCenter(
          ...this.sphereStates[sphereIndices[i]].point
        );
        this.sphereStates[sphereIndices[i]].sphereSource.modified();

        // Update center for other face spheres (not on this axis)
        const otherSphere = this.sphereStates.find(
          (s, idx) => s.axis === axes[i] && idx !== sphereIndices[i]
        );
        const newCenter = (otherSphere.point[i] + plane.getOrigin()[i]) / 2;
        this.sphereStates.forEach((state) => {
          if (
            !state.isCorner &&
            state.axis !== axes[i] &&
            !evt.detail.viewportOrientation.includes(orientationAxes[i])
          ) {
            state.point[i] = newCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
            state.sphereSource.modified();
          }
        });

        // Update vtk clipping plane origin
        const volumeActor = viewport.getDefaultActor()?.actor;
        if (volumeActor) {
          const mapper = volumeActor.getMapper() as vtkVolumeMapper;
          const clippingPlanes = mapper.getClippingPlanes();
          if (clippingPlanes) {
            clippingPlanes[planeIndices[i]].setOrigin(plane.getOrigin());
          }
        }
      }
      this._updateCornerSpheres();
      viewport.render();
    }
  };
  _updateClippingPlanes(viewport) {
    // Get the actor and transformation matrix
    const actorEntry = viewport.getDefaultActor();
    if (!actorEntry || !actorEntry.actor) {
      // Only warn once per session for missing actor
      if (!viewport._missingActorWarned) {
        console.warn(
          'VolumeCroppingTool._updateClippingPlanes: No default actor found in viewport.'
        );
        viewport._missingActorWarned = true;
      }
      return;
    }
    const actor = actorEntry.actor;
    const mapper = actor.getMapper();
    const matrix = actor.getMatrix();

    // Only update if clipping planes are visible
    if (!this.configuration.showClippingPlanes) {
      mapper.removeAllClippingPlanes();
      return;
    }

    // Extract rotation part for normals
    const rot = mat3.create();
    mat3.fromMat4(rot, matrix);
    // Compute inverse transpose for normal transformation
    const normalMatrix = mat3.create();
    mat3.invert(normalMatrix, rot);
    mat3.transpose(normalMatrix, normalMatrix);

    // Cache transformed origins/normals to avoid repeated work
    const originalPlanes = this.originalClippingPlanes;
    if (!originalPlanes || !originalPlanes.length) {
      return;
    }

    // Only remove/add if the number of planes has changed or matrix has changed
    // (Assume matrix changes frequently, so always update for now)
    mapper.removeAllClippingPlanes();

    // Preallocate arrays for transformed origins/normals
    const transformedOrigins: Types.Point3[] = [];
    const transformedNormals: Types.Point3[] = [];

    for (let i = 0; i < originalPlanes.length; ++i) {
      const plane = originalPlanes[i];
      // Transform origin (full 4x4)
      const oVec = vec3.create();
      vec3.transformMat4(oVec, new Float32Array(plane.origin), matrix);
      const o: [number, number, number] = [oVec[0], oVec[1], oVec[2]];
      // Transform normal (rotation only)
      const nVec = vec3.create();
      vec3.transformMat3(nVec, new Float32Array(plane.normal), normalMatrix);
      vec3.normalize(nVec, nVec);
      const n: [number, number, number] = [nVec[0], nVec[1], nVec[2]];
      transformedOrigins.push(o);
      transformedNormals.push(n);
    }

    // Create and add planes in a single loop
    for (let i = 0; i < transformedOrigins.length; ++i) {
      // Use cached transformed values
      const planeInstance = vtkPlane.newInstance({
        origin: transformedOrigins[i],
        normal: transformedNormals[i],
      });
      mapper.addClippingPlane(planeInstance);
    }
  }

  _updateHandlesVisibility() {
    // Spheres
    this.sphereStates.forEach((state) => {
      if (state.sphereActor) {
        state.sphereActor.setVisibility(this.configuration.showHandles);
      }
    });

    // Edge lines (box edges)
    Object.values(this.edgeLines).forEach(({ actor }) => {
      if (actor) {
        actor.setVisibility(this.configuration.showHandles);
      }
    });
  }

  _addLine3DBetweenPoints(
    viewport,
    point1,
    point2,
    color: [number, number, number] = [0.7, 0.7, 0.7],
    uid = ''
  ) {
    // Avoid creating a line if the points are the same
    if (
      point1[0] === point2[0] &&
      point1[1] === point2[1] &&
      point1[2] === point2[2]
    ) {
      return { actor: null, source: null };
    }
    const points = vtkPoints.newInstance();
    points.setNumberOfPoints(2);
    points.setPoint(0, point1[0], point1[1], point1[2]);
    points.setPoint(1, point2[0], point2[1], point2[2]);

    const lines = vtkCellArray.newInstance({ values: [2, 0, 1] });
    const polyData = vtkPolyData.newInstance();
    polyData.setPoints(points);
    polyData.setLines(lines);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polyData);
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(...color);
    actor.getProperty().setLineWidth(0.5); // Thinner line
    actor.getProperty().setOpacity(1.0);
    actor.getProperty().setInterpolationToFlat(); // No shading
    actor.getProperty().setAmbient(1.0); // Full ambient
    actor.getProperty().setDiffuse(0.0); // No diffuse
    actor.getProperty().setSpecular(0.0); // No specular
    actor.setVisibility(this.configuration.showHandles);
    viewport.addActor({ actor, uid });
    return { actor, source: polyData };
  }

  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports;
  };

  _addSphere(
    viewport,
    point,
    axis,
    position,
    cornerKey = null,
    adaptiveRadius
  ) {
    // Generate a unique UID for each sphere based on its axis and position
    // Use cornerKey for corners, otherwise axis+position for faces
    const uid = cornerKey ? `corner_${cornerKey}` : `${axis}_${position}`;
    const sphereState = this.sphereStates.find((s) => s.uid === uid);
    if (sphereState) {
      return;
    }
    const sphereSource = vtkSphereSource.newInstance();
    sphereSource.setCenter(point);
    sphereSource.setRadius(adaptiveRadius);
    const sphereMapper = vtkMapper.newInstance();
    sphereMapper.setInputConnection(sphereSource.getOutputPort());
    const sphereActor = vtkActor.newInstance();
    sphereActor.setMapper(sphereMapper);
    let color: [number, number, number] = [0.0, 1.0, 0.0]; // Default green
    const sphereColors = this.configuration.sphereColors || {};

    if (cornerKey) {
      color = sphereColors.CORNERS || [0.0, 0.0, 1.0]; // Use corners color from config, fallback to blue
    } else if (axis === 'k') {
      color = sphereColors.AXIAL || [1.0, 0.0, 0.0]; // K-axis (slice direction) = AXIAL planes
    } else if (axis === 'i') {
      color = sphereColors.SAGITTAL || [1.0, 1.0, 0.0]; // I-axis (row direction) = SAGITTAL planes
    } else if (axis === 'j') {
      color = sphereColors.CORONAL || [0.0, 1.0, 0.0]; // J-axis (column direction) = CORONAL planes
    }
    // Store or update the sphere position
    const idx = this.sphereStates.findIndex((s) => s.uid === uid);
    if (idx === -1) {
      this.sphereStates.push({
        point: point.slice(),
        axis,
        uid,
        sphereSource,
        sphereActor,
        isCorner: !!cornerKey,
        color,
      });
    } else {
      this.sphereStates[idx].point = point.slice();
      this.sphereStates[idx].sphereSource = sphereSource;
    }

    // Remove existing actor with this UID if present
    const existingActors = viewport.getActors();
    const existing = existingActors.find((a) => a.uid === uid);
    if (existing) {
      //viewport.removeActor(uid);
      return;
    }
    sphereActor.getProperty().setColor(color);
    sphereActor.setVisibility(this.configuration.showHandles);
    viewport.addActor({ actor: sphereActor, uid: uid });
  }
  /**
   * Extract volume direction vectors from imageData.
   * The direction matrix defines the volume's orientation in world space.
   * @param imageData - The VTK image data
   * @returns Object containing the three orthogonal direction vectors
   */
  _extractVolumeDirectionVectors(imageData): {
    iDir: Types.Point3;
    jDir: Types.Point3;
    kDir: Types.Point3;
  } {
    const direction = imageData.getDirection();
    // Direction is a 9-element array: [i0, i1, i2, j0, j1, j2, k0, k1, k2]
    // These should already be unit vectors, but let's verify and normalize
    const iDir: Types.Point3 = [direction[0], direction[1], direction[2]];
    const jDir: Types.Point3 = [direction[3], direction[4], direction[5]];
    const kDir: Types.Point3 = [direction[6], direction[7], direction[8]];

    // Normalize to ensure they are unit vectors
    const iLen = Math.sqrt(
      iDir[0] * iDir[0] + iDir[1] * iDir[1] + iDir[2] * iDir[2]
    );
    const jLen = Math.sqrt(
      jDir[0] * jDir[0] + jDir[1] * jDir[1] + jDir[2] * jDir[2]
    );
    const kLen = Math.sqrt(
      kDir[0] * kDir[0] + kDir[1] * kDir[1] + kDir[2] * kDir[2]
    );

    const iDirNorm: Types.Point3 = [
      iDir[0] / iLen,
      iDir[1] / iLen,
      iDir[2] / iLen,
    ];
    const jDirNorm: Types.Point3 = [
      jDir[0] / jLen,
      jDir[1] / jLen,
      jDir[2] / jLen,
    ];
    const kDirNorm: Types.Point3 = [
      kDir[0] / kLen,
      kDir[1] / kLen,
      kDir[2] / kLen,
    ];

    return { iDir: iDirNorm, jDir: jDirNorm, kDir: kDirNorm };
  }

  /**
   * Get the direction vector for a given axis ('i', 'j', or 'k').
   * @param axis - The axis identifier
   * @returns The direction vector in world space
   */
  _getDirectionVectorForAxis(axis: string): Types.Point3 {
    if (!this.volumeDirectionVectors) {
      console.error('Volume direction vectors not initialized');
      // Fallback to axis-aligned
      if (axis === 'i') return [1, 0, 0];
      if (axis === 'j') return [0, 1, 0];
      if (axis === 'k') return [0, 0, 1];
      return [1, 0, 0];
    }

    switch (axis) {
      case 'i':
        return this.volumeDirectionVectors.iDir;
      case 'j':
        return this.volumeDirectionVectors.jDir;
      case 'k':
        return this.volumeDirectionVectors.kDir;
      default:
        console.error(`Unknown axis: ${axis}`);
        return [1, 0, 0];
    }
  }

  /**
   * Calculate an adaptive sphere radius based on the diagonal of the volume.
   * This allows the sphere size to scale with the volume size.
   * @param diagonal The diagonal length of the volume in world coordinates.
   * @returns The calculated adaptive radius, clamped between min and max limits.
   */
  _calculateAdaptiveSphereRadius(diagonal): number {
    // Get base radius from configuration (acts as a scaling factor)
    const baseRadius =
      this.configuration.sphereRadius !== undefined
        ? this.configuration.sphereRadius
        : 8;

    // Scale radius as a percentage of diagonal (adjustable factor)
    const scaleFactor = this.configuration.sphereRadiusScale || 0.01; // 1% of diagonal by default
    const adaptiveRadius = diagonal * scaleFactor;

    // Apply min/max limits to prevent too small or too large spheres
    const minRadius = this.configuration.minSphereRadius || 2;
    const maxRadius = this.configuration.maxSphereRadius || 50;

    return Math.max(minRadius, Math.min(maxRadius, adaptiveRadius));
  }

  _initialize3DViewports = (viewportsInfo): void => {
    if (!viewportsInfo || !viewportsInfo.length || !viewportsInfo[0]) {
      console.warn(
        'VolumeCroppingTool: No viewportsInfo available for initialization of volumecroppingtool.'
      );
      return;
    }
    const viewport = this._getViewport();
    const volumeActors = viewport.getActors();
    if (!volumeActors || volumeActors.length === 0) {
      console.warn(
        'VolumeCroppingTool: No volume actors found in the viewport.'
      );
      return;
    }
    const imageData = volumeActors[0].actor.getMapper().getInputData();
    if (!imageData) {
      console.warn('VolumeCroppingTool: No image data found for volume actor.');
      return;
    }
    this.seriesInstanceUID = imageData.seriesInstanceUID || 'unknown';

    // Extract volume direction vectors
    this.volumeDirectionVectors =
      this._extractVolumeDirectionVectors(imageData);
    const { iDir, jDir, kDir } = this.volumeDirectionVectors;

    // Get volume bounds and dimensions in index space
    const dimensions = imageData.getDimensions();
    const spacing = imageData.getSpacing();
    const origin = imageData.getOrigin();

    const cropFactor = this.configuration.initialCropFactor || 0.1;

    // Calculate cropping range in index space
    const iMin = cropFactor * dimensions[0];
    const iMax = (1 - cropFactor) * dimensions[0];
    const jMin = cropFactor * dimensions[1];
    const jMax = (1 - cropFactor) * dimensions[1];
    const kMin = cropFactor * dimensions[2];
    const kMax = (1 - cropFactor) * dimensions[2];

    // Helper function to convert index to world coordinates
    const indexToWorld = (i: number, j: number, k: number): Types.Point3 => {
      return [
        origin[0] +
          i * spacing[0] * iDir[0] +
          j * spacing[1] * jDir[0] +
          k * spacing[2] * kDir[0],
        origin[1] +
          i * spacing[0] * iDir[1] +
          j * spacing[1] * jDir[1] +
          k * spacing[2] * kDir[1],
        origin[2] +
          i * spacing[0] * iDir[2] +
          j * spacing[1] * jDir[2] +
          k * spacing[2] * kDir[2],
      ];
    };

    // Calculate center of each face in index space
    const iCenter = (iMin + iMax) / 2;
    const jCenter = (jMin + jMax) / 2;
    const kCenter = (kMin + kMax) / 2;

    // Calculate world positions for face centers
    const faceIMin = indexToWorld(iMin, jCenter, kCenter);
    const faceIMax = indexToWorld(iMax, jCenter, kCenter);
    const faceJMin = indexToWorld(iCenter, jMin, kCenter);
    const faceJMax = indexToWorld(iCenter, jMax, kCenter);
    const faceKMin = indexToWorld(iCenter, jCenter, kMin);
    const faceKMax = indexToWorld(iCenter, jCenter, kMax);

    // Create clipping planes with normals based on volume orientation
    const planeIMin = vtkPlane.newInstance({
      origin: faceIMin,
      normal: iDir, // Normal points in +I direction
    });
    const planeIMax = vtkPlane.newInstance({
      origin: faceIMax,
      normal: [-iDir[0], -iDir[1], -iDir[2]], // Normal points in -I direction
    });
    const planeJMin = vtkPlane.newInstance({
      origin: faceJMin,
      normal: jDir, // Normal points in +J direction
    });
    const planeJMax = vtkPlane.newInstance({
      origin: faceJMax,
      normal: [-jDir[0], -jDir[1], -jDir[2]], // Normal points in -J direction
    });
    const planeKMin = vtkPlane.newInstance({
      origin: faceKMin,
      normal: kDir, // Normal points in +K direction
    });
    const planeKMax = vtkPlane.newInstance({
      origin: faceKMax,
      normal: [-kDir[0], -kDir[1], -kDir[2]], // Normal points in -K direction
    });

    const planes: vtkPlane[] = [
      planeIMin,
      planeIMax,
      planeJMin,
      planeJMax,
      planeKMin,
      planeKMax,
    ];

    const originalPlanes = planes.map((plane) => ({
      origin: [...plane.getOrigin()],
      normal: [...plane.getNormal()],
    }));

    this.originalClippingPlanes = originalPlanes;

    // Calculate world diagonal for adaptive sphere radius
    const diag0 = indexToWorld(0, 0, 0);
    const diag1 = indexToWorld(dimensions[0], dimensions[1], dimensions[2]);
    const diagonal = Math.sqrt(
      Math.pow(diag1[0] - diag0[0], 2) +
        Math.pow(diag1[1] - diag0[1], 2) +
        Math.pow(diag1[2] - diag0[2], 2)
    );
    const adaptiveRadius = this._calculateAdaptiveSphereRadius(diagonal);

    // Add face spheres - now using 'i', 'j', 'k' instead of 'x', 'y', 'z'
    this._addSphere(viewport, faceIMin, 'i', 'min', null, adaptiveRadius);
    this._addSphere(viewport, faceIMax, 'i', 'max', null, adaptiveRadius);
    this._addSphere(viewport, faceJMin, 'j', 'min', null, adaptiveRadius);
    this._addSphere(viewport, faceJMax, 'j', 'max', null, adaptiveRadius);
    this._addSphere(viewport, faceKMin, 'k', 'min', null, adaptiveRadius);
    this._addSphere(viewport, faceKMax, 'k', 'max', null, adaptiveRadius);

    // Calculate all 8 corners in world space
    const corners = [
      indexToWorld(iMin, jMin, kMin),
      indexToWorld(iMin, jMin, kMax),
      indexToWorld(iMin, jMax, kMin),
      indexToWorld(iMin, jMax, kMax),
      indexToWorld(iMax, jMin, kMin),
      indexToWorld(iMax, jMin, kMax),
      indexToWorld(iMax, jMax, kMin),
      indexToWorld(iMax, jMax, kMax),
    ];

    const cornerKeys = [
      'IMIN_JMIN_KMIN',
      'IMIN_JMIN_KMAX',
      'IMIN_JMAX_KMIN',
      'IMIN_JMAX_KMAX',
      'IMAX_JMIN_KMIN',
      'IMAX_JMIN_KMAX',
      'IMAX_JMAX_KMIN',
      'IMAX_JMAX_KMAX',
    ];

    for (let i = 0; i < corners.length; i++) {
      this._addSphere(
        viewport,
        corners[i],
        'corner',
        null,
        cornerKeys[i],
        adaptiveRadius
      );
    }

    // draw the lines between corners
    // All 12 edges as pairs of corner keys
    const edgeCornerPairs = [
      // I edges (along first axis)
      ['IMIN_JMIN_KMIN', 'IMAX_JMIN_KMIN'],
      ['IMIN_JMIN_KMAX', 'IMAX_JMIN_KMAX'],
      ['IMIN_JMAX_KMIN', 'IMAX_JMAX_KMIN'],
      ['IMIN_JMAX_KMAX', 'IMAX_JMAX_KMAX'],
      // J edges (along second axis)
      ['IMIN_JMIN_KMIN', 'IMIN_JMAX_KMIN'],
      ['IMIN_JMIN_KMAX', 'IMIN_JMAX_KMAX'],
      ['IMAX_JMIN_KMIN', 'IMAX_JMAX_KMIN'],
      ['IMAX_JMIN_KMAX', 'IMAX_JMAX_KMAX'],
      // K edges (along third axis)
      ['IMIN_JMIN_KMIN', 'IMIN_JMIN_KMAX'],
      ['IMIN_JMAX_KMIN', 'IMIN_JMAX_KMAX'],
      ['IMAX_JMIN_KMIN', 'IMAX_JMIN_KMAX'],
      ['IMAX_JMAX_KMIN', 'IMAX_JMAX_KMAX'],
    ];

    edgeCornerPairs.forEach(([key1, key2], i) => {
      const state1 = this.sphereStates.find((s) => s.uid === `corner_${key1}`);
      const state2 = this.sphereStates.find((s) => s.uid === `corner_${key2}`);
      if (state1 && state2) {
        const uid = `edge_${key1}_${key2}`;
        const { actor, source } = this._addLine3DBetweenPoints(
          viewport,
          state1.point,
          state2.point,
          [0.7, 0.7, 0.7],
          uid
        );
        this.edgeLines[uid] = { actor, source, key1, key2 };
      }
    });

    const mapper = viewport
      .getDefaultActor()
      .actor.getMapper() as vtkVolumeMapper;

    mapper.addClippingPlane(planeIMin);
    mapper.addClippingPlane(planeIMax);
    mapper.addClippingPlane(planeJMin);
    mapper.addClippingPlane(planeJMax);
    mapper.addClippingPlane(planeKMin);
    mapper.addClippingPlane(planeKMax);

    eventTarget.addEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      (evt) => {
        this._onControlToolChange(evt);
      }
    );
    viewport.render();
  };

  // Helper method to get viewport and world coordinates
  _getViewportAndWorldCoords = (evt) => {
    const viewport = this._getViewport();
    const x = evt.detail.currentPoints.canvas[0];
    const y = evt.detail.currentPoints.canvas[1];
    const world = viewport.canvasToWorld([x, y]);

    return { viewport, world };
  };

  _getViewport = () => {
    const [viewport3D] = this._getViewportsInfo();
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    return renderingEngine.getViewport(viewport3D.viewportId);
  };

  // Handle face sphere movement
  _handleFaceSphereMovement = (sphereState, world, viewport) => {
    // Project movement onto the volume axis
    const directionVector = this._getDirectionVectorForAxis(sphereState.axis);

    // Project the mouse world position onto the line defined by the sphere's axis
    const delta = [
      world[0] - sphereState.point[0],
      world[1] - sphereState.point[1],
      world[2] - sphereState.point[2],
    ];

    // Dot product to get distance along axis
    let distanceAlongAxis =
      delta[0] * directionVector[0] +
      delta[1] * directionVector[1] +
      delta[2] * directionVector[2];

    if (this.faceDragOffset !== null) {
      distanceAlongAxis += this.faceDragOffset;
    }

    // Update sphere position along the axis
    sphereState.point = [
      sphereState.point[0] + distanceAlongAxis * directionVector[0],
      sphereState.point[1] + distanceAlongAxis * directionVector[1],
      sphereState.point[2] + distanceAlongAxis * directionVector[2],
    ];
    sphereState.sphereSource.setCenter(...sphereState.point);
    sphereState.sphereSource.modified();

    // Update dependent elements
    this._updateAfterFaceMovement(viewport);
  };

  // Calculate new corner position with offset
  _calculateNewCornerPosition = (world) => {
    let newCorner = [world[0], world[1], world[2]];

    if (this.cornerDragOffset) {
      newCorner = [
        world[0] + this.cornerDragOffset[0],
        world[1] + this.cornerDragOffset[1],
        world[2] + this.cornerDragOffset[2],
      ];
    }

    return newCorner;
  };

  // Parse corner key to determine which axes are min/max
  _parseCornerKey = (uid) => {
    const cornerKey = uid.replace('corner_', '');
    return {
      isIMin: cornerKey.includes('IMIN'),
      isIMax: cornerKey.includes('IMAX'),
      isJMin: cornerKey.includes('JMIN'),
      isJMax: cornerKey.includes('JMAX'),
      isKMin: cornerKey.includes('KMIN'),
      isKMax: cornerKey.includes('KMAX'),
    };
  };

  // Update sphere position
  _updateSpherePosition = (sphereState, newPosition) => {
    sphereState.point = newPosition;
    sphereState.sphereSource.setCenter(...newPosition);
    sphereState.sphereSource.modified();
  };

  // Update after face movement
  _updateAfterFaceMovement = (viewport) => {
    this._updateCornerSpheresFromFaces();
    // this._updateFaceSpheresFromCorners();
    // this._updateCornerSpheres();
    this._updateClippingPlanesFromFaceSpheres(viewport);
  };

  // Trigger tool changed event
  _triggerToolChangedEvent = (sphereState) => {
    triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, {
      toolCenter: sphereState.point,
      axis: sphereState.isCorner ? 'corner' : sphereState.axis,
      draggingSphereIndex: this.draggingSphereIndex,
      seriesInstanceUID: this.seriesInstanceUID,
    });
  };

  _updateClippingPlanesFromFaceSpheres(viewport) {
    const mapper = viewport.getDefaultActor().actor.getMapper();
    // Update origins in originalClippingPlanes
    this.originalClippingPlanes[PLANEINDEX.IMIN].origin = [
      ...this.sphereStates[SPHEREINDEX.IMIN].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.IMAX].origin = [
      ...this.sphereStates[SPHEREINDEX.IMAX].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.JMIN].origin = [
      ...this.sphereStates[SPHEREINDEX.JMIN].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.JMAX].origin = [
      ...this.sphereStates[SPHEREINDEX.JMAX].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.KMIN].origin = [
      ...this.sphereStates[SPHEREINDEX.KMIN].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.KMAX].origin = [
      ...this.sphereStates[SPHEREINDEX.KMAX].point,
    ];

    mapper.removeAllClippingPlanes();
    for (let i = 0; i < 6; ++i) {
      const origin = this.originalClippingPlanes[i].origin as [
        number,
        number,
        number,
      ];
      const normal = this.originalClippingPlanes[i].normal as [
        number,
        number,
        number,
      ];
      const plane = vtkPlane.newInstance({
        origin,
        normal,
      });
      mapper.addClippingPlane(plane);
    }
  }

  _updateCornerSpheresFromFaces() {
    if (!this.volumeDirectionVectors) return;

    // Get face sphere positions
    const faceIMin = this.sphereStates[SPHEREINDEX.IMIN].point;
    const faceIMax = this.sphereStates[SPHEREINDEX.IMAX].point;
    const faceJMin = this.sphereStates[SPHEREINDEX.JMIN].point;
    const faceJMax = this.sphereStates[SPHEREINDEX.JMAX].point;
    const faceKMin = this.sphereStates[SPHEREINDEX.KMIN].point;
    const faceKMax = this.sphereStates[SPHEREINDEX.KMAX].point;

    // Helper function to find intersection of three planes
    // Each corner is at the intersection of three planes (one from each axis)
    const findCorner = (
      faceI: Types.Point3,
      faceJ: Types.Point3,
      faceK: Types.Point3
    ) => {
      // Use face positions as starting points and project to find intersection
      // Start from faceI position, move along J and K directions to match the other faces
      const { iDir, jDir, kDir } = this.volumeDirectionVectors;

      // Project to find distances
      // Distance from faceI to faceJ plane along J direction
      const deltaIJ = [
        faceJ[0] - faceI[0],
        faceJ[1] - faceI[1],
        faceJ[2] - faceI[2],
      ];
      const distJ =
        deltaIJ[0] * jDir[0] + deltaIJ[1] * jDir[1] + deltaIJ[2] * jDir[2];

      // Distance from faceI to faceK plane along K direction
      const deltaIK = [
        faceK[0] - faceI[0],
        faceK[1] - faceI[1],
        faceK[2] - faceI[2],
      ];
      const distK =
        deltaIK[0] * kDir[0] + deltaIK[1] * kDir[1] + deltaIK[2] * kDir[2];

      // Corner position is faceI position plus movements along J and K
      return [
        faceI[0] + distJ * jDir[0] + distK * kDir[0],
        faceI[1] + distJ * jDir[1] + distK * kDir[1],
        faceI[2] + distJ * jDir[2] + distK * kDir[2],
      ] as Types.Point3;
    };

    const corners = [
      { key: 'IMIN_JMIN_KMIN', pos: findCorner(faceIMin, faceJMin, faceKMin) },
      { key: 'IMIN_JMIN_KMAX', pos: findCorner(faceIMin, faceJMin, faceKMax) },
      { key: 'IMIN_JMAX_KMIN', pos: findCorner(faceIMin, faceJMax, faceKMin) },
      { key: 'IMIN_JMAX_KMAX', pos: findCorner(faceIMin, faceJMax, faceKMax) },
      { key: 'IMAX_JMIN_KMIN', pos: findCorner(faceIMax, faceJMin, faceKMin) },
      { key: 'IMAX_JMIN_KMAX', pos: findCorner(faceIMax, faceJMin, faceKMax) },
      { key: 'IMAX_JMAX_KMIN', pos: findCorner(faceIMax, faceJMax, faceKMin) },
      { key: 'IMAX_JMAX_KMAX', pos: findCorner(faceIMax, faceJMax, faceKMax) },
    ];

    for (const corner of corners) {
      const state = this.sphereStates.find(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (state) {
        state.point = corner.pos;
        state.sphereSource.setCenter(...state.point);
        state.sphereSource.modified();
      }
    }
  }
  _updateFaceSpheresFromCorners() {
    if (!this.volumeDirectionVectors) return;

    // Get all corner points
    const corners = [
      this.sphereStates[SPHEREINDEX.IMIN_JMIN_KMIN].point,
      this.sphereStates[SPHEREINDEX.IMIN_JMIN_KMAX].point,
      this.sphereStates[SPHEREINDEX.IMIN_JMAX_KMIN].point,
      this.sphereStates[SPHEREINDEX.IMIN_JMAX_KMAX].point,
      this.sphereStates[SPHEREINDEX.IMAX_JMIN_KMIN].point,
      this.sphereStates[SPHEREINDEX.IMAX_JMIN_KMAX].point,
      this.sphereStates[SPHEREINDEX.IMAX_JMAX_KMIN].point,
      this.sphereStates[SPHEREINDEX.IMAX_JMAX_KMAX].point,
    ];

    // Calculate face centers by averaging the 4 corners on each face
    // IMIN face: average of 4 corners with IMIN
    const iMinCorners = [corners[0], corners[1], corners[2], corners[3]];
    const faceIMin = [
      (iMinCorners[0][0] +
        iMinCorners[1][0] +
        iMinCorners[2][0] +
        iMinCorners[3][0]) /
        4,
      (iMinCorners[0][1] +
        iMinCorners[1][1] +
        iMinCorners[2][1] +
        iMinCorners[3][1]) /
        4,
      (iMinCorners[0][2] +
        iMinCorners[1][2] +
        iMinCorners[2][2] +
        iMinCorners[3][2]) /
        4,
    ] as Types.Point3;

    // IMAX face: average of 4 corners with IMAX
    const iMaxCorners = [corners[4], corners[5], corners[6], corners[7]];
    const faceIMax = [
      (iMaxCorners[0][0] +
        iMaxCorners[1][0] +
        iMaxCorners[2][0] +
        iMaxCorners[3][0]) /
        4,
      (iMaxCorners[0][1] +
        iMaxCorners[1][1] +
        iMaxCorners[2][1] +
        iMaxCorners[3][1]) /
        4,
      (iMaxCorners[0][2] +
        iMaxCorners[1][2] +
        iMaxCorners[2][2] +
        iMaxCorners[3][2]) /
        4,
    ] as Types.Point3;

    // JMIN face: corners 0, 1, 4, 5
    const jMinCorners = [corners[0], corners[1], corners[4], corners[5]];
    const faceJMin = [
      (jMinCorners[0][0] +
        jMinCorners[1][0] +
        jMinCorners[2][0] +
        jMinCorners[3][0]) /
        4,
      (jMinCorners[0][1] +
        jMinCorners[1][1] +
        jMinCorners[2][1] +
        jMinCorners[3][1]) /
        4,
      (jMinCorners[0][2] +
        jMinCorners[1][2] +
        jMinCorners[2][2] +
        jMinCorners[3][2]) /
        4,
    ] as Types.Point3;

    // JMAX face: corners 2, 3, 6, 7
    const jMaxCorners = [corners[2], corners[3], corners[6], corners[7]];
    const faceJMax = [
      (jMaxCorners[0][0] +
        jMaxCorners[1][0] +
        jMaxCorners[2][0] +
        jMaxCorners[3][0]) /
        4,
      (jMaxCorners[0][1] +
        jMaxCorners[1][1] +
        jMaxCorners[2][1] +
        jMaxCorners[3][1]) /
        4,
      (jMaxCorners[0][2] +
        jMaxCorners[1][2] +
        jMaxCorners[2][2] +
        jMaxCorners[3][2]) /
        4,
    ] as Types.Point3;

    // KMIN face: corners 0, 2, 4, 6
    const kMinCorners = [corners[0], corners[2], corners[4], corners[6]];
    const faceKMin = [
      (kMinCorners[0][0] +
        kMinCorners[1][0] +
        kMinCorners[2][0] +
        kMinCorners[3][0]) /
        4,
      (kMinCorners[0][1] +
        kMinCorners[1][1] +
        kMinCorners[2][1] +
        kMinCorners[3][1]) /
        4,
      (kMinCorners[0][2] +
        kMinCorners[1][2] +
        kMinCorners[2][2] +
        kMinCorners[3][2]) /
        4,
    ] as Types.Point3;

    // KMAX face: corners 1, 3, 5, 7
    const kMaxCorners = [corners[1], corners[3], corners[5], corners[7]];
    const faceKMax = [
      (kMaxCorners[0][0] +
        kMaxCorners[1][0] +
        kMaxCorners[2][0] +
        kMaxCorners[3][0]) /
        4,
      (kMaxCorners[0][1] +
        kMaxCorners[1][1] +
        kMaxCorners[2][1] +
        kMaxCorners[3][1]) /
        4,
      (kMaxCorners[0][2] +
        kMaxCorners[1][2] +
        kMaxCorners[2][2] +
        kMaxCorners[3][2]) /
        4,
    ] as Types.Point3;

    // Update face sphere positions
    this.sphereStates[SPHEREINDEX.IMIN].point = faceIMin;
    this.sphereStates[SPHEREINDEX.IMAX].point = faceIMax;
    this.sphereStates[SPHEREINDEX.JMIN].point = faceJMin;
    this.sphereStates[SPHEREINDEX.JMAX].point = faceJMax;
    this.sphereStates[SPHEREINDEX.KMIN].point = faceKMin;
    this.sphereStates[SPHEREINDEX.KMAX].point = faceKMax;

    [
      SPHEREINDEX.IMIN,
      SPHEREINDEX.IMAX,
      SPHEREINDEX.JMIN,
      SPHEREINDEX.JMAX,
      SPHEREINDEX.KMIN,
      SPHEREINDEX.KMAX,
    ].forEach((idx) => {
      const s = this.sphereStates[idx];
      s.sphereSource.setCenter(...s.point);
      s.sphereSource.modified();
    });
  }

  _updateCornerSpheres() {
    if (!this.volumeDirectionVectors) return;

    // Get face sphere positions
    const faceIMin = this.sphereStates[SPHEREINDEX.IMIN].point;
    const faceIMax = this.sphereStates[SPHEREINDEX.IMAX].point;
    const faceJMin = this.sphereStates[SPHEREINDEX.JMIN].point;
    const faceJMax = this.sphereStates[SPHEREINDEX.JMAX].point;
    const faceKMin = this.sphereStates[SPHEREINDEX.KMIN].point;
    const faceKMax = this.sphereStates[SPHEREINDEX.KMAX].point;

    // Helper function to find intersection of three orthogonal planes
    // Plane I: passes through faceI, normal = iDir
    // Plane J: passes through faceJ, normal = jDir
    // Plane K: passes through faceK, normal = kDir
    // For orthogonal planes, we can find the intersection by solving:
    // (corner - faceI) · iDir = 0  => corner · iDir = faceI · iDir
    // (corner - faceJ) · jDir = 0  => corner · jDir = faceJ · jDir
    // (corner - faceK) · kDir = 0  => corner · kDir = faceK · kDir
    const findCorner = (
      faceI: Types.Point3,
      faceJ: Types.Point3,
      faceK: Types.Point3
    ) => {
      const { iDir, jDir, kDir } = this.volumeDirectionVectors;

      // The dot products give us the "signed distances" along each axis
      const dI = faceI[0] * iDir[0] + faceI[1] * iDir[1] + faceI[2] * iDir[2];
      const dJ = faceJ[0] * jDir[0] + faceJ[1] * jDir[1] + faceJ[2] * jDir[2];
      const dK = faceK[0] * kDir[0] + faceK[1] * kDir[1] + faceK[2] * kDir[2];

      return [
        dI * iDir[0] + dJ * jDir[0] + dK * kDir[0],
        dI * iDir[1] + dJ * jDir[1] + dK * kDir[1],
        dI * iDir[2] + dJ * jDir[2] + dK * kDir[2],
      ] as Types.Point3;
    };

    // Define all 8 corners from face sphere positions
    const corners = [
      { key: 'IMIN_JMIN_KMIN', pos: findCorner(faceIMin, faceJMin, faceKMin) },
      { key: 'IMIN_JMIN_KMAX', pos: findCorner(faceIMin, faceJMin, faceKMax) },
      { key: 'IMIN_JMAX_KMIN', pos: findCorner(faceIMin, faceJMax, faceKMin) },
      { key: 'IMIN_JMAX_KMAX', pos: findCorner(faceIMin, faceJMax, faceKMax) },
      { key: 'IMAX_JMIN_KMIN', pos: findCorner(faceIMax, faceJMin, faceKMin) },
      { key: 'IMAX_JMIN_KMAX', pos: findCorner(faceIMax, faceJMin, faceKMax) },
      { key: 'IMAX_JMAX_KMIN', pos: findCorner(faceIMax, faceJMax, faceKMin) },
      { key: 'IMAX_JMAX_KMAX', pos: findCorner(faceIMax, faceJMax, faceKMax) },
    ];

    // Update corner spheres
    for (const corner of corners) {
      const state = this.sphereStates.find(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (state) {
        state.point = corner.pos;
        state.sphereSource.setCenter(...state.point);
        state.sphereSource.modified();
      }
    }

    // Update edge lines to follow the corner spheres
    Object.values(this.edgeLines).forEach(({ source, key1, key2 }) => {
      const state1 = this.sphereStates.find((s) => s.uid === `corner_${key1}`);
      const state2 = this.sphereStates.find((s) => s.uid === `corner_${key2}`);
      if (state1 && state2) {
        const points = source.getPoints();
        points.setPoint(0, state1.point[0], state1.point[1], state1.point[2]);
        points.setPoint(1, state2.point[0], state2.point[1], state2.point[2]);
        points.modified();
        source.modified();
      }
    });
  }

  _onNewVolume = () => {
    const viewportsInfo = this._getViewportsInfo();
    this.originalClippingPlanes = [];
    this.sphereStates = [];
    this.edgeLines = {};
    this._initialize3DViewports(viewportsInfo);
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

  _rotateCamera = (viewport, centerWorld, axis, angle) => {
    const vtkCamera = viewport.getVtkActiveCamera();
    const viewUp = vtkCamera.getViewUp();
    const focalPoint = vtkCamera.getFocalPoint();
    const position = vtkCamera.getPosition();

    const newPosition: Types.Point3 = [0, 0, 0];
    const newFocalPoint: Types.Point3 = [0, 0, 0];
    const newViewUp: Types.Point3 = [0, 0, 0];

    const transform = mat4.identity(new Float32Array(16));
    mat4.translate(transform, transform, centerWorld);
    mat4.rotate(transform, transform, angle, axis);
    mat4.translate(transform, transform, [
      -centerWorld[0],
      -centerWorld[1],
      -centerWorld[2],
    ]);
    vec3.transformMat4(newPosition, position, transform);
    vec3.transformMat4(newFocalPoint, focalPoint, transform);

    mat4.identity(transform);
    mat4.rotate(transform, transform, angle, axis);
    vec3.transformMat4(newViewUp, viewUp, transform);

    viewport.setCamera({
      position: newPosition,
      viewUp: newViewUp,
      focalPoint: newFocalPoint,
    });
  };
}

VolumeCroppingTool.toolName = 'VolumeCropping';
export default VolumeCroppingTool;
