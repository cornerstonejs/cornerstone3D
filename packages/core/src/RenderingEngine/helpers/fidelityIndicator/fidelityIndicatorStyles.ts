/** CSS for the viewport fidelity indicator (.fi-*). */
export const FIDELITY_INDICATOR_CSS = `/*
 * Text-only product indicator in the top-right. State attributes on .fi-root:
 *   data-state  loading | done | lossy | lod
 *   data-from   the previous state
 *   data-shown  false while Done has faded out
 *   data-label  low | transient — permanent clinician label
 */

.fi-root {
  --fi-amber: #f0a030;
  --fi-blue: #358cfd;
  display: flex;
  flex-direction: row;
  align-items: center;
  width: auto;
  height: auto;
  overflow: visible;
  line-height: 0;
  pointer-events: auto;
}

/* No state / faded Done: not hoverable (avoids a floating tooltip). */
.fi-root:not([data-state]),
.fi-root[data-state='done'][data-shown='false'] {
  pointer-events: none;
}

/* Permanent clinician label (FIDELITY-UI-2): bright red on black. */
.fi-label {
  display: none;
  flex-shrink: 0;
  padding: 4px 8px;
  font: 600 12px/1.2 system-ui, sans-serif;
  color: #ff2020;
  background: #000;
  white-space: nowrap;
  pointer-events: none;
}

.fi-root[data-label='low'] .fi-label,
.fi-root[data-label='transient'] .fi-label {
  display: block;
}

/* Product fidelity tooltip (label hover). Clinician copy (FIDELITY-UI-5). */
.fi-details {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  margin: 4px 0 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 4px;
  color: #fff;
  font: 12px/1.35 system-ui, sans-serif;
  text-align: left;
  white-space: pre-wrap;
  pointer-events: none;
  z-index: 1;
  max-width: 240px;
}

.fi-root[data-hover='true'] .fi-details {
  display: block;
}

/* Held for DONE_HOLD_MS (attachFidelityIndicator.ts), then fades out over
 * 0.2 s. Does not reappear. With no glyph, done has no visible mark. */
.fi-root[data-state='done'] {
  transition: opacity 0.2s linear;
}

.fi-root[data-state='done'][data-shown='false'] {
  opacity: 0;
}
`;

let injected = false;

/** Injects the fidelity-indicator CSS once into document.head. */
export function ensureFidelityIndicatorStyles(): void {
  if (injected || typeof document === 'undefined') {
    return;
  }
  injected = true;
  const style = document.createElement('style');
  style.setAttribute('data-fidelity-indicator', '');
  style.textContent = FIDELITY_INDICATOR_CSS;
  document.head.appendChild(style);
}
