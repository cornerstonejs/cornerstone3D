import {
  utilities,
  getEnabledElement,
  VolumeViewport,
  StackViewport,
  cache,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { vec4 } from 'gl-matrix';

import BaseTool from './BaseTool';
import { getAnnotationManager } from '../../stateManagement/annotation/annotationState';
import { Annotation, Annotations, SVGDrawingHelper } from '../../types';
import triggerAnnotationRender from '../../utilities/triggerAnnotationRender';
import filterAnnotationsForDisplay from '../../utilities/planar/filterAnnotationsForDisplay';
import { getStyleProperty } from '../../stateManagement/annotation/config/helpers';
import { getState } from '../../stateManagement/annotation/config';
import { StyleSpecifier } from '../../types/AnnotationStyle';

/**
 * Abstract class for tools which create and display annotations on the
 * cornerstone3D canvas. In addition, it provides a base class for segmentation
 * tools that require drawing an annotation before running the segmentation strategy
 * for instance threshold segmentation based on an area and a threshold.
 * Annotation tools make use of drawing utilities to draw SVG elements on the viewport.
 *
 * To create a new annotation tool, derive from this class and implement the
 * abstract methods.
 */
abstract class AnnotationDisplayTool extends BaseTool {
  static toolName;
  // ===================================================================
  // Abstract Methods - Must be implemented.
  // ===================================================================

  /**
   * @abstract renderAnnotation it used to draw the tool's annotation in each
   * request animation frame
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  abstract renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  );

  /**
   * @virtual Given the element and annotations which is an array of annotation, it
   * filters the annotations array to only include the annotation based on the viewportType.
   * If the viewport is StackViewport, it filters based on the current imageId of the viewport,
   * if the viewport is volumeViewport, it only returns those that are within the
   * same slice as the current rendered slice in the volume viewport.
   * imageId as the enabledElement.
   * @param element - The HTML element
   * @param annotations - The annotations to filter (array of annotation)
   * @returns The filtered annotations
   */
  filterInteractableAnnotationsForElement(
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations | undefined {
    if (!annotations || !annotations.length) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    return filterAnnotationsForDisplay(viewport, annotations);
  }

  /**
   * On Image Calibration, take all the annotation from the AnnotationState manager,
   * and invalidate them to force them to be re-rendered and their stats to be recalculated.
   * Then use the old and new imageData (non-calibrated and calibrated) to calculate the
   * new position for the annotations in the space of the new imageData.
   *
   * @param evt - The calibration event
   *
   */
  public onImageSpacingCalibrated = (
    evt: Types.EventTypes.ImageSpacingCalibratedEvent
  ) => {
    const {
      element,
      rowScale,
      columnScale,
      imageId,
      imageData: calibratedImageData,
      worldToIndex: noneCalibratedWorldToIndex,
    } = evt.detail;

    const { viewport } = getEnabledElement(element);

    if (viewport instanceof VolumeViewport) {
      throw new Error('Cannot calibrate a volume viewport');
    }

    const calibratedIndexToWorld = calibratedImageData.getIndexToWorld();

    const imageURI = utilities.imageIdToURI(imageId);
    const stateManager = getAnnotationManager();
    const framesOfReference = stateManager.getFramesOfReference();

    // For each frame Of Reference
    framesOfReference.forEach((frameOfReference) => {
      const frameOfReferenceSpecificAnnotations =
        stateManager.getAnnotations(frameOfReference);

      const toolSpecificAnnotations =
        frameOfReferenceSpecificAnnotations[this.getToolName()];

      if (!toolSpecificAnnotations || !toolSpecificAnnotations.length) {
        return;
      }

      // for this specific tool
      toolSpecificAnnotations.forEach((annotation) => {
        // if the annotation is drawn on the same imageId
        const referencedImageURI = utilities.imageIdToURI(
          annotation.metadata.referencedImageId
        );

        if (referencedImageURI === imageURI) {
          // make them invalid since the image has been calibrated so that
          // we can update the cachedStats and also rendering
          annotation.invalidated = true;
          annotation.data.cachedStats = {};

          // Update annotation points to the new calibrated points. Basically,
          // using the worldToIndex function we get the index on the non-calibrated
          // image and then using the calibratedIndexToWorld function we get the
          // corresponding point on the calibrated image world.
          annotation.data.handles.points = annotation.data.handles.points.map(
            (point) => {
              const p = vec4.fromValues(...(point as Types.Point3), 1);
              const pCalibrated = vec4.fromValues(0, 0, 0, 1);
              const nonCalibratedIndexVec4 = vec4.create();
              vec4.transformMat4(
                nonCalibratedIndexVec4,
                p,
                noneCalibratedWorldToIndex
              );
              const calibratedIndex = [
                columnScale * nonCalibratedIndexVec4[0],
                rowScale * nonCalibratedIndexVec4[1],
                nonCalibratedIndexVec4[2],
              ];

              vec4.transformMat4(
                pCalibrated,
                vec4.fromValues(
                  calibratedIndex[0],
                  calibratedIndex[1],
                  calibratedIndex[2],
                  1
                ),
                calibratedIndexToWorld
              );

              return pCalibrated.slice(0, 3) as Types.Point3;
            }
          );
        }
      });

      triggerAnnotationRender(element);
    });
  };

  protected getReferencedImageId(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    worldPos: Types.Point3,
    viewPlaneNormal: Types.Point3,
    viewUp: Types.Point3
  ): string {
    const targetId = this.getTargetId(viewport);

    let referencedImageId;

    if (viewport instanceof StackViewport) {
      referencedImageId = targetId.split('imageId:')[1];
    } else {
      const volumeId = targetId.split('volumeId:')[1];
      const imageVolume = cache.getVolume(volumeId);

      referencedImageId = utilities.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal,
        viewUp
      );
    }

    return referencedImageId;
  }

  /**
   * It takes the property (color, lineDash, etc.) and based on the state of the
   * annotation (selected, highlighted etc.) it returns the appropriate value
   * based on the central toolStyle settings for each level of specification.
   * @param property - The name of the style property to get.
   * @param styleSpecifier - An object containing the specifications such as viewportId,
   * toolGroupId, toolName and annotationUID which are used to get the style if the level of specificity is
   * met (hierarchy is checked from most specific to least specific which is
   * annotationLevel -> viewportLevel -> toolGroupLevel -> default.
   * @param annotation - The annotation for the tool that is
   * currently active.
   * @returns The value of the property.
   */
  public getStyle(
    property: string,
    specifications: StyleSpecifier,
    annotation?: Annotation
  ): unknown {
    return getStyleProperty(
      property,
      specifications,
      getState(annotation),
      this.mode
    );
  }
}

AnnotationDisplayTool.toolName = 'AnnotationDisplayTool';
export default AnnotationDisplayTool;
