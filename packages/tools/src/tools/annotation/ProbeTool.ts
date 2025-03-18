/* eslint-disable @typescript-eslint/no-empty-function */
import { vec2, vec3 } from 'gl-matrix';

import {
  getEnabledElement,
  VolumeViewport,
  utilities as csUtils,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import { getCalibratedProbeUnitsAndValue } from '../../utilities/getCalibratedUnits';
import {
  drawHandles as drawHandlesSvg,
  drawTextBox as drawTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store/state';
import { ChangeTypes, Events } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import type {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  SVGDrawingHelper,
} from '../../types';
import type { ProbeAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import type { StyleSpecifier } from '../../types/AnnotationStyle';
import { getPixelValueUnits } from '../../utilities/getPixelValueUnits';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';

const { transformWorldToIndex } = csUtils;

/**
 * ProbeTool let you get the underlying voxel value by putting a probe in that
 * location. It will give index of the location and value of the voxel.
 * You can use ProbeTool in all perpendicular views (axial, sagittal, coronal).
 * Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference. Probe tool's text box are dynamically
 * generated based on the viewport's underlying Modality. For instance, if
 * the viewport is displaying CT, the text box will shown the statistics in Hounsfield units,
 * and if the viewport is displaying PET, the text box will show the statistics in
 * SUV units.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * To use the ProbeTool, you first need to add it to cornerstoneTools, then create
 * a toolGroup and add the ProbeTool to it. Finally, setToolActive on the toolGroup
 *
 * ```js
 * cornerstoneTools.addTool(ProbeTool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(ProbeTool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(ProbeTool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.
 *
 */

class ProbeTool extends AnnotationTool {
  static toolName = 'Probe';

  public static probeDefaults = {
    supportedInteractionTypes: ['Mouse', 'Touch'],
    configuration: {
      shadow: true,
      preventHandleOutsideImage: false,
      getTextLines: defaultGetTextLines,
      handleRadius: '6',
    },
  };

  constructor(toolProps: PublicToolProps = {}, defaultToolProps?) {
    super(
      toolProps,
      AnnotationTool.mergeDefaultProps(
        ProbeTool.probeDefaults,
        defaultToolProps
      )
    );
  }

  isPointNearTool(
    element: HTMLDivElement,
    annotation: ProbeAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const point = data.handles.points[0];
    const annotationCanvasCoordinate = viewport.worldToCanvas(point);

    return vec2.distance(canvasCoords, annotationCanvasCoordinate) < proximity;
  }

  toolSelectedCallback() {}

  static hydrate = (
    viewportId: string,
    points: Types.Point3[],
    options?: {
      annotationUID?: string;
      toolInstance?: ProbeTool;
      referencedImageId?: string;
      viewplaneNormal?: Types.Point3;
      viewUp?: Types.Point3;
    }
  ): ProbeAnnotation => {
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement) {
      return;
    }
    const {
      FrameOfReferenceUID,
      referencedImageId,
      viewPlaneNormal,
      viewUp,
      instance,
      viewport,
    } = this.hydrateBase<ProbeTool>(ProbeTool, enabledElement, points, options);

    const annotation = {
      annotationUID: options?.annotationUID || csUtils.uuidv4(),
      data: {
        handles: {
          points,
        },
      },
      highlighted: false,
      autoGenerated: false,
      invalidated: false,
      isLocked: false,
      isVisible: true,
      metadata: {
        toolName: instance.getToolName(),
        viewPlaneNormal,
        FrameOfReferenceUID,
        referencedImageId,
        ...options,
      },
    };
    addAnnotation(annotation, viewport.element);

    triggerAnnotationRenderForViewportIds([viewport.id]);
  };

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Probe Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): ProbeAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this.isDrawing = true;

    const annotation = (<typeof AnnotationTool>(
      this.constructor
    )).createAnnotationForViewport<ProbeAnnotation>(viewport, {
      data: {
        handles: { points: [<Types.Point3>[...worldPos]] },
      },
    });

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      newAnnotation: true,
      viewportIdsToRender,
    };
    this._activateModify(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    return annotation;
  };

  /**
   * It checks if the mouse click is near ProveTool, it overwrites the baseAnnotationTool
   * getHandleNearImagePoint method.
   *
   * @param element - The element that the tool is attached to.
   * @param annotation - The annotation object associated with the annotation
   * @param canvasCoords - The coordinates of the mouse click on canvas
   * @param proximity - The distance from the mouse cursor to the point
   * that is considered "near".
   * @returns The handle that is closest to the cursor, or null if the cursor
   * is not near any of the handles.
   */
  getHandleNearImagePoint(
    element: HTMLDivElement,
    annotation: ProbeAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const point = data.handles.points[0];
    const annotationCanvasCoordinate = viewport.worldToCanvas(point);

    const near =
      vec2.distance(canvasCoords, annotationCanvasCoordinate) < proximity;

    if (near === true) {
      return point;
    }
  }

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: ProbeAnnotation
  ): void {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    // Find viewports to render on drag.

    this.editData = {
      //handle, // This would be useful for other tools with more than one handle
      annotation,
      viewportIdsToRender,
    };
    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    evt.preventDefault();
  }

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;

    const { viewportId, renderingEngine } = getEnabledElement(element);
    this.eventDispatchDetail = {
      viewportId,
      renderingEngineId: renderingEngine.id,
    };

    this._deactivateModify(element);

    resetElementCursor(element);

    if (newAnnotation) {
      this.createMemo(element, annotation, { newAnnotation });
    }

    this.editData = null;
    this.isDrawing = false;
    this.doneEditMemo();

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }
  };

  _dragCallback = (evt) => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
    const { data } = annotation;

    this.createMemo(element, annotation, { newAnnotation });

    data.handles.points[0] = [...worldPos] as Types.Point3;
    annotation.invalidated = true;

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      triggerAnnotationRenderForViewportIds(viewportIdsToRender);

      if (newAnnotation) {
        triggerAnnotationCompleted(annotation);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

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

  /**
   * it is used to draw the probe annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as ProbeAnnotation;
      const annotationUID = annotation.annotationUID;
      const data = annotation.data;
      const point = data.handles.points[0];
      const canvasCoordinates = viewport.worldToCanvas(point);

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      if (!data.cachedStats) {
        data.cachedStats = {};
      }

      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].value === null
      ) {
        data.cachedStats[targetId] = {
          Modality: null,
          index: null,
          value: null,
        };

        this._calculateCachedStats(
          annotation,
          renderingEngine,
          enabledElement,
          ChangeTypes.StatsUpdated
        );
      } else if (annotation.invalidated) {
        this._calculateCachedStats(annotation, renderingEngine, enabledElement);

        // If the invalidated data is as a result of volumeViewport manipulation
        // of the tools, we need to invalidate the related stackViewports data if
        // they are not at the referencedImageId, so that
        // when scrolling to the related slice in which the tool were manipulated
        // we re-render the correct tool position. This is due to stackViewport
        // which doesn't have the full volume at each time, and we are only working
        // on one slice at a time.
        if (viewport instanceof VolumeViewport) {
          const { referencedImageId } = annotation.metadata;

          // invalidate all the relevant stackViewports if they are not
          // at the referencedImageId
          for (const targetId in data.cachedStats) {
            if (targetId.startsWith('imageId')) {
              const viewports = renderingEngine.getStackViewports();

              const invalidatedStack = viewports.find((vp) => {
                // The stack viewport that contains the imageId but is not
                // showing it currently
                const referencedImageURI =
                  csUtils.imageIdToURI(referencedImageId);
                const hasImageURI = vp.hasImageURI(referencedImageURI);
                const currentImageURI = csUtils.imageIdToURI(
                  vp.getCurrentImageId()
                );
                return hasImageURI && currentImageURI !== referencedImageURI;
              });

              if (invalidatedStack) {
                delete data.cachedStats[targetId];
              }
            }
          }
        }
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      const handleGroupUID = '0';

      drawHandlesSvg(
        svgDrawingHelper,
        annotationUID,
        handleGroupUID,
        [canvasCoordinates],
        { color, lineWidth, handleRadius: this.configuration.handleRadius }
      );

      renderStatus = true;

      const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
      if (!options.visibility) {
        continue;
      }

      const textLines = this.configuration.getTextLines(data, targetId);
      if (textLines) {
        const textCanvasCoordinates = [
          canvasCoordinates[0] + 6,
          canvasCoordinates[1] - 6,
        ];

        const textUID = '0';
        drawTextBoxSvg(
          svgDrawingHelper,
          annotationUID,
          textUID,
          textLines,
          [textCanvasCoordinates[0], textCanvasCoordinates[1]],
          options
        );
      }
    }

    return renderStatus;
  };

  _calculateCachedStats(
    annotation,
    renderingEngine,
    enabledElement,
    changeType = ChangeTypes.StatsUpdated
  ) {
    const data = annotation.data;
    const { renderingEngineId, viewport } = enabledElement;
    const { element } = viewport;

    const worldPos = data.handles.points[0];
    const { cachedStats } = data;

    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];

      const pixelUnitsOptions = {
        isPreScaled: isViewportPreScaled(viewport, targetId),
        isSuvScaled: this.isSuvScaled(
          viewport,
          targetId,
          annotation.metadata.referencedImageId
        ),
      };

      const image = this.getTargetImageData(targetId);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { dimensions, imageData, metadata, voxelManager } = image;

      const modality = metadata.Modality;
      let ijk = transformWorldToIndex(imageData, worldPos);

      ijk = vec3.round(ijk, ijk);

      if (csUtils.indexWithinDimensions(ijk, dimensions)) {
        this.isHandleOutsideImage = false;

        let value = voxelManager.getAtIJKPoint(ijk);

        // Index[2] for stackViewport is always 0, but for visualization
        // we reset it to be imageId index
        if (targetId.startsWith('imageId:')) {
          const imageId = targetId.split('imageId:')[1];
          const imageURI = csUtils.imageIdToURI(imageId);
          const viewports = csUtils.getViewportsWithImageURI(imageURI);

          const viewport = viewports[0];

          ijk[2] = viewport.getCurrentImageIdIndex();
        }

        let modalityUnit;

        if (modality === 'US') {
          const calibratedResults = getCalibratedProbeUnitsAndValue(image, [
            ijk,
          ]);

          const hasEnhancedRegionValues = calibratedResults.values.every(
            (value) => value !== null
          );

          value = (
            hasEnhancedRegionValues ? calibratedResults.values : value
          ) as number;
          modalityUnit = hasEnhancedRegionValues
            ? calibratedResults.units
            : 'raw';
        } else {
          modalityUnit = getPixelValueUnits(
            modality,
            annotation.metadata.referencedImageId,
            pixelUnitsOptions
          );
        }

        cachedStats[targetId] = {
          index: ijk,
          value,
          Modality: modality,
          modalityUnit,
        };
      } else {
        this.isHandleOutsideImage = true;
        cachedStats[targetId] = {
          index: ijk,
          Modality: modality,
        };
      }

      annotation.invalidated = false;

      // Dispatching annotation modified
      triggerAnnotationModified(annotation, element, changeType);
    }

    return cachedStats;
  }
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { index, value, modalityUnit } = cachedVolumeStats;

  if (value === undefined || !index) {
    return;
  }

  const textLines = [];

  textLines.push(`(${index[0]}, ${index[1]}, ${index[2]})`);

  if (value instanceof Array && modalityUnit instanceof Array) {
    for (let i = 0; i < value.length; i++) {
      textLines.push(`${csUtils.roundNumber(value[i])} ${modalityUnit[i]}`);
    }
  } else {
    textLines.push(`${csUtils.roundNumber(value)} ${modalityUnit}`);
  }

  return textLines;
}

export default ProbeTool;
