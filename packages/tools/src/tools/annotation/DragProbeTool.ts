/* eslint-disable @typescript-eslint/no-empty-function */
import { getEnabledElement } from '@cornerstonejs/core';

import ProbeTool from './ProbeTool';
import { removeAnnotation } from '../../stateManagement/annotation/annotationState';
import { resetElementCursor } from '../../cursors/elementCursor';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import { EventTypes, PublicToolProps, ToolProps } from '../../types';

export default class DragProbeTool extends ProbeTool {
  static toolName = 'DragProbe';

  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    newAnnotation?: boolean;
  } | null;
  eventDispatchDetail: {
    viewportId: string;
    renderingEngineId: string;
  };
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender } = this.editData;

    annotation.highlighted = false;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const { viewportId } = enabledElement;
    this.eventDispatchDetail = {
      viewportId,
      renderingEngineId: renderingEngine.id,
    };

    this._deactivateModify(element);

    resetElementCursor(element);

    this.editData = null;
    this.isDrawing = false;

    // Remove the annotation from the state since it is DragProb and not Probe
    removeAnnotation(annotation.annotationUID, element);
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };
}
