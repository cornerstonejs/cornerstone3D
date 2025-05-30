import { vec3, mat4 } from 'gl-matrix';
import { Events as EVENTS, MetadataModules } from '../enums';
import type {
  WSIViewportProperties,
  Point3,
  Point2,
  ICamera,
  VOIRange,
  CPUIImageData,
  ViewportInput,
  BoundsIJK,
} from '../types';
import uuidv4 from '../utilities/uuidv4';
import * as metaData from '../metaData';
import { Transform } from './helpers/cpuFallback/rendering/transform';
import Viewport from './Viewport';
import { getOrCreateCanvas } from './helpers';
import { EPSILON } from '../constants';
import triggerEvent from '../utilities/triggerEvent';
import { peerImport } from '../init';
import { pointInShapeCallback } from '../utilities/pointInShapeCallback';
import microscopyViewportCss from '../constants/microscopyViewportCss';
import type { DataSetOptions } from '../types/IViewport';

let WSIUtilFunctions = null;
const _map = Symbol.for('map');
const affineSymbol = Symbol.for('affine');
const EVENT_POSTRENDER = 'postrender';
/**
 * A viewport which shows a microscopy view using the dicom-microscopy-viewer
 * library.  This viewport accepts standard CS3D annotations, and responds
 * similar to how the other types of viewports do for things like zoom/pan.
 *
 * This viewport required the `dicom-microscopy-viewer` import to be available
 * from the peerImport function in the CS3D init configuration.  See the
 * example `initDemo.js` for one possible implementation, but the actual
 * implementation of this will depend on your platform.
 */
class WSIViewport extends Viewport {
  public modality;
  // Viewport Data
  protected imageIds: string[];
  readonly uid;
  readonly renderingEngineId: string;

  private frameOfReferenceUID: string;

  // First is some specific metadata on the current image
  protected metadata;
  // Then the metadata array containing the dicomweb metadata definitions
  protected metadataDicomweb;

  private microscopyElement: HTMLDivElement;

  protected map;

  private internalCamera = {
    rotation: 0,
    centerIndex: [0, 0],
    extent: [0, -2, 1, -1],
    xSpacing: 1,
    ySpacing: 1,
    resolution: 1,
    zoom: 1,
  };

  private viewer;

  /**
   * The VOI Range is used to apply contrast/brightness adjustments to the image.
   */
  private voiRange: VOIRange = {
    lower: 0,
    upper: 255,
  };

  /**
   * feFilter is an inline string value for the CSS filter on the video
   * CSS filters can reference SVG filters, so for the typical use case here
   * the CSS filter is actually an link link to a SVG filter.
   */
  private feFilter: string;

  /**
   * An average white point value, used to color balance the image so that
   * the given white is mapped to [255,255,255] via multiplication per channel.
   */
  private averageWhite: [number, number, number];

  constructor(props: ViewportInput) {
    super({
      ...props,
      canvas: props.canvas || getOrCreateCanvas(props.element),
    });
    this.renderingEngineId = props.renderingEngineId;

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    // Need to set the top level position as relative to make nested items
    // use absolute positioning internally.
    this.element.style.position = 'relative';
    this.microscopyElement = document.createElement('div');
    this.microscopyElement.setAttribute('class', 'DicomMicroscopyViewer');
    this.microscopyElement.id = uuidv4();
    this.microscopyElement.innerText = 'Initial';
    this.microscopyElement.style.background = 'grey';
    this.microscopyElement.style.width = '100%';
    this.microscopyElement.style.height = '100%';
    this.microscopyElement.style.position = 'absolute';
    this.microscopyElement.style.left = '0';
    this.microscopyElement.style.top = '0';
    const cs3dElement = this.element.firstElementChild;
    cs3dElement.insertBefore(this.microscopyElement, cs3dElement.childNodes[1]);

    this.addEventListeners();
    this.addWidget('DicomMicroscopyViewer', {
      getEnabled: () => !!this.viewer,
      setEnabled: () => {
        this.elementDisabledHandler();
      },
    });
    this.resize();
  }

  public static get useCustomRenderingPipeline() {
    return true;
  }

  private addEventListeners() {
    this.canvas.addEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private removeEventListeners() {
    this.canvas.removeEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private elementDisabledHandler() {
    this.removeEventListeners();
    this.viewer?.cleanup();
    this.viewer = null;
    const cs3dElement = this.element.firstElementChild;
    cs3dElement.removeChild(this.microscopyElement);
    this.microscopyElement = null;
  }

  private getImageDataMetadata(imageIndex = 0) {
    const maxImage = this.metadataDicomweb.reduce((maxImage, image) => {
      return maxImage?.NumberOfFrames < image.NumberOfFrames ? image : maxImage;
    });
    const {
      TotalPixelMatrixColumns: columns,
      TotalPixelMatrixRows: rows,
      ImageOrientationSlide,
      ImagedVolumeWidth: width,
      ImagedVolumeHeight: height,
      ImagedVolumeDepth: depth,
    } = maxImage;

    const imagePlaneModule = metaData.get(
      MetadataModules.IMAGE_PLANE,
      this.imageIds[imageIndex]
    );

    let rowCosines = ImageOrientationSlide.slice(0, 3);
    let columnCosines = ImageOrientationSlide.slice(3, 6);

    // if null or undefined
    if (rowCosines == null || columnCosines == null) {
      rowCosines = [1, 0, 0] as Point3;
      columnCosines = [0, 1, 0] as Point3;
    }

    const rowCosineVec = vec3.fromValues(
      rowCosines[0],
      rowCosines[1],
      rowCosines[2]
    );
    const colCosineVec = vec3.fromValues(
      columnCosines[0],
      columnCosines[1],
      columnCosines[2]
    );
    const scanAxisNormal = vec3.create();
    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

    const {
      XOffsetInSlideCoordinateSystem = 0,
      YOffsetInSlideCoordinateSystem = 0,
      ZOffsetInSlideCoordinateSystem = 0,
    } = maxImage.TotalPixelMatrixOriginSequence?.[0] || {};
    const origin = [
      XOffsetInSlideCoordinateSystem,
      YOffsetInSlideCoordinateSystem,
      ZOffsetInSlideCoordinateSystem,
    ];

    const xSpacing = width / columns;
    const ySpacing = height / rows;
    const xVoxels = columns;
    const yVoxels = rows;

    const zSpacing = depth;
    const zVoxels = 1;

    this.hasPixelSpacing = !!(width && height);
    return {
      bitsAllocated: 8,
      numberOfComponents: 3,
      origin,
      direction: [...rowCosineVec, ...colCosineVec, ...scanAxisNormal],
      dimensions: [xVoxels, yVoxels, zVoxels],
      spacing: [xSpacing, ySpacing, zSpacing],
      hasPixelSpacing: this.hasPixelSpacing,
      numVoxels: xVoxels * yVoxels * zVoxels,
      imagePlaneModule,
    };
  }

  // Sets the frame number - note according to DICOM, this is 1 based
  public async setFrameNumber(frame: number) {
    // No-op right now, not sure what this will be
  }

  public setProperties(props: WSIViewportProperties) {
    if (props.voiRange) {
      this.setVOI(props.voiRange);
    }
  }

  public getProperties = (): WSIViewportProperties => {
    return {
      voiRange: { ...this.voiRange },
    };
  };

  /**
   * resetProperties resets the properties of the viewport to the default
   * values.  It is called by the resetViewer command in OHIF which is called when using
   * the reset toolbar button.
   */
  public resetProperties() {
    this.setProperties({
      voiRange: {
        lower: 0,
        upper: 255,
      },
    });
  }

  /**
   * setVOI sets the window level and window width for the image.  This is
   * used to set the contrast and brightness of the image.
   * feFilter is an inline string value for the CSS filter on the openLayers
   * CSS filters can reference SVG filters, so for the typical use case here
   * the CSS filter is actually an link link to a SVG filter.
   * the WSI viewport has two openlayers canvases; one for the main display and one for
   * the map overlay on the bottom left corner.
   */
  public setVOI(voiRange: VOIRange): void {
    this.voiRange = voiRange;
    const feFilter = this.setColorTransform(voiRange, this.averageWhite);
    const olCanvases = this.map
      .getViewport()
      .querySelectorAll('.ol-layers canvas');
    olCanvases.forEach((canvas) => {
      canvas.style.filter = feFilter;
    });
  }

  public setAverageWhite(averageWhite: [number, number, number]) {
    this.averageWhite = averageWhite;
    this.setColorTransform(this.voiRange, averageWhite);
  }

  protected getScalarData() {
    return null;
  }

  public computeTransforms() {
    const indexToWorld = mat4.create();
    const worldToIndex = mat4.create();

    mat4.fromTranslation(indexToWorld, this.metadata.origin);

    indexToWorld[0] = this.metadata.direction[0];
    indexToWorld[1] = this.metadata.direction[1];
    indexToWorld[2] = this.metadata.direction[2];

    indexToWorld[4] = this.metadata.direction[3];
    indexToWorld[5] = this.metadata.direction[4];
    indexToWorld[6] = this.metadata.direction[5];

    indexToWorld[8] = this.metadata.direction[6];
    indexToWorld[9] = this.metadata.direction[7];
    indexToWorld[10] = this.metadata.direction[8];

    mat4.scale(indexToWorld, indexToWorld, this.metadata.spacing);

    mat4.invert(worldToIndex, indexToWorld);
    return { indexToWorld, worldToIndex };
  }

  public getImageData(): CPUIImageData {
    const { metadata } = this;
    if (!metadata) {
      return null;
    }

    const { spacing } = metadata;

    const imageData = {
      getDirection: () => metadata.direction,
      getDimensions: () => metadata.dimensions,
      getRange: () => [0, 255],
      getScalarData: () => this.getScalarData(),
      getSpacing: () => metadata.spacing,
      worldToIndex: (point: Point3) => {
        return this.worldToIndex(point);
      },
      indexToWorld: (point: Point3) => {
        return this.indexToWorld(point);
      },
    };
    const imageDataReturn = {
      dimensions: metadata.dimensions,
      spacing,
      numberOfComponents: 3,
      origin: metadata.origin,
      direction: metadata.direction,
      metadata: {
        Modality: this.modality,
        FrameOfReferenceUID: this.frameOfReferenceUID,
      },

      hasPixelSpacing: this.hasPixelSpacing,
      calibration: this.calibration,
      preScale: {
        scaled: false,
      },
      scalarData: this.getScalarData(),
      imageData,
      // voxelManager is not in wsi.
    };

    // @ts-expect-error we need to fully migrate the voxelManager to the new system
    return imageDataReturn;
  }

  /**
   * Checks to see if the imageURI is currently being displayed.  The imageURI
   * may contain frame numbers according to the DICOM standard format, which
   * will be stripped to compare the base image URI, and then the values used
   * to check if that frame is currently being displayed.
   *
   * The DICOM standard allows for comma separated values as well, however,
   * this is not supported here, with only a single range or single value
   * being tested.
   *
   * For a single value, the time range +/- 5 frames is permitted to allow
   * the detection to actually succeed when nearby without requiring an exact
   * time frame to be matched.
   *
   * @param imageURI - containing frame number or range.
   * @returns
   */
  public hasImageURI(imageURI: string) {
    // TODO - implement this
    return true;
  }

  public setCamera(camera: ICamera): void {
    const previousCamera = this.getCamera();
    const { parallelScale, focalPoint } = camera;
    const view = this.getView();
    const { xSpacing } = this.internalCamera;

    if (parallelScale) {
      const worldToCanvasRatio = this.element.clientHeight / parallelScale;
      const resolution = 1 / xSpacing / worldToCanvasRatio;

      view.setResolution(resolution);
    }

    if (focalPoint) {
      const newCanvas = this.worldToCanvas(focalPoint);
      const newIndex = this.canvasToIndex(newCanvas);
      view.setCenter(newIndex);
    }
    const updatedCamera = this.getCamera();
    this.triggerCameraModifiedEventIfNecessary(previousCamera, updatedCamera);
  }

  /**
   * This function returns the imageID associated with either the current
   * frame being displayed, or the range of frames being played.  This may not
   * correspond to any particular imageId that has imageId metadata, as the
   * format is one of:
   * `<DICOMweb URI>/frames/<Start Frame>(-<End Frame>)?`
   * or
   * `<Other URI>[?&]frameNumber=<Start Frame>(-<EndFrame>)?`
   * for a URL parameter.
   *
   * @returns an imageID for video
   */
  public getCurrentImageId() {
    return this.imageIds[0];
  }

  public getFrameNumber() {
    return 1;
  }

  public getCamera(): ICamera {
    this.refreshRenderValues();
    const { resolution, xSpacing, centerIndex } = this.internalCamera;
    const canvasToWorldRatio = resolution * xSpacing;
    const canvasCenter = this.indexToCanvas([
      centerIndex[0],
      centerIndex[1],
      0,
    ]);
    const focalPoint = this.canvasToWorld(canvasCenter);

    return {
      parallelProjection: true,
      focalPoint,
      position: focalPoint,
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight * canvasToWorldRatio, // Reverse zoom direction back
      viewPlaneNormal: [0, 0, 1],
    };
  }

  public resetCamera = (): boolean => {
    return true;
  };

  /**
   * Gets the number of slices -  this will be the number of focal planes,
   * and not hte actual number of slices in the image sets.
   */
  public getNumberOfSlices = (): number => {
    return 1;
  };

  /**
   * Encapsulate the dicom microscopy fetch so that it can be replaced
   * with the browser import function.  Webpack munges this and then throws
   * exceptions trying to get this working, so this has to be provided externally
   * as a globalThis.browserImportFunction taking the package name, and a set
   * of options defining how to get the value out of the package.
   */
  public static getDicomMicroscopyViewer = async () => {
    return peerImport('dicom-microscopy-viewer');
  };

  /**
   * The FOR for whole slide imaging is the frame of reference in the DICOM
   * metadata, and should be the same for all slices being viewed.
   */
  public getFrameOfReferenceUID = (): string => {
    return this.frameOfReferenceUID;
  };

  public resize = (): void => {
    const canvas = this.canvas;
    const { clientWidth, clientHeight } = canvas;

    // Set the canvas to be same resolution as the client.
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }
    this.refreshRenderValues();
  };

  /**
   * Converts a slide coordinate to a image coordinate using WSI utils functions
   * @param point
   * @returns
   */
  public worldToIndexWSI(point: Point3): Point2 {
    if (!WSIUtilFunctions) {
      return;
    }
    const affine = this.viewer[affineSymbol];
    const pixelCoords = WSIUtilFunctions.applyInverseTransform({
      coordinate: [point[0], point[1]],
      affine,
    });
    return [pixelCoords[0], pixelCoords[1]] as Point2;
  }

  /**
   * Converts a image coordinate to a slide coordinate using WSI utils functions
   * @param point
   * @returns
   */
  public indexToWorldWSI(point: Point2): Point3 {
    if (!WSIUtilFunctions) {
      return;
    }
    const sliceCoords = WSIUtilFunctions.applyTransform({
      coordinate: [point[0], point[1]],
      affine: this.viewer[affineSymbol],
    });
    return [sliceCoords[0], sliceCoords[1], 0] as Point3;
  }

  public worldToIndex(point: Point3): Point3 {
    const { worldToIndex: worldToIndexMatrix } = this.computeTransforms();
    const imageCoord = vec3.create();
    vec3.transformMat4(imageCoord, point, worldToIndexMatrix);
    return imageCoord as Point3;
  }

  public indexToWorld(point: Point3): Point3 {
    const { indexToWorld: indexToWorldMatrix } = this.computeTransforms();
    const worldPos = vec3.create();
    const point3D = vec3.fromValues(...point);
    vec3.transformMat4(worldPos, point3D, indexToWorldMatrix);
    return [worldPos[0], worldPos[1], worldPos[2]] as Point3;
  }

  /**
   * Converts a VideoViewport canvas coordinate to a video coordinate.
   *
   * @param canvasPosition - to convert to world
   * @returns World position
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    if (!this.metadata) {
      return;
    }
    // compute the pixel coordinate in the image
    const indexPoint = this.canvasToIndex(canvasPos);
    indexPoint[1] = -indexPoint[1]; // flip y axis to match canvas coordinates
    return this.indexToWorld(indexPoint);
  };

  /**
   * Converts and [x,y] video coordinate to a Cornerstone3D VideoViewport.
   *
   * @param  worldPos - world coord to convert to canvas
   * @returns Canvas position
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    if (!this.metadata) {
      return;
    }
    const indexPoint = this.worldToIndex(worldPos);
    indexPoint[1] = -indexPoint[1]; // flip y axis to match canvas coordinates

    // pixel to canvas
    const canvasPoint = this.indexToCanvas([indexPoint[0], indexPoint[1], 0]);
    return canvasPoint;
  };

  /**
   * This is a wrapper for setWSI to allow generic behaviour
   */
  public setDataIds(
    imageIds: string[],
    options?: DataSetOptions & {
      miniNavigationOverlay?: boolean;
      webClient: unknown;
    }
  ) {
    if (options?.miniNavigationOverlay !== false) {
      WSIViewport.addMiniNavigationOverlayCss();
    }
    const webClient =
      options?.webClient ||
      metaData.get(MetadataModules.WADO_WEB_CLIENT, imageIds[0]);
    if (!webClient) {
      throw new Error(
        `To use setDataIds on WSI data, you must provide metaData.webClient for ${imageIds[0]}`
      );
    }

    // Returns the Promise from the child element.
    return this.setWSI(imageIds, webClient);
  }

  public async setWSI(imageIds: string[], client) {
    this.microscopyElement.style.background = 'black';
    this.microscopyElement.innerText = 'Loading';
    this.imageIds = imageIds;
    const DicomMicroscopyViewer = await WSIViewport.getDicomMicroscopyViewer();
    WSIUtilFunctions ||= DicomMicroscopyViewer.utils;
    this.frameOfReferenceUID = null;

    const metadataDicomweb = this.imageIds.map((imageId) => {
      const imageMetadata = client.getDICOMwebMetadata(imageId);

      Object.defineProperty(imageMetadata, 'isMultiframe', {
        value: imageMetadata.isMultiframe,
        enumerable: false,
      });
      Object.defineProperty(imageMetadata, 'frameNumber', {
        value: undefined,
        enumerable: false,
      });
      const imageType = imageMetadata['00080008']?.Value;
      if (imageType?.length === 1) {
        imageMetadata['00080008'].Value = imageType[0].split('\\');
      }
      const frameOfReference = imageMetadata['00200052']?.Value?.[0];
      if (!this.frameOfReferenceUID) {
        this.frameOfReferenceUID = frameOfReference;
      } else if (frameOfReference !== this.frameOfReferenceUID) {
        imageMetadata['00200052'].Value = [this.frameOfReferenceUID];
      }

      return imageMetadata;
    });
    const volumeImages = [];
    metadataDicomweb.forEach((m) => {
      const image =
        new DicomMicroscopyViewer.metadata.VLWholeSlideMicroscopyImage({
          metadata: m,
        });
      const imageFlavor = image.ImageType[2];
      if (imageFlavor === 'VOLUME' || imageFlavor === 'THUMBNAIL') {
        volumeImages.push(image);
      } else {
        console.log('Unknown image type', image.ImageType);
      }
    });
    this.metadataDicomweb = volumeImages;

    // Construct viewer instance
    const viewer = new DicomMicroscopyViewer.viewer.VolumeImageViewer({
      client,
      metadata: volumeImages,
      controls: ['overview', 'position'],
      retrieveRendered: false,
      bindings: {},
    });

    // Render viewer instance in the "viewport" HTML element
    viewer.render({ container: this.microscopyElement });

    this.metadata = this.getImageDataMetadata();

    viewer.deactivateDragPanInteraction();
    this.viewer = viewer;
    this.map = viewer[_map];
    this.map.on(EVENT_POSTRENDER, this.postrender);
    this.resize();
    this.microscopyElement.innerText = '';
    Object.assign(this.microscopyElement.style, {
      '--ol-partial-background-color': 'rgba(127, 127, 127, 0.7)',
      '--ol-foreground-color': '#000000',
      '--ol-subtle-foreground-color': '#000',
      '--ol-subtle-background-color': 'rgba(78, 78, 78, 0.5)',
      background: 'none',
    });
  }

  public postrender = () => {
    this.refreshRenderValues();
    triggerEvent(this.element, EVENTS.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      renderingEngineId: this.renderingEngineId,
    });
  };

  /**
   * Scrolls the image - for WSI, this changes the zoom ratio since different
   * images are used to represent different zoom levels, although this also
   * allows fractional zoom levels
   */
  public scroll(delta: number) {
    const camera = this.getCamera();
    this.setCamera({
      parallelScale: camera.parallelScale * (1 + 0.1 * delta),
    });
  }

  public getRotation = () => 0;

  protected canvasToIndex = (canvasPos: Point2): Point3 => {
    const transform = this.getTransform();
    transform.invert();
    const indexPoint = transform.transformPoint(
      canvasPos.map((it) => it * devicePixelRatio) as Point2
    );
    return [indexPoint[0], indexPoint[1], 0] as Point3;
  };

  protected indexToCanvas = (indexPos: Point3): Point2 => {
    const transform = this.getTransform();
    return transform
      .transformPoint([indexPos[0], indexPos[1]])
      .map((it) => it / devicePixelRatio) as Point2;
  };

  /** This can be implemented later when multi-slice WSI is supported */
  public getSliceIndex() {
    return 0;
  }

  /**
   * Gets the internal OpenLayers view object being rendered
   * Note this is not typeds right now, but might add typing later.
   */
  getView() {
    if (!this.viewer) {
      return;
    }
    // TODO - use a native method rather than accessing internals directly
    const map = this.viewer[_map];
    // TODO - remove the globals setter
    const anyWindow = window as unknown as Record<string, unknown>;
    anyWindow.map = map;
    anyWindow.viewer = this.viewer;
    anyWindow.view = map?.getView();
    anyWindow.wsi = this;
    return map?.getView();
  }

  /**
   * Updates the internal camera rendering values from the underlying open layers
   * data.
   */
  private refreshRenderValues() {
    const view = this.getView();
    if (!view) {
      return;
    }
    const resolution = view.getResolution();
    if (!resolution || resolution < EPSILON) {
      return;
    }
    // The location of the center right now
    const centerIndex = view.getCenter();
    const extent = view.getProjection().getExtent();
    const rotation = view.getRotation();
    const zoom = view.getZoom();

    const {
      metadata: {
        spacing: [xSpacing, ySpacing],
      },
    } = this;

    // this means that each unit (pixel) in the world (video) would be
    // represented by n pixels in the canvas.
    const worldToCanvasRatio = 1 / resolution / xSpacing;

    Object.assign(this.internalCamera, {
      extent,
      centerIndex,
      worldToCanvasRatio,
      xSpacing,
      ySpacing,
      resolution,
      rotation,
      zoom,
    });
  }

  public customRenderViewportToCanvas = () => {
    // console.log('TODO - custom render');
  };

  public getZoom() {
    return this.getView()?.getZoom();
  }

  public setZoom(zoom: number) {
    this.getView()?.setZoom(zoom);
  }

  /**
   * Returns the list of image Ids for the viewport.  Currently only
   * returns the first/primary image id.
   * @returns list of strings for image Ids
   */
  public getImageIds = (): Array<string> => {
    return [this.imageIds[0]];
  };

  /**
   * The transform here is from index to canvas points, so this takes
   * into account the scaling applied and the center location, but nothing to do
   * with world coordinate transforms.  Note that the 'index' values are often negative values with respect to the overall
   * image area, as that is what is used internally for the view.
   *
   * @returns A transform from index to canvas points
   */
  protected getTransform() {
    this.refreshRenderValues();
    const { centerIndex: center, resolution, rotation } = this.internalCamera;

    const halfCanvas = [this.canvas.width / 2, this.canvas.height / 2];
    const transform = new Transform();

    // Translate to the center of the canvas (move origin of the transform
    // to the center of the canvas)
    transform.translate(halfCanvas[0], halfCanvas[1]);
    // Difference in sign for x/y to account for screen coordinates
    transform.rotate(rotation);
    transform.scale(1 / resolution, -1 / resolution);
    transform.translate(-center[0], -center[1]);
    return transform;
  }

  public getViewReferenceId(): string {
    return `imageId:${this.getCurrentImageId()}`;
  }

  public getCurrentImageIdIndex() {
    return 0;
  }

  private static overlayCssId = 'overlayCss';

  public static addMiniNavigationOverlayCss() {
    if (document.getElementById(this.overlayCssId)) {
      return;
    }
    const overlayCss = document.createElement('style');
    overlayCss.innerText = microscopyViewportCss;
    overlayCss.setAttribute('id', this.overlayCssId);
    document.getElementsByTagName('head')[0].append(overlayCss);
  }
}

export default WSIViewport;
