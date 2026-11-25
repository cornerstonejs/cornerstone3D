/**
 * Hover cursors shared by the click-driven region segmentation tools.
 */

/**
 * Neutral circle cursor for states where segmentability is unknown (no active
 * segmentation yet, probe not run, or a legacy strategy without hover info).
 */
export const CIRCLE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%3E%3Ccircle%20cx='12'%20cy='12'%20r='9'%20fill='none'%20stroke='%2300dc82'%20stroke-width='2'/%3E%3C/svg%3E\") 12 12, crosshair";

/**
 * "You can segment here": circle with a plus — the hover probe found a
 * meaningful region candidate under the pointer.
 */
export const PLUS_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%3E%3Ccircle%20cx='12'%20cy='12'%20r='9'%20fill='none'%20stroke='%2300dc82'%20stroke-width='2'/%3E%3Cpath%20d='M12%208v8M8%2012h8'%20stroke='%2300dc82'%20stroke-width='2'%20stroke-linecap='round'/%3E%3C/svg%3E\") 12 12, copy";

/**
 * "Not a good spot": prohibition sign — the probe found nothing segmentable
 * (flat area, speck of noise, or an unbounded region).
 */
export const BLOCKED_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%3E%3Ccircle%20cx='12'%20cy='12'%20r='9'%20fill='none'%20stroke='%23ff5a5a'%20stroke-width='2'/%3E%3Cpath%20d='M5.7%205.7L18.3%2018.3'%20stroke='%23ff5a5a'%20stroke-width='2'%20stroke-linecap='round'/%3E%3C/svg%3E\") 12 12, not-allowed";

/**
 * "Evaluating": dim gray dashed circle shown while the 3D confirmation is
 * still running (or the spot cannot be evaluated yet). Deliberately NOT green
 * — green is reserved for a confirmed plus, so a pending spot can never be
 * mistaken for a segmentable one.
 */
export const PENDING_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%3E%3Ccircle%20cx='12'%20cy='12'%20r='9'%20fill='none'%20stroke='%23a0a6ad'%20stroke-width='2'%20stroke-dasharray='4%203'/%3E%3C/svg%3E\") 12 12, progress";
