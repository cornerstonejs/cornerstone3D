import { state } from '../../store/state';
import { getToolGroupForViewport } from '../../store/ToolGroupManager';
import type { EventTypes } from '../../types';

/**
 * Releases a one-finger tool gesture that a second finger has reclassified
 * into a viewport manipulation (pinch zoom, multi-finger scroll).
 *
 * The tool that owns the draw loop has set `state.isInteractingWithTool` in
 * its `_activateDraw`/`_activateModify`, and every touch dispatcher returns
 * early while that flag is set. The gesture therefore never re-resolves
 * against the new finger count, which is why pan/zoom appears dead as soon as
 * an annotation tool is active - the binding for two fingers is correct, the
 * event just never reaches it.
 *
 * Rather than teaching each of the ~29 tools that set the flag to detect the
 * extra finger, the loop is released centrally through
 * `AnnotationTool.cancel()`. That method is abstract, so every annotation tool
 * implements it (it is what the Escape key already uses), and it no-ops unless
 * the tool is mid-draw - so calling it across the tool group is safe and needs
 * no bookkeeping about which tool is currently interacting.
 *
 * Tools that implement their own semantics for extra touch points declare
 * {@link BaseTool.handlesMultiTouchGestures} and are never cancelled: the
 * multi-part contour tools must keep the points already placed. For those the
 * interaction guard is bypassed instead, so the manipulation tool still
 * receives the gesture while the drawing tool keeps its in-progress state and
 * ignores the extra finger on its own.
 *
 * Note this deliberately reuses cancel() semantics rather than inventing new
 * ones: a tool that commits a new annotation on Escape also commits it here.
 *
 * @param evt - The normalized touch drag event.
 * @returns true when the caller should dispatch this event even though
 * `state.isInteractingWithTool` is set.
 */
export default function releaseToolForMultiTouchGesture(
  evt: EventTypes.TouchDragEventType
): boolean {
  if (!state.isInteractingWithTool) {
    return false;
  }

  // Single-finger drags are the normal tool path and must not be disturbed.
  if (!(evt.detail.currentPointsList?.length > 1)) {
    return false;
  }

  const { renderingEngineId, viewportId, element } = evt.detail;
  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);

  if (!toolGroup) {
    return false;
  }

  let bypassInteractionGuard = false;

  for (const toolName of Object.keys(toolGroup.toolOptions)) {
    const tool = toolGroup.getToolInstance(toolName);

    if (!tool) {
      continue;
    }

    if (tool.handlesMultiTouchGestures) {
      // Only the tool actually mid-interaction may unblock the dispatcher;
      // otherwise merely having a contour tool in the group would bypass the
      // guard for every other tool's gestures.
      if (tool.isDrawing) {
        bypassInteractionGuard = true;
      }
      continue;
    }

    // Safe unconditionally: cancel() returns immediately unless mid-draw.
    tool.cancel?.(element);
  }

  return bypassInteractionGuard;
}
