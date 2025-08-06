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
  XMIN: 0,
  XMAX: 1,
  YMIN: 2,
  YMAX: 3,
  ZMIN: 4,
  ZMAX: 5,
};
const SPHEREINDEX = {
  // cube faces
  XMIN: 0,
  XMAX: 1,
  YMIN: 2,
  YMAX: 3,
  ZMIN: 4,
  ZMAX: 5,
  // cube corners
  XMIN_YMIN_ZMIN: 6,
  XMIN_YMIN_ZMAX: 7,
  XMIN_YMAX_ZMIN: 8,
  XMIN_YMAX_ZMAX: 9,
  XMAX_YMIN_ZMIN: 10,
  XMAX_YMIN_ZMAX: 11,
  XMAX_YMAX_ZMIN: 12,
  XMAX_YMAX_ZMAX: 13,
};

/**
 * VolumeCroppingTool provides manipulatable spheres and real-time volume cropping capabilities.
 *  It renders interactive handles (spheres) at face centers and corners of a cropping box, allowing users to precisely adjust volume boundaries through direct manipulation in 3D space.
 *
 * @remarks
 * This tool creates a complete 3D cropping interface with:
 * - 6 face spheres for individual axis cropping
 * - 8 corner spheres for multi-axis cropping
 * - 12 edge lines connecting corner spheres
 * - Real-time clipping plane updates
 * - Synchronization with VolumeCroppingControlTool working on the same series instance UID for cross-viewport interaction
 *
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
 *     SAGITTAL: [1.0, 1.0, 0.0], // Yellow for sagittal (X-axis) spheres
 *     CORONAL: [0.0, 1.0, 0.0], // Green for coronal (Y-axis) spheres
 *     AXIAL: [1.0, 0.0, 0.0], // Red for axial (Z-axis) spheres
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
          // For face spheres, only store the offset along the axis of movement
          const axisIdx = { x: 0, y: 1, z: 2 }[sphereState.axis];
          this.faceDragOffset =
            sphereState.point[axisIdx] - mouseWorld[axisIdx];
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
      this.sphereStates[SPHEREINDEX.XMIN].point[0] =
        this.originalClippingPlanes[PLANEINDEX.XMIN].origin[0];
      this.sphereStates[SPHEREINDEX.XMAX].point[0] =
        this.originalClippingPlanes[PLANEINDEX.XMAX].origin[0];
      this.sphereStates[SPHEREINDEX.YMIN].point[1] =
        this.originalClippingPlanes[PLANEINDEX.YMIN].origin[1];
      this.sphereStates[SPHEREINDEX.YMAX].point[1] =
        this.originalClippingPlanes[PLANEINDEX.YMAX].origin[1];
      this.sphereStates[SPHEREINDEX.ZMIN].point[2] =
        this.originalClippingPlanes[PLANEINDEX.ZMIN].origin[2];
      this.sphereStates[SPHEREINDEX.ZMAX].point[2] =
        this.originalClippingPlanes[PLANEINDEX.ZMAX].origin[2];

      // Update all sphere actors' positions
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
      // Calculate and update just the dragged corner position
      const newCorner = this._calculateNewCornerPosition(world);
      this._updateSpherePosition(sphereState, newCorner);

      // Update related corners
      const axisFlags = this._parseCornerKey(sphereState.uid);
      this._updateRelatedCorners(sphereState, newCorner, axisFlags);

      // Update face spheres and corners
      this._updateFaceSpheresFromCorners();
      this._updateCornerSpheres();
    } else {
      // Update face sphere position
      const axisIdx = { x: 0, y: 1, z: 2 }[sphereState.axis];
      let newValue = world[axisIdx];
      if (this.faceDragOffset !== null) {
        newValue += this.faceDragOffset;
      }
      sphereState.point[axisIdx] = newValue;
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
      const normals = isMin
        ? [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ]
        : [
            [-1, 0, 0],
            [0, -1, 0],
            [0, 0, -1],
          ];
      const planeIndices = isMin
        ? [PLANEINDEX.XMIN, PLANEINDEX.YMIN, PLANEINDEX.ZMIN]
        : [PLANEINDEX.XMAX, PLANEINDEX.YMAX, PLANEINDEX.ZMAX];
      const sphereIndices = isMin
        ? [SPHEREINDEX.XMIN, SPHEREINDEX.YMIN, SPHEREINDEX.ZMIN]
        : [SPHEREINDEX.XMAX, SPHEREINDEX.YMAX, SPHEREINDEX.ZMAX];
      const axes = ['x', 'y', 'z'];
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
    } else if (axis === 'z') {
      color = sphereColors.AXIAL || [1.0, 0.0, 0.0]; // Z-axis = AXIAL planes
    } else if (axis === 'x') {
      color = sphereColors.SAGITTAL || [1.0, 1.0, 0.0]; // X-axis = SAGITTAL planes
    } else if (axis === 'y') {
      color = sphereColors.CORONAL || [0.0, 1.0, 0.0]; // Y-axis = CORONAL planes
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
    const worldBounds = imageData.getBounds(); // Already in world coordinates
    const cropFactor = this.configuration.initialCropFactor || 0.1;

    // Calculate cropping bounds using world bounds
    const xRange = worldBounds[1] - worldBounds[0];
    const yRange = worldBounds[3] - worldBounds[2];
    const zRange = worldBounds[5] - worldBounds[4];

    const xMin = worldBounds[0] + cropFactor * xRange;
    const xMax = worldBounds[1] - cropFactor * xRange;
    const yMin = worldBounds[2] + cropFactor * yRange;
    const yMax = worldBounds[3] - cropFactor * yRange;
    const zMin = worldBounds[4] + cropFactor * zRange;
    const zMax = worldBounds[5] - cropFactor * zRange;

    const planes: vtkPlane[] = [];

    // X min plane (cuts everything left of xMin)
    const planeXmin = vtkPlane.newInstance({
      origin: [xMin, 0, 0],
      normal: [1, 0, 0],
    });
    const planeXmax = vtkPlane.newInstance({
      origin: [xMax, 0, 0],
      normal: [-1, 0, 0],
    });
    const planeYmin = vtkPlane.newInstance({
      origin: [0, yMin, 0],
      normal: [0, 1, 0],
    });
    const planeYmax = vtkPlane.newInstance({
      origin: [0, yMax, 0],
      normal: [0, -1, 0],
    });
    const planeZmin = vtkPlane.newInstance({
      origin: [0, 0, zMin],
      normal: [0, 0, 1],
    });
    const planeZmax = vtkPlane.newInstance({
      origin: [0, 0, zMax],
      normal: [0, 0, -1],
    });
    const mapper = viewport
      .getDefaultActor()
      .actor.getMapper() as vtkVolumeMapper;
    planes.push(planeXmin);
    planes.push(planeXmax);
    planes.push(planeYmin);
    planes.push(planeYmax);
    planes.push(planeZmin);
    planes.push(planeZmax);

    const originalPlanes = planes.map((plane) => ({
      origin: [...plane.getOrigin()],
      normal: [...plane.getNormal()],
    }));

    this.originalClippingPlanes = originalPlanes;
    const sphereXminPoint = [xMin, (yMax + yMin) / 2, (zMax + zMin) / 2];
    const sphereXmaxPoint = [xMax, (yMax + yMin) / 2, (zMax + zMin) / 2];
    const sphereYminPoint = [(xMax + xMin) / 2, yMin, (zMax + zMin) / 2];
    const sphereYmaxPoint = [(xMax + xMin) / 2, yMax, (zMax + zMin) / 2];
    const sphereZminPoint = [(xMax + xMin) / 2, (yMax + yMin) / 2, zMin];
    const sphereZmaxPoint = [(xMax + xMin) / 2, (yMax + yMin) / 2, zMax];
    const adaptiveRadius = this._calculateAdaptiveSphereRadius(
      Math.sqrt(xRange * xRange + yRange * yRange + zRange * zRange)
    );
    this._addSphere(
      viewport,
      sphereXminPoint,
      'x',
      'min',
      null,
      adaptiveRadius
    );
    this._addSphere(
      viewport,
      sphereXmaxPoint,
      'x',
      'max',
      null,
      adaptiveRadius
    );
    this._addSphere(
      viewport,
      sphereYminPoint,
      'y',
      'min',
      null,
      adaptiveRadius
    );
    this._addSphere(
      viewport,
      sphereYmaxPoint,
      'y',
      'max',
      null,
      adaptiveRadius
    );
    this._addSphere(
      viewport,
      sphereZminPoint,
      'z',
      'min',
      null,
      adaptiveRadius
    );
    this._addSphere(
      viewport,
      sphereZmaxPoint,
      'z',
      'max',
      null,
      adaptiveRadius
    );

    const corners = [
      [xMin, yMin, zMin],
      [xMin, yMin, zMax],
      [xMin, yMax, zMin],
      [xMin, yMax, zMax],
      [xMax, yMin, zMin],
      [xMax, yMin, zMax],
      [xMax, yMax, zMin],
      [xMax, yMax, zMax],
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
      // X edges
      ['XMIN_YMIN_ZMIN', 'XMAX_YMIN_ZMIN'],
      ['XMIN_YMIN_ZMAX', 'XMAX_YMIN_ZMAX'],
      ['XMIN_YMAX_ZMIN', 'XMAX_YMAX_ZMIN'],
      ['XMIN_YMAX_ZMAX', 'XMAX_YMAX_ZMAX'],
      // Y edges
      ['XMIN_YMIN_ZMIN', 'XMIN_YMAX_ZMIN'],
      ['XMIN_YMIN_ZMAX', 'XMIN_YMAX_ZMAX'],
      ['XMAX_YMIN_ZMIN', 'XMAX_YMAX_ZMIN'],
      ['XMAX_YMIN_ZMAX', 'XMAX_YMAX_ZMAX'],
      // Z edges
      ['XMIN_YMIN_ZMIN', 'XMIN_YMIN_ZMAX'],
      ['XMIN_YMAX_ZMIN', 'XMIN_YMAX_ZMAX'],
      ['XMAX_YMIN_ZMIN', 'XMAX_YMIN_ZMAX'],
      ['XMAX_YMAX_ZMIN', 'XMAX_YMAX_ZMAX'],
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

    mapper.addClippingPlane(planeXmin);
    mapper.addClippingPlane(planeXmax);
    mapper.addClippingPlane(planeYmin);
    mapper.addClippingPlane(planeYmax);
    mapper.addClippingPlane(planeZmin);
    mapper.addClippingPlane(planeZmax);

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

  // Handle corner sphere movement
  _handleCornerSphereMovement = (sphereState, world, viewport) => {
    // Calculate new position with offset
    const newCorner = this._calculateNewCornerPosition(world);

    // Update the dragged corner
    this._updateSpherePosition(sphereState, newCorner);

    // Parse corner key to determine axes
    const axisFlags = this._parseCornerKey(sphereState.uid);

    // Update related corners efficiently
    this._updateRelatedCorners(sphereState, newCorner, axisFlags);

    // Update dependent elements
    this._updateAfterCornerMovement(viewport);
  };

  // Handle face sphere movement
  _handleFaceSphereMovement = (sphereState, world, viewport) => {
    const axisIdx = { x: 0, y: 1, z: 2 }[sphereState.axis];
    let newValue = world[axisIdx];

    if (this.faceDragOffset !== null) {
      newValue += this.faceDragOffset;
    }

    // Update only the relevant axis
    sphereState.point[axisIdx] = newValue;
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
      isXMin: cornerKey.includes('XMIN'),
      isXMax: cornerKey.includes('XMAX'),
      isYMin: cornerKey.includes('YMIN'),
      isYMax: cornerKey.includes('YMAX'),
      isZMin: cornerKey.includes('ZMIN'),
      isZMax: cornerKey.includes('ZMAX'),
    };
  };

  // Update sphere position
  _updateSpherePosition = (sphereState, newPosition) => {
    sphereState.point = newPosition;
    sphereState.sphereSource.setCenter(...newPosition);
    sphereState.sphereSource.modified();
  };

  // Update related corners that share axes
  _updateRelatedCorners = (draggedSphere, newCorner, axisFlags) => {
    this.sphereStates.forEach((state) => {
      if (!state.isCorner || state === draggedSphere) {
        return;
      }

      const key = state.uid.replace('corner_', '');
      const shouldUpdate = this._shouldUpdateCorner(key, axisFlags);

      if (shouldUpdate) {
        this._updateCornerCoordinates(state, newCorner, key, axisFlags);
      }
    });
  };

  // Determine if a corner should be updated
  _shouldUpdateCorner = (cornerKey, axisFlags) => {
    return (
      (axisFlags.isXMin && cornerKey.includes('XMIN')) ||
      (axisFlags.isXMax && cornerKey.includes('XMAX')) ||
      (axisFlags.isYMin && cornerKey.includes('YMIN')) ||
      (axisFlags.isYMax && cornerKey.includes('YMAX')) ||
      (axisFlags.isZMin && cornerKey.includes('ZMIN')) ||
      (axisFlags.isZMax && cornerKey.includes('ZMAX'))
    );
  };

  // Update individual corner coordinates
  _updateCornerCoordinates = (state, newCorner, cornerKey, axisFlags) => {
    // X axis updates
    if (
      (axisFlags.isXMin && cornerKey.includes('XMIN')) ||
      (axisFlags.isXMax && cornerKey.includes('XMAX'))
    ) {
      state.point[0] = newCorner[0];
    }

    // Y axis updates
    if (
      (axisFlags.isYMin && cornerKey.includes('YMIN')) ||
      (axisFlags.isYMax && cornerKey.includes('YMAX'))
    ) {
      state.point[1] = newCorner[1];
    }

    // Z axis updates
    if (
      (axisFlags.isZMin && cornerKey.includes('ZMIN')) ||
      (axisFlags.isZMax && cornerKey.includes('ZMAX'))
    ) {
      state.point[2] = newCorner[2];
    }

    // Apply changes
    state.sphereSource.setCenter(...state.point);
    state.sphereSource.modified();
  };

  // Update after corner movement
  _updateAfterCornerMovement = (viewport) => {
    this._updateFaceSpheresFromCorners();
    this._updateCornerSpheres();
    this._updateClippingPlanesFromFaceSpheres(viewport);
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
    this.originalClippingPlanes[0].origin = [
      ...this.sphereStates[SPHEREINDEX.XMIN].point,
    ];
    this.originalClippingPlanes[1].origin = [
      ...this.sphereStates[SPHEREINDEX.XMAX].point,
    ];
    this.originalClippingPlanes[2].origin = [
      ...this.sphereStates[SPHEREINDEX.YMIN].point,
    ];
    this.originalClippingPlanes[3].origin = [
      ...this.sphereStates[SPHEREINDEX.YMAX].point,
    ];
    this.originalClippingPlanes[4].origin = [
      ...this.sphereStates[SPHEREINDEX.ZMIN].point,
    ];
    this.originalClippingPlanes[5].origin = [
      ...this.sphereStates[SPHEREINDEX.ZMAX].point,
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
    // Get face sphere positions
    const xMin = this.sphereStates[SPHEREINDEX.XMIN].point[0];
    const xMax = this.sphereStates[SPHEREINDEX.XMAX].point[0];
    const yMin = this.sphereStates[SPHEREINDEX.YMIN].point[1];
    const yMax = this.sphereStates[SPHEREINDEX.YMAX].point[1];
    const zMin = this.sphereStates[SPHEREINDEX.ZMIN].point[2];
    const zMax = this.sphereStates[SPHEREINDEX.ZMAX].point[2];

    const corners = [
      { key: 'XMIN_YMIN_ZMIN', pos: [xMin, yMin, zMin] },
      { key: 'XMIN_YMIN_ZMAX', pos: [xMin, yMin, zMax] },
      { key: 'XMIN_YMAX_ZMIN', pos: [xMin, yMax, zMin] },
      { key: 'XMIN_YMAX_ZMAX', pos: [xMin, yMax, zMax] },
      { key: 'XMAX_YMIN_ZMIN', pos: [xMax, yMin, zMin] },
      { key: 'XMAX_YMIN_ZMAX', pos: [xMax, yMin, zMax] },
      { key: 'XMAX_YMAX_ZMIN', pos: [xMax, yMax, zMin] },
      { key: 'XMAX_YMAX_ZMAX', pos: [xMax, yMax, zMax] },
    ];

    for (const corner of corners) {
      const state = this.sphereStates.find(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (state) {
        state.point[0] = corner.pos[0];
        state.point[1] = corner.pos[1];
        state.point[2] = corner.pos[2];
        state.sphereSource.setCenter(...state.point);
        state.sphereSource.modified();
      }
    }
  }
  _updateFaceSpheresFromCorners() {
    // Get all corner points
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

    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const zs = corners.map((p) => p[2]);

    const xMin = Math.min(...xs),
      xMax = Math.max(...xs);
    const yMin = Math.min(...ys),
      yMax = Math.max(...ys);
    const zMin = Math.min(...zs),
      zMax = Math.max(...zs);

    // Face spheres should always be at the center of their face
    this.sphereStates[SPHEREINDEX.XMIN].point = [
      xMin,
      (yMin + yMax) / 2,
      (zMin + zMax) / 2,
    ];
    this.sphereStates[SPHEREINDEX.XMAX].point = [
      xMax,
      (yMin + yMax) / 2,
      (zMin + zMax) / 2,
    ];
    this.sphereStates[SPHEREINDEX.YMIN].point = [
      (xMin + xMax) / 2,
      yMin,
      (zMin + zMax) / 2,
    ];
    this.sphereStates[SPHEREINDEX.YMAX].point = [
      (xMin + xMax) / 2,
      yMax,
      (zMin + zMax) / 2,
    ];
    this.sphereStates[SPHEREINDEX.ZMIN].point = [
      (xMin + xMax) / 2,
      (yMin + yMax) / 2,
      zMin,
    ];
    this.sphereStates[SPHEREINDEX.ZMAX].point = [
      (xMin + xMax) / 2,
      (yMin + yMax) / 2,
      zMax,
    ];

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
  }

  _updateCornerSpheres() {
    // Get face sphere positions
    const xMin = this.sphereStates[SPHEREINDEX.XMIN].point[0];
    const xMax = this.sphereStates[SPHEREINDEX.XMAX].point[0];
    const yMin = this.sphereStates[SPHEREINDEX.YMIN].point[1];
    const yMax = this.sphereStates[SPHEREINDEX.YMAX].point[1];
    const zMin = this.sphereStates[SPHEREINDEX.ZMIN].point[2];
    const zMax = this.sphereStates[SPHEREINDEX.ZMAX].point[2];

    // Define all 8 corners from face sphere positions
    const corners = [
      { key: 'XMIN_YMIN_ZMIN', pos: [xMin, yMin, zMin] },
      { key: 'XMIN_YMIN_ZMAX', pos: [xMin, yMin, zMax] },
      { key: 'XMIN_YMAX_ZMIN', pos: [xMin, yMax, zMin] },
      { key: 'XMIN_YMAX_ZMAX', pos: [xMin, yMax, zMax] },
      { key: 'XMAX_YMIN_ZMIN', pos: [xMax, yMin, zMin] },
      { key: 'XMAX_YMIN_ZMAX', pos: [xMax, yMin, zMax] },
      { key: 'XMAX_YMAX_ZMIN', pos: [xMax, yMax, zMin] },
      { key: 'XMAX_YMAX_ZMAX', pos: [xMax, yMax, zMax] },
    ];

    // Update corner spheres
    for (const corner of corners) {
      const state = this.sphereStates.find(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (state) {
        state.point[0] = corner.pos[0];
        state.point[1] = corner.pos[1];
        state.point[2] = corner.pos[2];
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
