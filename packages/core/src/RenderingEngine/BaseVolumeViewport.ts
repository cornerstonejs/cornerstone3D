import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

import { vec3 } from 'gl-matrix';

import cache from '../cache';
import {
  MPR_CAMERA_VALUES,
  RENDERING_DEFAULTS,
  VIEWPORT_PRESETS,
} from '../constants';
import {
  BlendModes,
  Events,
  InterpolationType,
  OrientationAxis,
  ViewportStatus,
  VOILUTFunctionType,
} from '../enums';
import ViewportType from '../enums/ViewportType';
import eventTarget from '../eventTarget';
import { getShouldUseCPURendering } from '../init';
import { loadVolume } from '../loaders/volumeLoader';
import type {
  ActorEntry,
  ColormapPublic,
  FlipDirection,
  IImageData,
  IVolumeInput,
  OrientationVectors,
  Point2,
  Point3,
  VOIRange,
  EventTypes,
  VolumeViewportProperties,
  ViewReferenceSpecifier,
  ReferenceCompatibleOptions,
} from '../types';
import { VoiModifiedEventDetail } from '../types/EventTypes';
import type { ViewportInput } from '../types/IViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import type { ViewReference } from '../types/IViewport';
import {
  actorIsA,
  applyPreset,
  createSigmoidRGBTransferFunction,
  getVoiFromSigmoidRGBTransferFunction,
  imageIdToURI,
  invertRgbTransferFunction,
  triggerEvent,
  colormap as colormapUtils,
  isEqual,
} from '../utilities';
import { createVolumeActor } from './helpers';
import volumeNewImageEventDispatcher, {
  resetVolumeNewImageState,
} from './helpers/volumeNewImageEventDispatcher';
import Viewport from './Viewport';
import type { vtkSlabCamera as vtkSlabCameraType } from './vtkClasses/vtkSlabCamera';
import vtkSlabCamera from './vtkClasses/vtkSlabCamera';
import transformWorldToIndex from '../utilities/transformWorldToIndex';
import { getTransferFunctionNodes } from '../utilities/transferFunctionUtils';
/**
 * Abstract base class for volume viewports. VolumeViewports are used to render
 * 3D volumes from which various orientations can be viewed. Since VolumeViewports
 * use SharedVolumeMappers behind the scene, memory footprint of visualizations
 * of the same volume in different orientations is very small.
 *
 * For setting volumes on viewports you need to use {@link addVolumesToViewports}
 * which will add volumes to the specified viewports.
 */
abstract class BaseVolumeViewport extends Viewport implements IVolumeViewport {
  useCPURendering = false;
  useNativeDataType = false;
  private _FrameOfReferenceUID: string;

  protected initialTransferFunctionNodes: any;
  // Viewport Properties
  private globalDefaultProperties: VolumeViewportProperties;
  private perVolumeIdDefaultProperties = new Map<
    string,
    VolumeViewportProperties
  >();
  // Camera properties
  protected initialViewUp: Point3;
  protected viewportProperties: VolumeViewportProperties = {};

  constructor(props: ViewportInput) {
    super(props);

    this.useCPURendering = getShouldUseCPURendering();
    this.useNativeDataType = this._shouldUseNativeDataType();

    if (this.useCPURendering) {
      throw new Error(
        'VolumeViewports cannot be used whilst CPU Fallback Rendering is enabled.'
      );
    }

    const renderer = this.getRenderer();

    const camera = vtkSlabCamera.newInstance();
    renderer.setActiveCamera(camera);

    switch (this.type) {
      case ViewportType.ORTHOGRAPHIC:
        camera.setParallelProjection(true);
        break;
      case ViewportType.VOLUME_3D:
        camera.setParallelProjection(true);
        break;
      case ViewportType.PERSPECTIVE:
        camera.setParallelProjection(false);
        break;
      default:
        throw new Error(`Unrecognized viewport type: ${this.type}`);
    }

    this.initializeVolumeNewImageEventDispatcher();
  }

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  protected applyViewOrientation(
    orientation: OrientationAxis | OrientationVectors
  ) {
    const { viewPlaneNormal, viewUp } =
      this._getOrientationVectors(orientation);
    const camera = this.getVtkActiveCamera();
    camera.setDirectionOfProjection(
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2]
    );
    camera.setViewUpFrom(viewUp);
    this.initialViewUp = viewUp;

    this.resetCamera();
  }

  private initializeVolumeNewImageEventDispatcher(): void {
    const volumeNewImageHandlerBound = volumeNewImageHandler.bind(this);
    const volumeNewImageCleanUpBound = volumeNewImageCleanUp.bind(this);

    function volumeNewImageHandler(cameraEvent) {
      const { viewportId } = cameraEvent.detail;

      if (viewportId !== this.id || this.isDisabled) {
        return;
      }

      const viewportImageData = this.getImageData();

      if (!viewportImageData) {
        return;
      }

      volumeNewImageEventDispatcher(cameraEvent);
    }

    function volumeNewImageCleanUp(evt) {
      const { viewportId } = evt.detail;

      if (viewportId !== this.id) {
        return;
      }

      this.element.removeEventListener(
        Events.CAMERA_MODIFIED,
        volumeNewImageHandlerBound
      );

      eventTarget.removeEventListener(
        Events.ELEMENT_DISABLED,
        volumeNewImageCleanUpBound
      );

      resetVolumeNewImageState(viewportId);
    }

    this.element.removeEventListener(
      Events.CAMERA_MODIFIED,
      volumeNewImageHandlerBound
    );
    this.element.addEventListener(
      Events.CAMERA_MODIFIED,
      volumeNewImageHandlerBound
    );

    eventTarget.addEventListener(
      Events.ELEMENT_DISABLED,
      volumeNewImageCleanUpBound
    );
  }

  protected resetVolumeViewportClippingRange() {
    const activeCamera = this.getVtkActiveCamera();

    if (activeCamera.getParallelProjection()) {
      activeCamera.setClippingRange(
        -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
        RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
      );
    } else {
      activeCamera.setClippingRange(
        RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
        RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
      );
    }
  }

  /**
   * Sets the properties for the volume viewport on the volume
   * Sets the VOILUTFunction property for the volume viewport on the volume
   *
   * @param VOILUTFunction - Sets the voi mode (LINEAR or SAMPLED_SIGMOID)
   * @param volumeId - The volume id to set the properties for (if undefined, the first volume)
   * @param suppressEvents - If true, the viewport will not emit events
   */
  private setVOILUTFunction(
    voiLUTFunction: VOILUTFunctionType,
    volumeId?: string,
    suppressEvents?: boolean
  ): void {
    // make sure the VOI LUT function is valid in the VOILUTFunctionType which is enum
    if (Object.values(VOILUTFunctionType).indexOf(voiLUTFunction) === -1) {
      voiLUTFunction = VOILUTFunctionType.LINEAR;
    }
    const { voiRange } = this.getProperties();
    this.setVOI(voiRange, volumeId, suppressEvents);
    this.viewportProperties.VOILUTFunction = voiLUTFunction;
  }

  /**
   * Sets the colormap for the volume with the given ID and optionally suppresses events.
   *
   * @param colormap - The colormap to apply (e.g., "hsv").
   * @param volumeId - The ID of the volume to set the colormap for.
   * @param suppressEvents - If `true`, events will not be emitted during the colormap a
   *
   * @returns void
   */
  private setColormap(
    colormap: ColormapPublic,
    volumeId: string,
    suppressEvents?: boolean
  ) {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);
    if (!applicableVolumeActorInfo) {
      return;
    }

    const { volumeActor } = applicableVolumeActorInfo;

    const mapper = volumeActor.getMapper();
    mapper.setSampleDistance(1.0);

    const cfun = vtkColorTransferFunction.newInstance();
    let colormapObj = colormapUtils.getColormap(colormap.name);

    const { name } = colormap;

    if (!colormapObj) {
      colormapObj = vtkColorMaps.getPresetByName(name);
    }

    if (!colormapObj) {
      throw new Error(`Colormap ${colormap} not found`);
    }

    const range = volumeActor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    cfun.applyColorMap(colormapObj);
    cfun.setMappingRange(range[0], range[1]);
    volumeActor.getProperty().setRGBTransferFunction(0, cfun);

    // This configures the viewport to use the most recently applied colormap.
    // However, this approach is not optimal when dealing with two volumes, as it prevents retrieval of the
    // colormap for Volume A if Volume B's colormap was the last one applied.
    this.viewportProperties.colormap = colormap;

    if (!suppressEvents) {
      const eventDetail = {
        viewportId: this.id,
        colormap,
        volumeId,
      };
      triggerEvent(this.element, Events.COLORMAP_MODIFIED, eventDetail);
    }
  }

  /**
   * Sets the opacity for the volume with the given ID.
   *
   * @param colormap - An object containing opacity that can be a number or an array of OpacityMapping
   * @param volumeId - The ID of the volume to set the opacity for.
   *
   * @returns void
   */
  private setOpacity(colormap: ColormapPublic, volumeId: string) {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);
    if (!applicableVolumeActorInfo) {
      return;
    }
    const { volumeActor } = applicableVolumeActorInfo;

    const ofun = vtkPiecewiseFunction.newInstance();
    if (typeof colormap.opacity === 'number') {
      const range = volumeActor
        .getProperty()
        .getRGBTransferFunction(0)
        .getRange();

      ofun.addPoint(range[0], colormap.opacity);
      ofun.addPoint(range[1], colormap.opacity);
    } else {
      colormap.opacity.forEach(({ opacity, value }) => {
        ofun.addPoint(value, opacity);
      });
    }
    volumeActor.getProperty().setScalarOpacity(0, ofun);

    this.viewportProperties.colormap.opacity = colormap.opacity;
  }

  /**
   * Sets the inversion for the volume transfer function
   *
   * @param inverted - Should the transfer function be inverted?
   * @param volumeId - volumeId
   * @param suppressEvents - If `true`, events will not be published
   *
   * @returns void
   */
  private setInvert(
    inverted: boolean,
    volumeId?: string,
    suppressEvents?: boolean
  ) {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);

    if (!applicableVolumeActorInfo) {
      return;
    }

    const volumeIdToUse = applicableVolumeActorInfo.volumeId;

    const cfun = this._getOrCreateColorTransferFunction(volumeIdToUse);
    invertRgbTransferFunction(cfun);

    const { voiRange, VOILUTFunction } = this.getProperties(volumeIdToUse);

    this.viewportProperties.invert = inverted;

    if (!suppressEvents) {
      const eventDetail: VoiModifiedEventDetail = {
        viewportId: this.id,
        range: voiRange,
        volumeId: volumeIdToUse,
        VOILUTFunction: VOILUTFunction,
        invert: inverted,
        invertStateChanged: true,
      };

      triggerEvent(this.element, Events.VOI_MODIFIED, eventDetail);
    }
  }

  private _getOrCreateColorTransferFunction(
    volumeId: string
  ): vtkColorTransferFunction {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);

    if (!applicableVolumeActorInfo) {
      return null;
    }

    const { volumeActor } = applicableVolumeActorInfo;

    const rgbTransferFunction = volumeActor
      .getProperty()
      .getRGBTransferFunction(0);

    if (rgbTransferFunction) {
      return rgbTransferFunction;
    }

    const newRGBTransferFunction = vtkColorTransferFunction.newInstance();
    volumeActor.getProperty().setRGBTransferFunction(0, newRGBTransferFunction);

    return newRGBTransferFunction;
  }

  private setInterpolationType(
    interpolationType: InterpolationType,
    volumeId?: string
  ) {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);

    if (!applicableVolumeActorInfo) {
      return;
    }

    const { volumeActor } = applicableVolumeActorInfo;
    const volumeProperty = volumeActor.getProperty();

    // @ts-ignore
    volumeProperty.setInterpolationType(interpolationType);
    this.viewportProperties.interpolationType = interpolationType;
  }

  /**
   * Sets the properties for the volume viewport on the volume
   * (if fusion, it sets it for the first volume in the fusion)
   *
   * @param voiRange - Sets the lower and upper voi
   * @param volumeId - The volume id to set the properties for (if undefined, the first volume)
   * @param suppressEvents - If true, the viewport will not emit events
   */
  private setVOI(
    voiRange: VOIRange,
    volumeId?: string,
    suppressEvents = false
  ): void {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);

    if (!applicableVolumeActorInfo) {
      return;
    }

    const { volumeActor } = applicableVolumeActorInfo;
    const volumeIdToUse = applicableVolumeActorInfo.volumeId;

    let voiRangeToUse = voiRange;
    if (typeof voiRangeToUse === 'undefined') {
      const imageData = volumeActor.getMapper().getInputData();
      const range = imageData.getPointData().getScalars().getRange();
      const maxVoiRange = { lower: range[0], upper: range[1] };
      voiRangeToUse = maxVoiRange;
    }

    const { VOILUTFunction } = this.getProperties(volumeIdToUse);

    // scaling logic here
    // https://github.com/Kitware/vtk-js/blob/c6f2e12cddfe5c0386a73f0793eb6d9ab20d573e/Sources/Rendering/OpenGL/VolumeMapper/index.js#L957-L972
    if (VOILUTFunction === VOILUTFunctionType.SAMPLED_SIGMOID) {
      const cfun = createSigmoidRGBTransferFunction(voiRangeToUse);
      volumeActor.getProperty().setRGBTransferFunction(0, cfun);
    } else {
      // TODO: refactor and make it work for PET series (inverted/colormap)
      // const cfun = createLinearRGBTransferFunction(voiRangeToUse);
      // volumeActor.getProperty().setRGBTransferFunction(0, cfun);

      // Todo: Moving from LINEAR to SIGMOID and back to LINEAR will not
      // work until we implement it in a different way because the
      // LINEAR transfer function is not recreated.
      const { lower, upper } = voiRangeToUse;
      volumeActor
        .getProperty()
        .getRGBTransferFunction(0)
        .setRange(lower, upper);

      if (!this.initialTransferFunctionNodes) {
        const transferFunction = volumeActor
          .getProperty()
          .getRGBTransferFunction(0);
        this.initialTransferFunctionNodes =
          getTransferFunctionNodes(transferFunction);
      }
    }

    if (!suppressEvents) {
      const eventDetail: VoiModifiedEventDetail = {
        viewportId: this.id,
        range: voiRange,
        volumeId: volumeIdToUse,
        VOILUTFunction: VOILUTFunction,
      };

      triggerEvent(this.element, Events.VOI_MODIFIED, eventDetail);
    }

    this.viewportProperties.voiRange = voiRangeToUse;
  }

  private setRotation(rotation: number): void {
    const previousCamera = this.getCamera();

    this.rotateCamera(rotation);

    // New camera after rotation
    const camera = this.getCamera();

    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      previousCamera,
      camera,
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      rotation,
    };

    triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
    this.viewportProperties.rotation = rotation;
  }

  private rotateCamera(rotation: number): void {
    const rotationToApply = rotation - this.getRotation();
    // rotating camera to the new value
    this.getVtkActiveCamera().roll(-rotationToApply);
  }

  /**
   * Update the default properties for the volume viewport on the volume
   * @param ViewportProperties - The properties to set
   * @param volumeId - The volume id to set the default properties for (if undefined, we set the global default viewport properties)
   */
  public setDefaultProperties(
    ViewportProperties: VolumeViewportProperties,
    volumeId?: string
  ): void {
    if (volumeId == null) {
      this.globalDefaultProperties = ViewportProperties;
    } else {
      this.perVolumeIdDefaultProperties.set(volumeId, ViewportProperties);
    }
  }

  /**
   * Remove the global default properties of the viewport or remove default properties for a volumeId if specified
   * @param volumeId If given, we remove the default properties only for this volumeId, if not
   * the global default properties will be removed
   */
  public clearDefaultProperties(volumeId?: string): void {
    if (volumeId == null) {
      this.globalDefaultProperties = {};
      this.resetProperties();
    } else {
      this.perVolumeIdDefaultProperties.delete(volumeId);
      this.resetToDefaultProperties(volumeId);
    }
  }

  /**
   * Gets a view target, allowing comparison between view positions as well
   * as restoring views later.
   */
  public getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const target = super.getViewReference(viewRefSpecifier);
    if (viewRefSpecifier?.forFrameOfReference !== false) {
      target.volumeId = this.getVolumeId(viewRefSpecifier);
    }
    // TODO - add referencedImageId as a base URL for an image to allow a generic
    // method to specify which volumes this should apply to.
    return {
      ...target,
      sliceIndex: this.getCurrentImageIdIndex(),
    };
  }

  /**
   * Find out if this viewport would show this view
   *
   * @param options - allows specifying whether the view COULD display this with
   *                  some modification - either navigation or displaying as volume.
   * @returns true if the target is compatible with this view
   */
  public isReferenceViewable(
    viewRef: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean {
    if (!super.isReferenceViewable(viewRef, options)) {
      return false;
    }
    if (options?.withNavigation) {
      return true;
    }
    const currentSliceIndex = this.getCurrentImageIdIndex();
    const { sliceIndex } = viewRef;
    if (Array.isArray(sliceIndex)) {
      return (
        sliceIndex[0] <= currentSliceIndex && currentSliceIndex <= sliceIndex[1]
      );
    }
    return sliceIndex === undefined || sliceIndex === currentSliceIndex;
  }

  /**
   * Sets the properties for the volume viewport on the volume
   * and if setProperties is called for the first time, the properties will also become the default one.
   * (if fusion, it sets it for the first volume in the fusion)
   *
   * @param VolumeViewportProperties - The properties to set
   * @param [VolumeViewportProperties.voiRange] - Sets the lower and upper voi
   * @param [VolumeViewportProperties.VOILUTFunction] - Sets the voi mode (LINEAR, or SAMPLED_SIGMOID)
   * @param [VolumeViewportProperties.invert] - Inverts the color transfer function
   * @param [VolumeViewportProperties.colormap] - Sets the colormap
   * @param [VolumeViewportProperties.preset] - Sets the colormap preset
   * @param volumeId - The volume id to set the properties for (if undefined, the first volume)
   * @param suppressEvents - If true, the viewport will not emit events
   */
  public setProperties(
    {
      voiRange,
      VOILUTFunction,
      invert,
      colormap,
      preset,
      interpolationType,
      slabThickness,
      rotation,
    }: VolumeViewportProperties = {},
    volumeId?: string,
    suppressEvents = false
  ): void {
    //If the viewport hasn't been initialized, we need to set the default properties
    if (this.globalDefaultProperties == null) {
      this.setDefaultProperties({
        voiRange,
        VOILUTFunction,
        invert,
        colormap,
        preset,
        slabThickness,
        rotation,
      });
    }

    // Note: colormap should always be done first, since we can then
    // modify the voiRange

    if (colormap?.name) {
      this.setColormap(colormap, volumeId, suppressEvents);
    }
    if (colormap?.opacity != null) {
      this.setOpacity(colormap, volumeId);
    }

    if (voiRange !== undefined) {
      this.setVOI(voiRange, volumeId, suppressEvents);
    }

    if (typeof interpolationType !== 'undefined') {
      this.setInterpolationType(interpolationType);
    }

    if (VOILUTFunction !== undefined) {
      this.setVOILUTFunction(VOILUTFunction, volumeId, suppressEvents);
    }

    if (invert !== undefined && this.viewportProperties.invert !== invert) {
      this.setInvert(invert, volumeId, suppressEvents);
    }

    if (preset !== undefined) {
      this.setPreset(preset, volumeId, suppressEvents);
    }

    if (slabThickness !== undefined) {
      this.setSlabThickness(slabThickness);
      //We need to set the current slab thickness here since setSlabThickness is define in VolumeViewport
      this.viewportProperties.slabThickness = slabThickness;
    }

    if (rotation !== undefined) {
      this.setRotation(rotation);
    }
  }

  /**
   * Reset the viewport properties to the default values
   */
  public resetToDefaultProperties(volumeId: string): void {
    const properties = this.globalDefaultProperties;

    if (properties.colormap?.name) {
      this.setColormap(properties.colormap, volumeId);
    }
    if (properties.colormap?.opacity != null) {
      this.setOpacity(properties.colormap, volumeId);
    }

    if (properties.voiRange !== undefined) {
      this.setVOI(properties.voiRange, volumeId);
    }

    if (properties.VOILUTFunction !== undefined) {
      this.setVOILUTFunction(properties.VOILUTFunction, volumeId);
    }

    if (properties.invert !== undefined) {
      this.setInvert(properties.invert, volumeId);
    }

    if (properties.slabThickness !== undefined) {
      this.setSlabThickness(properties.slabThickness);
      //We need to set the current slabThickness here since setSlabThickness is define in VolumeViewport
      this.viewportProperties.slabThickness = properties.slabThickness;
    }

    if (properties.rotation !== undefined) {
      this.setRotation(properties.rotation);
    }

    this.render();
  }

  /**
   * Sets the specified preset for the volume with the given ID
   *
   * @param presetName - The name of the preset to apply (e.g., "CT-Bone").
   * @param volumeId - The ID of the volume to set the preset for.
   * @param suppressEvents - If `true`, events will not be emitted during the preset application.
   *
   * @returns void
   */
  private setPreset(presetNameOrObj, volumeId, suppressEvents) {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);

    if (!applicableVolumeActorInfo) {
      return;
    }

    const { volumeActor } = applicableVolumeActorInfo;

    let preset = presetNameOrObj;

    if (typeof preset === 'string') {
      preset = VIEWPORT_PRESETS.find((preset) => {
        return preset.name === presetNameOrObj;
      });
    }

    if (!preset) {
      return;
    }

    applyPreset(volumeActor, preset);

    if (!suppressEvents) {
      triggerEvent(this.element, Events.PRESET_MODIFIED, {
        viewportId: this.id,
        volumeId: applicableVolumeActorInfo.volumeId,
        actor: volumeActor,
        presetName: preset.name,
      });
    }
  }

  /**
   * Retrieve the viewport default properties
   * @param volumeId If given, we retrieve the default properties of a volumeId if it exists
   * If not given,we return the global properties of the viewport
   * @returns default viewport properties including voi, invert, interpolation type, colormap
   */
  public getDefaultProperties = (
    volumeId?: string
  ): VolumeViewportProperties => {
    let volumeProperties;
    if (volumeId !== undefined) {
      volumeProperties = this.perVolumeIdDefaultProperties.get(volumeId);
    }

    if (volumeProperties !== undefined) {
      return volumeProperties;
    }

    return {
      ...this.globalDefaultProperties,
    };
  };

  /**
   * Retrieve the viewport properties
   * @param volumeId - The volume id to get the properties for (if undefined, the first volume)
   * @returns viewport properties including voi, interpolation type: TODO: slabThickness, invert, rotation, flip
   */
  public getProperties = (volumeId?: string): VolumeViewportProperties => {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);
    if (!applicableVolumeActorInfo) {
      return;
    }

    const {
      colormap: latestColormap,
      VOILUTFunction,
      interpolationType,
      invert,
      slabThickness,
      rotation,
    } = this.viewportProperties;

    const voiRanges = this.getActors()
      .map((actorEntry) => {
        const volumeActor = actorEntry.actor as vtkVolume;
        const volumeId = actorEntry.uid;
        const volume = cache.getVolume(volumeId);
        if (!volume) {
          return null;
        }
        const cfun = volumeActor.getProperty().getRGBTransferFunction(0);
        const [lower, upper] =
          this.viewportProperties?.VOILUTFunction === 'SIGMOID'
            ? getVoiFromSigmoidRGBTransferFunction(cfun)
            : cfun.getRange();
        return { volumeId, voiRange: { lower, upper } };
      })
      .filter(Boolean);

    const voiRange = voiRanges.length ? voiRanges[0].voiRange : null;

    const volumeColormap = this.getColormap(applicableVolumeActorInfo);

    let colormap;
    if (volumeId && volumeColormap) {
      colormap = volumeColormap;
    } else {
      colormap = latestColormap;
    }

    return {
      colormap: colormap,
      voiRange: voiRange,
      VOILUTFunction: VOILUTFunction,
      interpolationType: interpolationType,
      invert: invert,
      slabThickness: slabThickness,
      rotation: rotation,
    };
  };

  /**
   * This function extracts the nodes from the RGB Transfer Function, transforming each node's x, r, g, b properties
   * into a unified array "RGB Points." Then, it compares these RGB Points—specifically the r, g, b values—with
   * those in the predefined vtk colormap presets. Upon finding a matching set of r, g, b values, the function identifies and selects the
   * corresponding colormap.
   *
   * Next, the function extracts an array of opacity points, formatted as a sequence of [x,y] pairs, where 'x' represents a value and
   * 'y' represents its opacity. It iterates through this array to construct an opacity object that maps each value to its opacity.
   *
   * The function returns an object that includes the name of the identified colormap and the constructed opacity object.
   * @param applicableVolumeActorInfo  - The volume actor information for the volume
   * @returns colormap information for the volume if identified
   */
  private getColormap = (applicableVolumeActorInfo) => {
    const { volumeActor } = applicableVolumeActorInfo;
    const cfun = volumeActor.getProperty().getRGBTransferFunction(0);
    const { nodes } = cfun.getState();
    const RGBPoints = nodes.reduce((acc, node) => {
      acc.push(node.x, node.r, node.g, node.b);
      return acc;
    }, []);
    const colormaps = vtkColorMaps.rgbPresetNames.map((presetName) =>
      vtkColorMaps.getPresetByName(presetName)
    );
    const matchedColormap = colormaps.find((colormap) => {
      const { RGBPoints: presetRGBPoints } = colormap;
      if (presetRGBPoints.length !== RGBPoints.length) {
        return false;
      }

      for (let i = 0; i < presetRGBPoints.length; i += 4) {
        if (
          !isEqual(
            presetRGBPoints.slice(i + 1, i + 4),
            RGBPoints.slice(i + 1, i + 4)
          )
        ) {
          return false;
        }
      }

      return true;
    });

    if (!matchedColormap) {
      return null;
    }

    const opacityPoints = volumeActor
      .getProperty()
      .getScalarOpacity(0)
      .getDataPointer();

    const opacity = [];
    for (let i = 0; i < opacityPoints.length; i += 2) {
      opacity.push({ value: opacityPoints[i], opacity: opacityPoints[i + 1] });
    }

    const colormap = {
      name: matchedColormap.Name,
      opacity: opacity,
    };

    return colormap;
  };

  /**
   * Creates volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
   * `VolumeMapper`.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  public async setVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
      );
    }

    const FrameOfReferenceUID = firstImageVolume.metadata.FrameOfReferenceUID;

    await this._isValidVolumeInputArray(volumeInputArray, FrameOfReferenceUID);

    this._FrameOfReferenceUID = FrameOfReferenceUID;

    const volumeActors = [];

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, actorUID, slabThickness } = volumeInputArray[i];

      const actor = await createVolumeActor(
        volumeInputArray[i],
        this.element,
        this.id,
        suppressEvents,
        this.useNativeDataType
      );

      // We cannot use only volumeId since then we cannot have for instance more
      // than one representation of the same volume (since actors would have the
      // same name, and we don't allow that) AND We cannot use only any uid, since
      // we rely on the volume in the cache for mapper. So we prefer actorUID if
      // it is defined, otherwise we use volumeId for the actor name.
      const uid = actorUID || volumeId;
      volumeActors.push({
        uid,
        actor,
        slabThickness,
        referenceId: volumeId,
      });
    }

    this._setVolumeActors(volumeActors);
    this.viewportStatus = ViewportStatus.PRE_RENDER;

    triggerEvent(this.element, Events.VOLUME_VIEWPORT_NEW_VOLUME, {
      viewportId: this.id,
      volumeActors,
    });

    if (immediate) {
      this.render();
    }
  }

  /**
   * Creates and adds volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  public async addVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
      );
    }
    const volumeActors = [];

    await this._isValidVolumeInputArray(
      volumeInputArray,
      this._FrameOfReferenceUID
    );

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, visibility, actorUID, slabThickness } =
        volumeInputArray[i];

      const actor = await createVolumeActor(
        volumeInputArray[i],
        this.element,
        this.id,
        suppressEvents,
        this.useNativeDataType
      );

      if (visibility === false) {
        actor.setVisibility(false);
      }

      // We cannot use only volumeId since then we cannot have for instance more
      // than one representation of the same volume (since actors would have the
      // same name, and we don't allow that) AND We cannot use only any uid, since
      // we rely on the volume in the cache for mapper. So we prefer actorUID if
      // it is defined, otherwise we use volumeId for the actor name.
      const uid = actorUID || volumeId;
      volumeActors.push({
        uid,
        actor,
        slabThickness,
        // although the actor UID is defined, we need to use the volumeId for the
        // referenceId, since the actor UID is used to reference the actor in the
        // viewport, however, the actor is created from its volumeId
        // and if later we need to grab the referenced volume from cache,
        // we can use the referenceId to get the volume from the cache
        referenceId: volumeId,
      });
    }

    this.addActors(volumeActors);

    if (immediate) {
      // render
      this.render();
    }
  }

  /**
   * It removes the volume actor from the Viewport. If the volume actor is not in
   * the viewport, it does nothing.
   * @param actorUIDs - Array of actor UIDs to remove. In case of simple volume it will
   * be the volume Id, but in case of Segmentation it will be `{volumeId}-{representationType}`
   * since the same volume can be rendered in multiple representations.
   * @param immediate - If true, the Viewport will be rendered immediately
   */
  public removeVolumeActors(actorUIDs: Array<string>, immediate = false): void {
    // Todo: This is actually removeActors
    this.removeActors(actorUIDs);

    if (immediate) {
      this.render();
    }
  }

  /**
   * It sets the orientation for the camera, the orientation can be one of the
   * following: axial, sagittal, coronal, default. Use the Enums.OrientationAxis
   * to set the orientation. The "default" orientation is the orientation that
   * the volume was acquired in (scan axis)
   *
   * @param orientation - The orientation to set the camera to.
   * @param immediate - Whether the `Viewport` should be rendered as soon as the camera is set.
   */
  public setOrientation(orientation: OrientationAxis, immediate = true): void {
    console.warn('Method "setOrientation" needs implementation');
  }

  private _getApplicableVolumeActor(volumeId?: string) {
    if (volumeId !== undefined && !this.getActor(volumeId)) {
      return;
    }

    const actorEntries = this.getActors();

    if (!actorEntries.length) {
      return;
    }

    let volumeActor;

    if (volumeId) {
      volumeActor = this.getActor(volumeId)?.actor as vtkVolume;
    }

    // // set it for the first volume (if there are more than one - fusion)
    if (!volumeActor) {
      volumeActor = actorEntries[0].actor as vtkVolume;
      volumeId = actorEntries[0].uid;
    }

    return { volumeActor, volumeId };
  }

  private async _isValidVolumeInputArray(
    volumeInputArray: Array<IVolumeInput>,
    FrameOfReferenceUID: string
  ): Promise<boolean> {
    const numVolumes = volumeInputArray.length;

    // Check all other volumes exist and have the same FrameOfReference
    for (let i = 1; i < numVolumes; i++) {
      const volumeInput = volumeInputArray[i];

      const imageVolume = await loadVolume(volumeInput.volumeId);

      if (!imageVolume) {
        throw new Error(
          `imageVolume with id: ${imageVolume.volumeId} does not exist`
        );
      }

      if (FrameOfReferenceUID !== imageVolume.metadata.FrameOfReferenceUID) {
        throw new Error(
          `Volumes being added to viewport ${this.id} do not share the same FrameOfReferenceUID. This is not yet supported`
        );
      }
    }

    return true;
  }

  /**
   * Gets the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently from the camera provided or the viewport.
   *
   * @returns the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently.
   */
  public getRotation = (): number => {
    const {
      viewUp: currentViewUp,
      viewPlaneNormal,
      flipVertical,
    } = this.getCamera();

    // The initial view up vector without any rotation, but incorporating vertical flip.
    const initialViewUp = flipVertical
      ? vec3.negate(vec3.create(), this.initialViewUp)
      : this.initialViewUp;

    if (!initialViewUp) {
      return 0;
    }

    // The angle between the initial and current view up vectors.
    // TODO: check with VTK about rounding errors here.
    const initialToCurrentViewUpAngle =
      (vec3.angle(initialViewUp, currentViewUp) * 180) / Math.PI;

    // Now determine if initialToCurrentViewUpAngle is positive or negative by comparing
    // the direction of the initial/current view up cross product with the current
    // viewPlaneNormal.

    const initialToCurrentViewUpCross = vec3.cross(
      vec3.create(),
      initialViewUp,
      currentViewUp
    );

    // The sign of the dot product of the start/end view up cross product and
    // the viewPlaneNormal indicates a positive or negative rotation respectively.
    const normalDot = vec3.dot(initialToCurrentViewUpCross, viewPlaneNormal);

    const value =
      normalDot >= 0
        ? initialToCurrentViewUpAngle
        : (360 - initialToCurrentViewUpAngle) % 360;

    return value;
  };

  /**
   * gets the visible bounds of the viewport in the world coordinate system
   */
  public getBounds(): number[] {
    const renderer = this.getRenderer();
    const bounds = renderer.computeVisiblePropBounds();
    return bounds;
  }

  /**
   * Flip the viewport along the desired axis
   * @param flipDirection - FlipDirection
   */
  public flip(flipDirection: FlipDirection): void {
    super.flip(flipDirection);
  }

  public getFrameOfReferenceUID = (): string => {
    return this._FrameOfReferenceUID;
  };

  /**
   * Checks if the viewport has a volume actor with the given volumeId
   * @param volumeId - the volumeId to look for
   * @returns Boolean indicating if the volume is present in the viewport
   */
  public hasVolumeId(volumeId: string): boolean {
    // Note: this assumes that the uid of the volume is the same as the volumeId
    // which is not guaranteed to be the case for SEG.
    const actorEntries = this.getActors();
    return actorEntries.some((actorEntry) => {
      return actorEntry.uid === volumeId;
    });
  }

  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   * Note: since the volume viewport supports fusion, to get the
   * image data for a specific volume, use the optional volumeId
   * argument.
   *
   * @param volumeId - The volumeId of the volume to get the image for.
   * @returns IImageData: {dimensions, direction, scalarData, vtkImageData, metadata, scaling}
   */
  public getImageData(volumeId?: string): IImageData | undefined {
    const defaultActor = this.getDefaultActor();
    if (!defaultActor) {
      return;
    }

    const { uid: defaultActorUID } = defaultActor;
    volumeId = volumeId ?? defaultActorUID;

    const actorEntry = this.getActor(volumeId);

    if (!actorIsA(actorEntry, 'vtkVolume')) {
      return;
    }

    const actor = actorEntry.actor;
    const volume = cache.getVolume(volumeId);

    const vtkImageData = actor.getMapper().getInputData();
    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      scalarData: vtkImageData.getPointData().getScalars().isDeleted()
        ? null
        : vtkImageData.getPointData().getScalars().getData(),
      imageData: actor.getMapper().getInputData(),
      metadata: {
        Modality: volume?.metadata?.Modality,
      },
      scaling: volume?.scaling,
      hasPixelSpacing: true,
    };
  }

  /**
   * Attaches the volume actors to the viewport.
   *
   * @param volumeActorEntries - The volume actors to add the viewport.
   *
   */
  private _setVolumeActors(volumeActorEntries: Array<ActorEntry>): void {
    // New volume actors implies resetting the inverted flag (i.e. like starting from scratch).

    for (let i = 0; i < volumeActorEntries.length; i++) {
      this.viewportProperties.invert = false;
    }
    this.setActors(volumeActorEntries);
  }

  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
   * and the direction of projection.
   *
   * @param canvasPos - The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   * @public
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    const vtkCamera = this.getVtkActiveCamera() as vtkSlabCameraType;

    /**
     * NOTE: this is necessary because we want the coordinate transformation
     * respect to the view plane (plane orthogonal to the camera and passing to
     * the focal point).
     *
     * When vtk.js computes the coordinate transformations, it simply uses the
     * camera matrix (no ray casting).
     *
     * However for the volume viewport the clipping range is set to be
     * (-RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE).
     * The clipping range is used in the camera method getProjectionMatrix().
     * The projection matrix is used then for viewToWorld/worldToView methods of
     * the renderer. This means that vkt.js will not return the coordinates of
     * the point on the view plane (i.e. the depth coordinate will correspond
     * to the focal point).
     *
     * Therefore the clipping range has to be set to (distance, distance + 0.01),
     * where now distance is the distance between the camera position and focal
     * point. This is done internally, in our camera customization when the flag
     * isPerformingCoordinateTransformation is set to true.
     */

    vtkCamera.setIsPerformingCoordinateTransformation?.(true);

    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasPosWithDPR = [
      canvasPos[0] * devicePixelRatio,
      canvasPos[1] * devicePixelRatio,
    ];
    const displayCoord = [
      canvasPosWithDPR[0] + this.sx,
      canvasPosWithDPR[1] + this.sy,
    ];

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    );

    vtkCamera.setIsPerformingCoordinateTransformation?.(false);

    return [worldCoord[0], worldCoord[1], worldCoord[2]];
  };

  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos - The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const vtkCamera = this.getVtkActiveCamera() as vtkSlabCameraType;

    /**
     * NOTE: this is necessary because we want the coordinate trasformation
     * respect to the view plane (plane orthogonal to the camera and passing to
     * the focal point).
     *
     * When vtk.js computes the coordinate transformations, it simply uses the
     * camera matrix (no ray casting).
     *
     * However for the volume viewport the clipping range is set to be
     * (-RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE).
     * The clipping range is used in the camera method getProjectionMatrix().
     * The projection matrix is used then for viewToWorld/worldToView methods of
     * the renderer. This means that vkt.js will not return the coordinates of
     * the point on the view plane (i.e. the depth coordinate will corresponded
     * to the focal point).
     *
     * Therefore the clipping range has to be set to (distance, distance + 0.01),
     * where now distance is the distance between the camera position and focal
     * point. This is done internally, in our camera customization when the flag
     * isPerformingCoordinateTransformation is set to true.
     */

    vtkCamera.setIsPerformingCoordinateTransformation?.(true);

    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...worldPos,
      renderer
    );

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const canvasCoord = <Point2>[
      displayCoord[0] - this.sx,
      displayCoord[1] - this.sy,
    ];

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasCoordWithDPR = <Point2>[
      canvasCoord[0] / devicePixelRatio,
      canvasCoord[1] / devicePixelRatio,
    ];

    vtkCamera.setIsPerformingCoordinateTransformation?.(false);

    return canvasCoordWithDPR;
  };

  /*
   * Checking if the imageURI is in the volumes that are being
   * rendered by the viewport. imageURI is the imageId without the schema
   * for instance for the imageId of wadors:http://..., the http://... is the imageURI.
   * Why we don't check the imageId is because the same image can be shown in
   * another viewport (StackViewport) with a different schema
   *
   * @param imageURI - The imageURI to check
   * @returns True if the imageURI is in the volumes that are being rendered by the viewport
   */
  public hasImageURI = (imageURI: string): boolean => {
    const volumeActors = this.getActors().filter((actorEntry) =>
      actorIsA(actorEntry, 'vtkVolume')
    );

    return volumeActors.some(({ uid }) => {
      const volume = cache.getVolume(uid);

      if (!volume || !volume.imageIds) {
        return false;
      }

      const volumeImageURIs = volume.imageIds.map(imageIdToURI);

      return volumeImageURIs.includes(imageURI);
    });
  };

  protected _getOrientationVectors(
    orientation: OrientationAxis | OrientationVectors
  ): OrientationVectors {
    if (typeof orientation === 'object') {
      if (orientation.viewPlaneNormal && orientation.viewUp) {
        return orientation;
      } else {
        throw new Error(
          'Invalid orientation object. It must contain viewPlaneNormal and viewUp'
        );
      }
    } else if (
      typeof orientation === 'string' &&
      MPR_CAMERA_VALUES[orientation]
    ) {
      this.viewportProperties.orientation = orientation;
      return MPR_CAMERA_VALUES[orientation];
    } else {
      throw new Error(
        `Invalid orientation: ${orientation}. Valid orientations are: ${Object.keys(
          MPR_CAMERA_VALUES
        ).join(', ')}`
      );
    }
  }
  /**
   * Gets the largest slab thickness from all actors in the viewport.
   *
   * @returns slabThickness - The slab thickness.
   */
  public getSlabThickness(): number {
    const actors = this.getActors();
    let slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
    actors.forEach((actor) => {
      if (actor.slabThickness > slabThickness) {
        slabThickness = actor.slabThickness;
      }
    });

    return slabThickness;
  }
  /**
   * Given a point in world coordinates, return the intensity at that point
   * @param point - The point in world coordinates to get the intensity
   * from.
   * @returns The intensity value of the voxel at the given point.
   */
  public getIntensityFromWorld(point: Point3): number {
    const actorEntry = this.getDefaultActor();
    if (!actorIsA(actorEntry, 'vtkVolume')) {
      return;
    }

    const { actor, uid } = actorEntry;
    const imageData = actor.getMapper().getInputData();

    const volume = cache.getVolume(uid);
    const { dimensions } = volume;

    const index = transformWorldToIndex(imageData, point);

    const voxelIndex =
      index[2] * dimensions[0] * dimensions[1] +
      index[1] * dimensions[0] +
      index[0];

    return volume.getScalarData()[voxelIndex];
  }

  /**
   * Returns the list of image Ids for the current viewport
   *
   * @param volumeId - volumeId
   * @returns list of strings for image Ids
   */
  public getImageIds = (volumeId?: string): Array<string> => {
    const applicableVolumeActorInfo = this._getApplicableVolumeActor(volumeId);

    if (!applicableVolumeActorInfo) {
      throw new Error(`No actor found for the given volumeId: ${volumeId}`);
    }

    const volumeIdToUse = applicableVolumeActorInfo.volumeId;

    const imageVolume = cache.getVolume(volumeIdToUse);
    if (!imageVolume) {
      throw new Error(
        `imageVolume with id: ${volumeIdToUse} does not exist in cache`
      );
    }

    return imageVolume.imageIds;
  };

  abstract getCurrentImageId(): string;

  /** Gets the volumeId to use for references */
  protected getVolumeId(specifier: ViewReferenceSpecifier) {
    if (!specifier?.volumeId) {
      const actorEntries = this.getActors();
      if (!actorEntries) {
        return;
      }
      // find the first image actor of instance type vtkVolume
      return actorEntries.find(
        (actorEntry) => actorEntry.actor.getClassName() === 'vtkVolume'
      )?.uid;
    }
    return specifier.volumeId;
  }

  public getReferenceId(specifier: ViewReferenceSpecifier = {}): string {
    let { volumeId, sliceIndex: sliceIndex } = specifier;
    if (!volumeId) {
      const actorEntries = this.getActors();
      if (!actorEntries) {
        return;
      }
      // find the first image actor of instance type vtkVolume
      volumeId = actorEntries.find(
        (actorEntry) => actorEntry.actor.getClassName() === 'vtkVolume'
      )?.uid;
    }

    sliceIndex ??= this.getCurrentImageIdIndex();
    const { viewPlaneNormal, focalPoint } = this.getCamera();
    return `volumeId:${volumeId}?sliceIndex=${sliceIndex}&viewPlaneNormal=${viewPlaneNormal.join(
      ','
    )}&focalPoint=${focalPoint.join(',')}`;
  }

  abstract setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: Array<string>,
    immediate?: boolean
  ): void;

  abstract setSlabThickness(
    slabThickness: number,
    filterActorUIDs?: Array<string>
  ): void;

  abstract resetProperties(volumeId?: string): void;
}

export default BaseVolumeViewport;
