import { state } from '../../store';

/**
 * @function suppressEventForToolInteraction This is used as a generic event handler for tool events
 * on viewports that should be suppressed when the tool in being interacted with.
 *
 * @param evt the event to possibly suppress
 */
export default function suppressEventForToolInteraction(evt) {
  if (state.isInteractingWithTool) {
    // Allow no further siblings or ancestors (on bubble phase) or descendants (on capture phase)
    // to handle this event.
    evt.stopImmediatePropagation();
    evt.preventDefault();
    return false;
  }
}
