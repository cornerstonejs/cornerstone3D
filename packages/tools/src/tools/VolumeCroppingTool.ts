import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
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

import {
  PLANEINDEX,
  SPHEREINDEX,
  NUM_CLIPPING_PLANES,
  extractVolumeDirectionVectors,
  parseCornerKey,
  type ClippingPlane,
  copyClippingPlanes,
} from '../utilities/volumeCropping';
import {
  addLine3DBetweenPoints,
  calculateAdaptiveSphereRadius,
} from '../utilities/draw3D';

/**
 * VolumeCroppingTool provides manipulatable spheres and real-time volume cropping capabilities.
 *  It renders interactive handles (spheres) at face centers and corners of a cropping box, allowing users to precisely adjust volume boundaries through direct manipulation in 3D space.
 *
 * @remarks
 * This tool creates a complete 3D cropping interface with:
 * - 6 face spheres for individual axis cropping (along volume's X, Y, Z axes)
 * - 8 corner spheres for multi-axis cropping
 * - 12 edge lines connecting corner spheres
 * - Real-time clipping plane updates
 * - Synchronization with VolumeCroppingControlTool working on the same series instance UID for cross-viewport interaction
 * - Support for volumes with any orientation (including oblique/rotated volumes)
 *
 * The tool automatically adapts to the volume's orientation by using the volume's direction matrix.
 * Clipping planes are aligned with the volume's intrinsic axes (X, Y, Z) rather than world axes,
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
 *     SAGITTAL: [1.0, 1.0, 0.0], // Yellow for X-axis (typically sagittal) spheres
 *     CORONAL: [0.0, 1.0, 0.0], // Green for Y-axis (typically coronal) spheres
 *     AXIAL: [1.0, 0.0, 0.0], // Red for Z-axis (typically axial) spheres
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
 * @property {ClippingPlane[]} originalClippingPlanes - Array of clipping plane objects with origin and normal vectors
 * @property {number|null} draggingSphereIndex - Index of currently dragged sphere, null when not dragging
 * @property {number[]|null} cornerDragOffset - 3D offset vector for corner sphere dragging [dx, dy, dz]
 * @property {number|null} faceDragOffset - 1D offset value for face sphere dragging along single axis
 * @property {boolean} rotatePlanesOnDrag - If true, dragging rotates clipping planes instead of camera (default: false)
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
 * @property {number} rotateClippingPlanesIncrementDegrees - Rotation increment for clipping planes rotation (default: 5)
 *
 * @events
 * @event VOLUMECROPPING_TOOL_CHANGED - Fired when sphere positions change or clipping planes are updated.
 *   Event detail includes:
 *   - originalClippingPlanes: ClippingPlane[] - Array of 6 clipping planes [XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX]
 *   - seriesInstanceUID: string - Series instance UID for event filtering
 *   - viewportId?: string - Optional viewport ID
 *   - renderingEngineId?: string - Optional rendering engine ID
 * @event VOLUMECROPPINGCONTROL_TOOL_CHANGED - Listens for changes from VolumeCroppingControlTool
 * @event VOLUME_VIEWPORT_NEW_VOLUME - Listens for new volume loading to reinitialize cropping bounds
 * @event TOOLGROUP_VIEWPORT_ADDED - Listens for new viewport additions to extend resize observation
 *
 * @methods
 * - **setHandlesVisible(visible: boolean)**: Show/hide manipulation spheres and edge lines
 * - **setClippingPlanesVisible(visible: boolean)**: Enable/disable volume clipping planes
 * - **getHandlesVisible()**: Get current handle visibility state
 * - **getClippingPlanesVisible()**: Get current clipping plane visibility state
 * - **setRotatePlanesOnDrag(enable: boolean)**: Enable/disable rotating clipping planes on drag (default: false)
 * - **getRotatePlanesOnDrag()**: Get current rotate planes on drag state
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
  originalClippingPlanes: ClippingPlane[] = [];
  draggingSphereIndex: number | null = null;
  rotatePlanesOnDrag: boolean = false; // If true, dragging rotates clipping planes instead of camera
  cornerDragOffset: [number, number, number] | null = null;
  faceDragOffset: number | null = null;
  // Store volume direction vectors for non-axis-aligned volumes
  volumeDirectionVectors: {
    xDir: Types.Point3; // First axis direction (rows)
    yDir: Types.Point3; // Second axis direction (columns)
    zDir: Types.Point3; // Third axis direction (slices)
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
        rotateClippingPlanesIncrementDegrees: 5, // Rotation increment for clipping planes (higher = faster rotation)
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  onSetToolActive() {
    // Always set up the infrastructure (resize observers, event listeners, etc.)
    // but don't show handles or clipping planes by default
    // They should only be shown via hotkeys or the VolumeCropping component
    // Rotation is already enabled via mouseDragCallback, so no additional setup needed
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

    // Initialize 3D viewports if not already initialized
    if (this.sphereStates && this.sphereStates.length === 0) {
      this.originalClippingPlanes = [];
      this._initialize3DViewports(viewportsInfo);
    }

    // Explicitly disable clipping planes and handles after initialization
    // They should only be shown via hotkeys or the VolumeCropping component
    // This ensures that even if _initialize3DViewports added clipping planes,
    // they will be removed if the configuration says they should be hidden
    this.configuration.showClippingPlanes = false;
    this.configuration.showHandles = false;

    const viewport = this._getViewport();
    if (
      viewport &&
      this.originalClippingPlanes &&
      this.originalClippingPlanes.length > 0
    ) {
      this._updateClippingPlanes(viewport);
      if (this.sphereStates && this.sphereStates.length > 0) {
        this._updateHandlesVisibility();
      }
      viewport.render();
    }

    // DO NOT show handles or clipping planes by default
    // They should only be shown via hotkeys or the VolumeCropping component
    // Rotation is already enabled via mouseDragCallback, so no additional setup needed
  }

  onSetToolConfiguration = (): void => {
    // Configuration is handled in constructor and onSetToolActive
  };

  onSetToolEnabled = (): void => {
    // Tool enabled state is managed by BaseTool
  };

  onSetToolDisabled() {
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
    if (visible) {
      this._updateFaceSpheresFromClippingPlanes();
      this._updateCornerSpheres();
    }

    this._updateHandlesVisibility();

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

    if (this.sphereStates && this.sphereStates.length > 0) {
      this.configuration.showHandles = visible;
      this._updateHandlesVisibility();
    }

    if (
      visible &&
      viewport &&
      this.originalClippingPlanes?.length >= NUM_CLIPPING_PLANES
    ) {
      this._notifyClippingPlanesChanged(viewport);
    }

    viewport.render();
  }

  /**
   * Gets whether dragging rotates clipping planes instead of the camera.
   *
   * @returns {boolean} True if dragging rotates clipping planes, false if it rotates the camera
   *
   * @example
   * ```typescript
   * const isRotatingPlanes = volumeCroppingTool.getRotatePlanesOnDrag();
   * if (isRotatingPlanes) {
   *   console.log('Dragging will rotate clipping planes');
   * } else {
   *   console.log('Dragging will rotate camera');
   * }
   * ```
   */
  getRotatePlanesOnDrag(): boolean {
    return this.rotatePlanesOnDrag;
  }

  /**
   * Sets whether dragging should rotate clipping planes instead of the camera.
   *
   * When enabled, dragging the mouse will rotate the clipping planes around the volume.
   * When disabled, dragging will rotate the camera view (default behavior).
   *
   * @param enable - Whether to enable (true) or disable (false) rotating planes on drag
   *
   * @example
   * ```typescript
   * // Enable rotating clipping planes on drag
   * volumeCroppingTool.setRotatePlanesOnDrag(true);
   *
   * // Disable to use default camera rotation
   * volumeCroppingTool.setRotatePlanesOnDrag(false);
   * ```
   *
   * @remarks
   * - Default is false (camera rotation)
   * - When enabled, the clipping planes rotate around the volume center
   * - The rotation increment is controlled by rotateClippingPlanesIncrementDegrees configuration
   */
  setRotatePlanesOnDrag(enable: boolean): void {
    this.rotatePlanesOnDrag = enable;
    const viewport = this._getViewport();
    if (viewport) {
      viewport.render();
    }
  }

  _dragCallback(evt: EventTypes.InteractionEventType): void {
    const { element, currentPoints, lastPoints } = evt.detail;

    if (this.draggingSphereIndex !== null) {
      this._onMouseMoveSphere(evt);
    } else {
      const shiftKey = (evt.detail.event as MouseEvent)?.shiftKey ?? false;
      if (this.rotatePlanesOnDrag === true || shiftKey) {
        this._rotateClippingPlanes(evt);
        return;
      }
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

    const { viewport, world } = this._getViewportAndWorldCoords(evt);
    if (!viewport || !world) {
      return false;
    }

    if (sphereState.isCorner) {
      const newCorner = this.cornerDragOffset
        ? vec3.add([0, 0, 0], world, this.cornerDragOffset)
        : world;
      const oldCorner = sphereState.point;

      const axisFlags = parseCornerKey(sphereState.uid);
      const { xDir, yDir, zDir } = this._getDirectionVectors();

      if (!xDir || !yDir || !zDir) return false;

      const delta = [
        newCorner[0] - oldCorner[0],
        newCorner[1] - oldCorner[1],
        newCorner[2] - oldCorner[2],
      ];

      const deltaX =
        delta[0] * xDir[0] + delta[1] * xDir[1] + delta[2] * xDir[2];
      const deltaY =
        delta[0] * yDir[0] + delta[1] * yDir[1] + delta[2] * yDir[2];
      const deltaZ =
        delta[0] * zDir[0] + delta[1] * zDir[1] + delta[2] * zDir[2];

      if (axisFlags.isXMin) {
        const faceXMin = this.sphereStates[SPHEREINDEX.XMIN];
        const newPoint: Types.Point3 = [
          faceXMin.point[0] + deltaX * xDir[0],
          faceXMin.point[1] + deltaX * xDir[1],
          faceXMin.point[2] + deltaX * xDir[2],
        ];
        this._updateSpherePosition(SPHEREINDEX.XMIN, newPoint);
      } else if (axisFlags.isXMax) {
        const faceXMax = this.sphereStates[SPHEREINDEX.XMAX];
        const newPoint: Types.Point3 = [
          faceXMax.point[0] + deltaX * xDir[0],
          faceXMax.point[1] + deltaX * xDir[1],
          faceXMax.point[2] + deltaX * xDir[2],
        ];
        this._updateSpherePosition(SPHEREINDEX.XMAX, newPoint);
      }

      if (axisFlags.isYMin) {
        const faceYMin = this.sphereStates[SPHEREINDEX.YMIN];
        const newPoint: Types.Point3 = [
          faceYMin.point[0] + deltaY * yDir[0],
          faceYMin.point[1] + deltaY * yDir[1],
          faceYMin.point[2] + deltaY * yDir[2],
        ];
        this._updateSpherePosition(SPHEREINDEX.YMIN, newPoint);
      } else if (axisFlags.isYMax) {
        const faceYMax = this.sphereStates[SPHEREINDEX.YMAX];
        const newPoint: Types.Point3 = [
          faceYMax.point[0] + deltaY * yDir[0],
          faceYMax.point[1] + deltaY * yDir[1],
          faceYMax.point[2] + deltaY * yDir[2],
        ];
        this._updateSpherePosition(SPHEREINDEX.YMAX, newPoint);
      }

      if (axisFlags.isZMin) {
        const faceZMin = this.sphereStates[SPHEREINDEX.ZMIN];
        const newPoint: Types.Point3 = [
          faceZMin.point[0] + deltaZ * zDir[0],
          faceZMin.point[1] + deltaZ * zDir[1],
          faceZMin.point[2] + deltaZ * zDir[2],
        ];
        this._updateSpherePosition(SPHEREINDEX.ZMIN, newPoint);
      } else if (axisFlags.isZMax) {
        const faceZMax = this.sphereStates[SPHEREINDEX.ZMAX];
        const newPoint: Types.Point3 = [
          faceZMax.point[0] + deltaZ * zDir[0],
          faceZMax.point[1] + deltaZ * zDir[1],
          faceZMax.point[2] + deltaZ * zDir[2],
        ];
        this._updateSpherePosition(SPHEREINDEX.ZMAX, newPoint);
      }

      this._updateCornerSpheres();
      this._updateFaceSpheresFromCorners();
    } else {
      const directionVector = this._getDirectionVectorForAxis(sphereState.axis);

      const delta = [
        world[0] - sphereState.point[0],
        world[1] - sphereState.point[1],
        world[2] - sphereState.point[2],
      ];

      const distanceAlongAxis =
        delta[0] * directionVector[0] +
        delta[1] * directionVector[1] +
        delta[2] * directionVector[2];

      const adjustedDistance =
        this.faceDragOffset !== null
          ? distanceAlongAxis + this.faceDragOffset
          : distanceAlongAxis;

      const newPoint: Types.Point3 = [
        sphereState.point[0] + adjustedDistance * directionVector[0],
        sphereState.point[1] + adjustedDistance * directionVector[1],
        sphereState.point[2] + adjustedDistance * directionVector[2],
      ];
      this._updateSpherePosition(this.draggingSphereIndex, newPoint);

      this._updateCornerSpheresFromFaces();
      this._updateFaceSpheresFromCorners();
      this._updateCornerSpheres();
    }

    this._updateClippingPlanesFromFaceSpheres(viewport);
    viewport.render();
    this._notifyClippingPlanesChanged();

    return true;
  };

  _onControlToolChange = (evt) => {
    const viewport = this._getViewport();

    if (evt.detail.seriesInstanceUID !== this.seriesInstanceUID) {
      return;
    }

    if (
      evt.detail.clippingPlanes &&
      evt.detail.clippingPlanes.length >= NUM_CLIPPING_PLANES
    ) {
      this.originalClippingPlanes = copyClippingPlanes(
        evt.detail.clippingPlanes
      );

      this._updateFaceSpheresFromClippingPlanes();
      this._updateCornerSpheresFromFaces();
      this._updateFaceSpheresFromCorners();
      this._updateCornerSpheres();

      const mapper = this._getVolumeMapper(viewport);
      if (mapper) {
        this._applyClippingPlanesToMapper(mapper);
      }
      viewport.render();
      this._notifyClippingPlanesChanged(viewport);
    } else {
      this._notifyClippingPlanesChanged(viewport);
    }
  };

  _updateClippingPlanes(viewport) {
    const actorEntry = viewport.getDefaultActor();
    const actor = actorEntry.actor;
    const mapper = actor.getMapper();
    const matrix = actor.getMatrix();

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

  _getViewportsInfo = () => {
    const toolGroup = getToolGroup(this.toolGroupId);
    return toolGroup?.viewportsInfo || [];
  };

  _addSphere(
    viewport: Types.IVolumeViewport,
    point: Types.Point3,
    axis: string,
    position: string,
    cornerKey: string | null = null,
    adaptiveRadius: number
  ): void {
    // Generate a unique UID for each sphere based on its axis and position
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
    } else if (axis === 'z') {
      color = sphereColors.AXIAL || [1.0, 0.0, 0.0]; // Z-axis (slice direction) = AXIAL planes
    } else if (axis === 'x') {
      color = sphereColors.SAGITTAL || [1.0, 1.0, 0.0]; // X-axis (row direction) = SAGITTAL planes
    } else if (axis === 'y') {
      color = sphereColors.CORONAL || [0.0, 1.0, 0.0]; // Y-axis (column direction) = CORONAL planes
    }

    const idx = this.sphereStates.findIndex((s) => s.uid === uid);
    const pointCopy: Types.Point3 = [point[0], point[1], point[2]];
    if (idx === -1) {
      this.sphereStates.push({
        point: pointCopy,
        axis,
        uid,
        sphereSource,
        sphereActor,
        isCorner: !!cornerKey,
        color,
      });
    } else {
      this.sphereStates[idx].point = pointCopy;
      this.sphereStates[idx].sphereSource = sphereSource;
    }

    sphereActor.getProperty().setColor(color);
    sphereActor.setVisibility(this.configuration.showHandles);
    viewport.addActor({ actor: sphereActor, uid: uid });
  }

  /**
   * Get the direction vector for a given axis ('x', 'y', or 'z').
   * @param axis - The axis identifier
   * @returns The direction vector in world space
   */
  _getDirectionVectorForAxis(axis: string): Types.Point3 {
    // After rotation, use the current plane normals instead of original volume direction vectors
    // This ensures spheres move along the rotated planes
    if (
      this.originalClippingPlanes &&
      this.originalClippingPlanes.length >= NUM_CLIPPING_PLANES
    ) {
      switch (axis) {
        case 'x':
          // Use XMIN plane normal (points in +X direction)
          return this.originalClippingPlanes[PLANEINDEX.XMIN]
            .normal as Types.Point3;
        case 'y':
          // Use YMIN plane normal (points in +Y direction)
          return this.originalClippingPlanes[PLANEINDEX.YMIN]
            .normal as Types.Point3;
        case 'z':
          // Use ZMIN plane normal (points in +Z direction)
          return this.originalClippingPlanes[PLANEINDEX.ZMIN]
            .normal as Types.Point3;
        default:
          return [1, 0, 0];
      }
    }

    if (!this.volumeDirectionVectors) {
      if (axis === 'x') return [1, 0, 0];
      if (axis === 'y') return [0, 1, 0];
      if (axis === 'z') return [0, 0, 1];
      return [1, 0, 0];
    }

    switch (axis) {
      case 'x':
        return this.volumeDirectionVectors.xDir;
      case 'y':
        return this.volumeDirectionVectors.yDir;
      case 'z':
        return this.volumeDirectionVectors.zDir;
      default:
        return [1, 0, 0];
    }
  }

  _initialize3DViewports = (viewportsInfo: Types.IViewportId[]): void => {
    if (!viewportsInfo?.length || !viewportsInfo[0]) {
      console.warn(
        'VolumeCroppingTool: No viewportsInfo available for initialization of volumecroppingtool.'
      );
      return;
    }
    const viewport = this._getViewport();
    if (!viewport) {
      return;
    }
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

    this.volumeDirectionVectors = extractVolumeDirectionVectors(imageData);
    const { xDir, yDir, zDir } = this.volumeDirectionVectors;

    // Get volume bounds and dimensions in index space
    const dimensions = imageData.getDimensions();

    const cropFactor = this.configuration.initialCropFactor || 0.1;

    // Calculate cropping range in index space
    const xMin = cropFactor * dimensions[0];
    const xMax = (1 - cropFactor) * dimensions[0];
    const yMin = cropFactor * dimensions[1];
    const yMax = (1 - cropFactor) * dimensions[1];
    const zMin = cropFactor * dimensions[2];
    const zMax = (1 - cropFactor) * dimensions[2];

    // Calculate center of each face in index space
    const xCenter = (xMin + xMax) / 2;
    const yCenter = (yMin + yMax) / 2;
    const zCenter = (zMin + zMax) / 2;

    // Calculate world positions for face centers
    const faceXMin = imageData.indexToWorld([xMin, yCenter, zCenter]);
    const faceXMax = imageData.indexToWorld([xMax, yCenter, zCenter]);
    const faceYMin = imageData.indexToWorld([xCenter, yMin, zCenter]);
    const faceYMax = imageData.indexToWorld([xCenter, yMax, zCenter]);
    const faceZMin = imageData.indexToWorld([xCenter, yCenter, zMin]);
    const faceZMax = imageData.indexToWorld([xCenter, yCenter, zMax]);

    // Create clipping planes with normals based on volume orientation
    const planeXMin = vtkPlane.newInstance({
      origin: faceXMin,
      normal: xDir, // Normal points in +X direction
    });
    const planeXMax = vtkPlane.newInstance({
      origin: faceXMax,
      normal: [-xDir[0], -xDir[1], -xDir[2]], // Normal points in -X direction
    });
    const planeYMin = vtkPlane.newInstance({
      origin: faceYMin,
      normal: yDir, // Normal points in +Y direction
    });
    const planeYMax = vtkPlane.newInstance({
      origin: faceYMax,
      normal: [-yDir[0], -yDir[1], -yDir[2]], // Normal points in -Y direction
    });
    const planeZMin = vtkPlane.newInstance({
      origin: faceZMin,
      normal: zDir, // Normal points in +Z direction
    });
    const planeZMax = vtkPlane.newInstance({
      origin: faceZMax,
      normal: [-zDir[0], -zDir[1], -zDir[2]], // Normal points in -Z direction
    });

    const planes: vtkPlane[] = [
      planeXMin,
      planeXMax,
      planeYMin,
      planeYMax,
      planeZMin,
      planeZMax,
    ];

    const originalPlanes: ClippingPlane[] = planes.map((plane) => ({
      origin: [...plane.getOrigin()] as Types.Point3,
      normal: [...plane.getNormal()] as Types.Point3,
    }));

    this.originalClippingPlanes = originalPlanes;

    // Calculate world diagonal for adaptive sphere radius
    const diag0 = imageData.indexToWorld([0, 0, 0]);
    const diag1 = imageData.indexToWorld([
      dimensions[0],
      dimensions[1],
      dimensions[2],
    ]);
    const diagonal = vec3.distance(diag0, diag1);
    const adaptiveRadius = calculateAdaptiveSphereRadius(
      diagonal,
      this.configuration
    );

    this._addSphere(viewport, faceXMin, 'x', 'min', null, adaptiveRadius);
    this._addSphere(viewport, faceXMax, 'x', 'max', null, adaptiveRadius);
    this._addSphere(viewport, faceYMin, 'y', 'min', null, adaptiveRadius);
    this._addSphere(viewport, faceYMax, 'y', 'max', null, adaptiveRadius);
    this._addSphere(viewport, faceZMin, 'z', 'min', null, adaptiveRadius);
    this._addSphere(viewport, faceZMax, 'z', 'max', null, adaptiveRadius);

    // Calculate all 8 corners in world space
    const corners = [
      imageData.indexToWorld([xMin, yMin, zMin]),
      imageData.indexToWorld([xMin, yMin, zMax]),
      imageData.indexToWorld([xMin, yMax, zMin]),
      imageData.indexToWorld([xMin, yMax, zMax]),
      imageData.indexToWorld([xMax, yMin, zMin]),
      imageData.indexToWorld([xMax, yMin, zMax]),
      imageData.indexToWorld([xMax, yMax, zMin]),
      imageData.indexToWorld([xMax, yMax, zMax]),
    ];

    const cornerKeys = [
      'XMIN_YMIN_ZMIN',
      'XMIN_YMIN_ZMAX',
      'XMIN_YMAX_ZMIN',
      'XMIN_YMAX_ZMAX',
      'XMAX_YMIN_ZMIN',
      'XMAX_YMIN_ZMAX',
      'XMAX_YMAX_ZMIN',
      'XMAX_YMAX_ZMAX',
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
      // X edges (along first axis)
      ['XMIN_YMIN_ZMIN', 'XMAX_YMIN_ZMIN'],
      ['XMIN_YMIN_ZMAX', 'XMAX_YMIN_ZMAX'],
      ['XMIN_YMAX_ZMIN', 'XMAX_YMAX_ZMIN'],
      ['XMIN_YMAX_ZMAX', 'XMAX_YMAX_ZMAX'],
      // Y edges (along second axis)
      ['XMIN_YMIN_ZMIN', 'XMIN_YMAX_ZMIN'],
      ['XMIN_YMIN_ZMAX', 'XMIN_YMAX_ZMAX'],
      ['XMAX_YMIN_ZMIN', 'XMAX_YMAX_ZMIN'],
      ['XMAX_YMIN_ZMAX', 'XMAX_YMAX_ZMAX'],
      // Z edges (along third axis)
      ['XMIN_YMIN_ZMIN', 'XMIN_YMIN_ZMAX'],
      ['XMIN_YMAX_ZMIN', 'XMIN_YMAX_ZMAX'],
      ['XMAX_YMIN_ZMIN', 'XMAX_YMIN_ZMAX'],
      ['XMAX_YMAX_ZMIN', 'XMAX_YMAX_ZMAX'],
    ];

    edgeCornerPairs.forEach(([key1, key2]) => {
      const state1 = this.sphereStates.find((s) => s.uid === `corner_${key1}`);
      const state2 = this.sphereStates.find((s) => s.uid === `corner_${key2}`);
      if (state1 && state2) {
        const uid = `edge_${key1}_${key2}`;
        const { actor, source } = addLine3DBetweenPoints(
          viewport,
          state1.point,
          state2.point,
          [0.7, 0.7, 0.7],
          uid,
          this.configuration.showHandles
        );
        this.edgeLines[uid] = { actor, source, key1, key2 };
      }
    });

    const mapper = viewport
      .getDefaultActor()
      .actor.getMapper() as vtkVolumeMapper;

    mapper.addClippingPlane(planeXMin);
    mapper.addClippingPlane(planeXMax);
    mapper.addClippingPlane(planeYMin);
    mapper.addClippingPlane(planeYMax);
    mapper.addClippingPlane(planeZMin);
    mapper.addClippingPlane(planeZMax);

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

  _getViewport = (): Types.IVolumeViewport | null => {
    const viewportsInfo = this._getViewportsInfo();
    if (!viewportsInfo || viewportsInfo.length === 0) {
      return null;
    }
    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine?.getViewport(viewport3D.viewportId);
    return (viewport as Types.IVolumeViewport) || null;
  };

  _getVolumeActor(
    viewport?: Types.IVolumeViewport
  ): Types.VolumeActor | undefined {
    const vp = viewport || this._getViewport();
    return vp?.getDefaultActor()?.actor as Types.VolumeActor | undefined;
  }

  _getVolumeMapper(
    viewport?: Types.IVolumeViewport
  ): vtkVolumeMapper | undefined {
    const actor = this._getVolumeActor(viewport);
    return actor?.getMapper() as vtkVolumeMapper | undefined;
  }

  _applyClippingPlanesToMapper(mapper: vtkVolumeMapper): void {
    mapper.removeAllClippingPlanes();
    for (let i = 0; i < NUM_CLIPPING_PLANES; ++i) {
      const plane = vtkPlane.newInstance({
        origin: this.originalClippingPlanes[i].origin as [
          number,
          number,
          number,
        ],
        normal: this.originalClippingPlanes[i].normal as [
          number,
          number,
          number,
        ],
      });
      mapper.addClippingPlane(plane);
    }
  }

  _updateClippingPlanesFromFaceSpheres(viewport) {
    const mapper = viewport.getDefaultActor().actor.getMapper();
    // Update origins in originalClippingPlanes
    this.originalClippingPlanes[PLANEINDEX.XMIN].origin = [
      ...this.sphereStates[SPHEREINDEX.XMIN].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.XMAX].origin = [
      ...this.sphereStates[SPHEREINDEX.XMAX].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.YMIN].origin = [
      ...this.sphereStates[SPHEREINDEX.YMIN].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.YMAX].origin = [
      ...this.sphereStates[SPHEREINDEX.YMAX].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.ZMIN].origin = [
      ...this.sphereStates[SPHEREINDEX.ZMIN].point,
    ];
    this.originalClippingPlanes[PLANEINDEX.ZMAX].origin = [
      ...this.sphereStates[SPHEREINDEX.ZMAX].point,
    ];

    this._applyClippingPlanesToMapper(mapper);
  }

  _updateCornerSpheresFromFaces() {
    const { xDir, yDir, zDir } = this._getDirectionVectors();
    if (!xDir || !yDir || !zDir) return;

    const faceXMin = this.sphereStates[SPHEREINDEX.XMIN].point;
    const faceXMax = this.sphereStates[SPHEREINDEX.XMAX].point;
    const faceYMin = this.sphereStates[SPHEREINDEX.YMIN].point;
    const faceYMax = this.sphereStates[SPHEREINDEX.YMAX].point;
    const faceZMin = this.sphereStates[SPHEREINDEX.ZMIN].point;
    const faceZMax = this.sphereStates[SPHEREINDEX.ZMAX].point;

    const corners = [
      {
        key: 'XMIN_YMIN_ZMIN',
        pos: this._calculateCornerFromFaces(
          faceXMin,
          faceYMin,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMIN_YMIN_ZMAX',
        pos: this._calculateCornerFromFaces(
          faceXMin,
          faceYMin,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMIN_YMAX_ZMIN',
        pos: this._calculateCornerFromFaces(
          faceXMin,
          faceYMax,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMIN_YMAX_ZMAX',
        pos: this._calculateCornerFromFaces(
          faceXMin,
          faceYMax,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMIN_ZMIN',
        pos: this._calculateCornerFromFaces(
          faceXMax,
          faceYMin,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMIN_ZMAX',
        pos: this._calculateCornerFromFaces(
          faceXMax,
          faceYMin,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMAX_ZMIN',
        pos: this._calculateCornerFromFaces(
          faceXMax,
          faceYMax,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMAX_ZMAX',
        pos: this._calculateCornerFromFaces(
          faceXMax,
          faceYMax,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
    ];

    for (const corner of corners) {
      const stateIndex = this.sphereStates.findIndex(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (stateIndex !== -1) {
        this._updateSpherePosition(stateIndex, corner.pos);
      }
    }
  }
  _updateFaceSpheresFromCorners() {
    if (!this.volumeDirectionVectors) return;

    const corners = [
      this.sphereStates[SPHEREINDEX.XMIN_YMIN_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMIN_YMIN_ZMAX].point,
      this.sphereStates[SPHEREINDEX.XMIN_YMAX_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMIN_YMAX_ZMAX].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMIN_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMIN_ZMAX].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMAX_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMAX_ZMAX].point,
    ];

    const faceXMin = this._averagePoints([
      corners[0],
      corners[1],
      corners[2],
      corners[3],
    ]);
    const faceXMax = this._averagePoints([
      corners[4],
      corners[5],
      corners[6],
      corners[7],
    ]);
    const faceYMin = this._averagePoints([
      corners[0],
      corners[1],
      corners[4],
      corners[5],
    ]);
    const faceYMax = this._averagePoints([
      corners[2],
      corners[3],
      corners[6],
      corners[7],
    ]);
    const faceZMin = this._averagePoints([
      corners[0],
      corners[2],
      corners[4],
      corners[6],
    ]);
    const faceZMax = this._averagePoints([
      corners[1],
      corners[3],
      corners[5],
      corners[7],
    ]);

    this._updateSpherePosition(SPHEREINDEX.XMIN, faceXMin);
    this._updateSpherePosition(SPHEREINDEX.XMAX, faceXMax);
    this._updateSpherePosition(SPHEREINDEX.YMIN, faceYMin);
    this._updateSpherePosition(SPHEREINDEX.YMAX, faceYMax);
    this._updateSpherePosition(SPHEREINDEX.ZMIN, faceZMin);
    this._updateSpherePosition(SPHEREINDEX.ZMAX, faceZMax);
  }

  _updateCornerSpheres() {
    const { xDir, yDir, zDir } = this._getDirectionVectors();
    if (!xDir || !yDir || !zDir) return;

    const faceXMin = this.sphereStates[SPHEREINDEX.XMIN].point;
    const faceXMax = this.sphereStates[SPHEREINDEX.XMAX].point;
    const faceYMin = this.sphereStates[SPHEREINDEX.YMIN].point;
    const faceYMax = this.sphereStates[SPHEREINDEX.YMAX].point;
    const faceZMin = this.sphereStates[SPHEREINDEX.ZMIN].point;
    const faceZMax = this.sphereStates[SPHEREINDEX.ZMAX].point;

    const corners = [
      {
        key: 'XMIN_YMIN_ZMIN',
        pos: this._calculateCornerFromProjection(
          faceXMin,
          faceYMin,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMIN_YMIN_ZMAX',
        pos: this._calculateCornerFromProjection(
          faceXMin,
          faceYMin,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMIN_YMAX_ZMIN',
        pos: this._calculateCornerFromProjection(
          faceXMin,
          faceYMax,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMIN_YMAX_ZMAX',
        pos: this._calculateCornerFromProjection(
          faceXMin,
          faceYMax,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMIN_ZMIN',
        pos: this._calculateCornerFromProjection(
          faceXMax,
          faceYMin,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMIN_ZMAX',
        pos: this._calculateCornerFromProjection(
          faceXMax,
          faceYMin,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMAX_ZMIN',
        pos: this._calculateCornerFromProjection(
          faceXMax,
          faceYMax,
          faceZMin,
          xDir,
          yDir,
          zDir
        ),
      },
      {
        key: 'XMAX_YMAX_ZMAX',
        pos: this._calculateCornerFromProjection(
          faceXMax,
          faceYMax,
          faceZMax,
          xDir,
          yDir,
          zDir
        ),
      },
    ];

    for (const corner of corners) {
      const stateIndex = this.sphereStates.findIndex(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (stateIndex !== -1) {
        this._updateSpherePosition(stateIndex, corner.pos);
      }
    }

    this._updateEdgeLines();
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

  _rotateClippingPlanes = (evt: EventTypes.InteractionEventType) => {
    const { element, currentPoints, lastPoints } = evt.detail;
    const currentPointsCanvas = currentPoints.canvas;
    const lastPointsCanvas = lastPoints.canvas;
    const rotateIncrementDegrees =
      this.configuration.rotateClippingPlanesIncrementDegrees ??
      this.configuration.rotateIncrementDegrees ??
      5;
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
        20 *
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

      const angleY =
        20 *
        (normalizedPosition[1] - normalizedPreviousPosition[1]) *
        rotateIncrementDegrees;

      // Calculate rotation center as average of all face sphere centers
      let rotationCenter: Types.Point3;
      if (this.sphereStates.length >= NUM_CLIPPING_PLANES) {
        const faces = [
          this.sphereStates[SPHEREINDEX.XMIN],
          this.sphereStates[SPHEREINDEX.XMAX],
          this.sphereStates[SPHEREINDEX.YMIN],
          this.sphereStates[SPHEREINDEX.YMAX],
          this.sphereStates[SPHEREINDEX.ZMIN],
          this.sphereStates[SPHEREINDEX.ZMAX],
        ];
        rotationCenter = [
          (faces[0].point[0] +
            faces[1].point[0] +
            faces[2].point[0] +
            faces[3].point[0] +
            faces[4].point[0] +
            faces[5].point[0]) /
            NUM_CLIPPING_PLANES,
          (faces[0].point[1] +
            faces[1].point[1] +
            faces[2].point[1] +
            faces[3].point[1] +
            faces[4].point[1] +
            faces[5].point[1]) /
            NUM_CLIPPING_PLANES,
          (faces[0].point[2] +
            faces[1].point[2] +
            faces[2].point[2] +
            faces[3].point[2] +
            faces[4].point[2] +
            faces[5].point[2]) /
            NUM_CLIPPING_PLANES,
        ] as Types.Point3;
      } else {
        // Fallback if spheres aren't initialized yet
        rotationCenter = [0, 0, 0] as Types.Point3;
      }

      // Rotate all clipping planes around the rotation center
      // First rotate around forward axis (angleX), then around right axis (angleY)
      const transformX = mat4.identity(new Float32Array(16));
      mat4.translate(transformX, transformX, rotationCenter);
      mat4.rotate(transformX, transformX, (angleX * Math.PI) / 180, forwardV);
      mat4.translate(transformX, transformX, [
        -rotationCenter[0],
        -rotationCenter[1],
        -rotationCenter[2],
      ]);

      const transformY = mat4.identity(new Float32Array(16));
      mat4.translate(transformY, transformY, rotationCenter);
      mat4.rotate(transformY, transformY, (angleY * Math.PI) / 180, rightV);
      mat4.translate(transformY, transformY, [
        -rotationCenter[0],
        -rotationCenter[1],
        -rotationCenter[2],
      ]);

      // Combine transformations
      const transform = mat4.create();
      mat4.multiply(transform, transformY, transformX);

      // Rotate normals (rotation only, no translation)
      // Create 4x4 rotation matrices and extract 3x3 for normals
      const normalTransformX4 = mat4.identity(new Float32Array(16));
      mat4.rotate(
        normalTransformX4,
        normalTransformX4,
        (angleX * Math.PI) / 180,
        forwardV
      );
      const normalTransformX = mat3.create();
      mat3.fromMat4(normalTransformX, normalTransformX4);

      const normalTransformY4 = mat4.identity(new Float32Array(16));
      mat4.rotate(
        normalTransformY4,
        normalTransformY4,
        (angleY * Math.PI) / 180,
        rightV
      );
      const normalTransformY = mat3.create();
      mat3.fromMat4(normalTransformY, normalTransformY4);

      const normalTransform = mat3.create();
      mat3.multiply(normalTransform, normalTransformY, normalTransformX);

      // Rotate all original clipping planes
      for (let i = 0; i < this.originalClippingPlanes.length; ++i) {
        const plane = this.originalClippingPlanes[i];

        // Transform origin
        const originVec = vec3.fromValues(
          plane.origin[0],
          plane.origin[1],
          plane.origin[2]
        );
        vec3.transformMat4(originVec, originVec, transform);
        plane.origin = [originVec[0], originVec[1], originVec[2]];

        // Transform normal
        const normalVec = vec3.fromValues(
          plane.normal[0],
          plane.normal[1],
          plane.normal[2]
        );
        vec3.transformMat3(normalVec, normalVec, normalTransform);
        vec3.normalize(normalVec, normalVec);
        plane.normal = [normalVec[0], normalVec[1], normalVec[2]];
      }

      // Update face spheres from rotated planes
      if (this.sphereStates.length >= NUM_CLIPPING_PLANES) {
        this.sphereStates[SPHEREINDEX.XMIN].point = [
          ...this.originalClippingPlanes[PLANEINDEX.XMIN].origin,
        ] as Types.Point3;
        this.sphereStates[SPHEREINDEX.XMAX].point = [
          ...this.originalClippingPlanes[PLANEINDEX.XMAX].origin,
        ] as Types.Point3;
        this.sphereStates[SPHEREINDEX.YMIN].point = [
          ...this.originalClippingPlanes[PLANEINDEX.YMIN].origin,
        ] as Types.Point3;
        this.sphereStates[SPHEREINDEX.YMAX].point = [
          ...this.originalClippingPlanes[PLANEINDEX.YMAX].origin,
        ] as Types.Point3;
        this.sphereStates[SPHEREINDEX.ZMIN].point = [
          ...this.originalClippingPlanes[PLANEINDEX.ZMIN].origin,
        ] as Types.Point3;
        this.sphereStates[SPHEREINDEX.ZMAX].point = [
          ...this.originalClippingPlanes[PLANEINDEX.ZMAX].origin,
        ] as Types.Point3;

        // Update sphere actors for face spheres
        [
          SPHEREINDEX.XMIN,
          SPHEREINDEX.XMAX,
          SPHEREINDEX.YMIN,
          SPHEREINDEX.YMAX,
          SPHEREINDEX.ZMIN,
          SPHEREINDEX.ZMAX,
        ].forEach((idx) => {
          const s = this.sphereStates[idx];
          s.sphereSource.setCenter(...s.point);
          s.sphereSource.modified();
        });

        // Rotate corner spheres directly using the same transformation
        const cornerIndices = [
          SPHEREINDEX.XMIN_YMIN_ZMIN,
          SPHEREINDEX.XMIN_YMIN_ZMAX,
          SPHEREINDEX.XMIN_YMAX_ZMIN,
          SPHEREINDEX.XMIN_YMAX_ZMAX,
          SPHEREINDEX.XMAX_YMIN_ZMIN,
          SPHEREINDEX.XMAX_YMIN_ZMAX,
          SPHEREINDEX.XMAX_YMAX_ZMIN,
          SPHEREINDEX.XMAX_YMAX_ZMAX,
        ];

        cornerIndices.forEach((idx) => {
          const cornerState = this.sphereStates[idx];
          if (cornerState) {
            const cornerVec = vec3.fromValues(
              cornerState.point[0],
              cornerState.point[1],
              cornerState.point[2]
            );
            vec3.transformMat4(cornerVec, cornerVec, transform);
            cornerState.point = [
              cornerVec[0],
              cornerVec[1],
              cornerVec[2],
            ] as Types.Point3;
            cornerState.sphereSource.setCenter(...cornerState.point);
            cornerState.sphereSource.modified();
          }
        });

        // Update edge lines to follow the rotated corner spheres
        Object.values(this.edgeLines).forEach(({ source, key1, key2 }) => {
          const state1 = this.sphereStates.find(
            (s) => s.uid === `corner_${key1}`
          );
          const state2 = this.sphereStates.find(
            (s) => s.uid === `corner_${key2}`
          );
          if (state1 && state2) {
            const points = source.getPoints();
            points.setPoint(
              0,
              state1.point[0],
              state1.point[1],
              state1.point[2]
            );
            points.setPoint(
              1,
              state2.point[0],
              state2.point[1],
              state2.point[2]
            );
            points.modified();
            source.modified();
          }
        });
      }

      this._updateClippingPlanes(viewport);
      viewport.render();

      triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, {
        originalClippingPlanes: this.originalClippingPlanes,
        viewportId: viewport.id,
        renderingEngineId: viewport.renderingEngineId,
        seriesInstanceUID: this.seriesInstanceUID,
      });
    }
  };

  _getDirectionVectors(): {
    xDir: Types.Point3;
    yDir: Types.Point3;
    zDir: Types.Point3;
  } {
    const hasPlanes =
      this.originalClippingPlanes?.length >= NUM_CLIPPING_PLANES;

    return {
      xDir: hasPlanes
        ? (this.originalClippingPlanes[PLANEINDEX.XMIN].normal as Types.Point3)
        : this.volumeDirectionVectors?.xDir || [1, 0, 0],
      yDir: hasPlanes
        ? (this.originalClippingPlanes[PLANEINDEX.YMIN].normal as Types.Point3)
        : this.volumeDirectionVectors?.yDir || [0, 1, 0],
      zDir: hasPlanes
        ? (this.originalClippingPlanes[PLANEINDEX.ZMIN].normal as Types.Point3)
        : this.volumeDirectionVectors?.zDir || [0, 0, 1],
    };
  }

  _updateSpherePosition(sphereIndex: number, newPoint: Types.Point3): void {
    const state = this.sphereStates[sphereIndex];
    if (state) {
      state.point = newPoint;
      state.sphereSource.setCenter(...newPoint);
      state.sphereSource.modified();
    }
  }

  _updateFaceSpheresFromClippingPlanes(): void {
    const faceMappings = [
      { sphereIdx: SPHEREINDEX.XMIN, planeIdx: PLANEINDEX.XMIN },
      { sphereIdx: SPHEREINDEX.XMAX, planeIdx: PLANEINDEX.XMAX },
      { sphereIdx: SPHEREINDEX.YMIN, planeIdx: PLANEINDEX.YMIN },
      { sphereIdx: SPHEREINDEX.YMAX, planeIdx: PLANEINDEX.YMAX },
      { sphereIdx: SPHEREINDEX.ZMIN, planeIdx: PLANEINDEX.ZMIN },
      { sphereIdx: SPHEREINDEX.ZMAX, planeIdx: PLANEINDEX.ZMAX },
    ];

    faceMappings.forEach(({ sphereIdx, planeIdx }) => {
      const newPoint = [
        ...this.originalClippingPlanes[planeIdx].origin,
      ] as Types.Point3;
      this._updateSpherePosition(sphereIdx, newPoint);
    });
  }

  _averagePoints(points: Types.Point3[]): Types.Point3 {
    const sum = points.reduce(
      (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
      [0, 0, 0]
    );
    return [
      sum[0] / points.length,
      sum[1] / points.length,
      sum[2] / points.length,
    ] as Types.Point3;
  }

  _notifyClippingPlanesChanged(viewport?): void {
    const eventData: {
      originalClippingPlanes: ClippingPlane[];
      seriesInstanceUID?: string;
      viewportId?: string;
      renderingEngineId?: string;
    } = {
      originalClippingPlanes: this.originalClippingPlanes,
      seriesInstanceUID: this.seriesInstanceUID,
    };

    if (viewport) {
      eventData.viewportId = viewport.id;
      eventData.renderingEngineId = viewport.renderingEngineId;
    }

    triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, eventData);
  }

  _calculateCornerFromFaces(
    faceX: Types.Point3,
    faceY: Types.Point3,
    faceZ: Types.Point3,
    xDir: Types.Point3,
    yDir: Types.Point3,
    zDir: Types.Point3
  ): Types.Point3 {
    const deltaXY = [
      faceY[0] - faceX[0],
      faceY[1] - faceX[1],
      faceY[2] - faceX[2],
    ];
    const distY =
      deltaXY[0] * yDir[0] + deltaXY[1] * yDir[1] + deltaXY[2] * yDir[2];

    const deltaXZ = [
      faceZ[0] - faceX[0],
      faceZ[1] - faceX[1],
      faceZ[2] - faceX[2],
    ];
    const distZ =
      deltaXZ[0] * zDir[0] + deltaXZ[1] * zDir[1] + deltaXZ[2] * zDir[2];

    return [
      faceX[0] + distY * yDir[0] + distZ * zDir[0],
      faceX[1] + distY * yDir[1] + distZ * zDir[1],
      faceX[2] + distY * yDir[2] + distZ * zDir[2],
    ] as Types.Point3;
  }

  _calculateCornerFromProjection(
    faceX: Types.Point3,
    faceY: Types.Point3,
    faceZ: Types.Point3,
    xDir: Types.Point3,
    yDir: Types.Point3,
    zDir: Types.Point3
  ): Types.Point3 {
    const dX = faceX[0] * xDir[0] + faceX[1] * xDir[1] + faceX[2] * xDir[2];
    const dY = faceY[0] * yDir[0] + faceY[1] * yDir[1] + faceY[2] * yDir[2];
    const dZ = faceZ[0] * zDir[0] + faceZ[1] * zDir[1] + faceZ[2] * zDir[2];

    return [
      dX * xDir[0] + dY * yDir[0] + dZ * zDir[0],
      dX * xDir[1] + dY * yDir[1] + dZ * zDir[1],
      dX * xDir[2] + dY * yDir[2] + dZ * zDir[2],
    ] as Types.Point3;
  }

  _updateEdgeLines(): void {
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
