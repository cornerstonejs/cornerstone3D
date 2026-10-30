/** CSS for the viewport fidelity indicator (.fi-* / .fidelity-indicator). */
export const FIDELITY_INDICATOR_CSS = `/*
 * Icon is 10 × 10. The root grows leftward when the permanent Low Fidelity
 * label is shown. State attributes on .fi-root:
 *   data-state  loading | done | lossy | lod
 *   data-from   the previous state (lossy only animates its change when it comes from loading)
 *   data-shown  false while Done has faded out
 *   data-label  low | transient — permanent clinician label beside the icon
 *
 * Loading / LOD use an HTML disc (compositor-friendly transform). Done / lossy use SVG.
 *
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

.fidelity-indicator {
  display: block;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  overflow: visible;
}

/* Permanent clinician label (FIDELITY-UI-2): bright red on black. */
.fi-label {
  display: none;
  flex-shrink: 0;
  margin-right: 6px;
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

/* Product fidelity tooltip (icon hover). Clinician copy (FIDELITY-UI-5). */
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

/* ---------- HTML layer: loading pulse + solid LOD (compositor-friendly) ---------- */

.fi-html {
  display: none;
  position: relative;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  transform-origin: center;
}

.fi-root[data-state='loading'] .fi-html,
.fi-root[data-state='lod'] .fi-html {
  display: block;
}

.fi-root[data-state='loading'] .fidelity-indicator,
.fi-root[data-state='lod'] .fidelity-indicator {
  display: none;
}

.fi-root[data-state='loading'] .fi-html {
  animation:
    fi-pop-scale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both,
    fi-pop-fade 0.3s linear both;
}

.fi-html-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--fi-amber);
  opacity: 0.3;
}

.fi-html-dot {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fi-amber);
  transform: translateZ(0);
  will-change: transform;
  /* Starts once the pop-in has finished; 6 px until then */
  animation: fi-loading 1.8s linear 0.3s infinite;
}

.fi-root[data-state='lod'] .fi-html-ring {
  opacity: 1;
}

.fi-root[data-state='lod'] .fi-html-dot {
  display: none;
  animation: none;
}

@keyframes fi-pop-scale {
  from {
    transform: scale(0);
  }
  to {
    transform: scale(1);
  }
}

/* Fully opaque by ~0.06 s, while the scale is still growing */
@keyframes fi-pop-fade {
  0% {
    opacity: 0;
  }
  21% {
    opacity: 1;
  }
  100% {
    opacity: 1;
  }
}

/* Loading animation, one 1.8 s cycle: shrinks 6 → ~0.67 px over 0.9 s (ease-in t^2.2), then springs back to 6 px
   over 0.9 s, overshooting to ~6.9 px. Sampled from the spring maths in the full spec. */
@keyframes fi-loading {
  0% { transform: translateZ(0) scale(1); animation-timing-function: cubic-bezier(0.2, 0, 0.57, 0.05); }
  50% { transform: translateZ(0) scale(0.1111); animation-timing-function: linear; }
  51.25% { transform: translateZ(0) scale(0.2561); }
  52.5% { transform: translateZ(0) scale(0.4133); }
  53.75% { transform: translateZ(0) scale(0.569); }
  55% { transform: translateZ(0) scale(0.7133); }
  56.25% { transform: translateZ(0) scale(0.8394); }
  57.5% { transform: translateZ(0) scale(0.9435); }
  58.75% { transform: translateZ(0) scale(1.0244); }
  60% { transform: translateZ(0) scale(1.0826); }
  61.25% { transform: translateZ(0) scale(1.1201); }
  62.5% { transform: translateZ(0) scale(1.1397); }
  63.75% { transform: translateZ(0) scale(1.1447); }
  65% { transform: translateZ(0) scale(1.1386); }
  66.25% { transform: translateZ(0) scale(1.1247); }
  67.5% { transform: translateZ(0) scale(1.1059); }
  68.75% { transform: translateZ(0) scale(1.0848); }
  70% { transform: translateZ(0) scale(1.0636); }
  71.25% { transform: translateZ(0) scale(1.0436); }
  72.5% { transform: translateZ(0) scale(1.026); }
  73.75% { transform: translateZ(0) scale(1.0114); }
  75% { transform: translateZ(0) scale(1); }
  76.25% { transform: translateZ(0) scale(0.9918); }
  77.5% { transform: translateZ(0) scale(0.9865); }
  78.75% { transform: translateZ(0) scale(0.9837); }
  80% { transform: translateZ(0) scale(0.9829); }
  81.25% { transform: translateZ(0) scale(0.9836); }
  82.5% { transform: translateZ(0) scale(0.9854); }
  83.75% { transform: translateZ(0) scale(0.9878); }
  85% { transform: translateZ(0) scale(0.9904); }
  86.25% { transform: translateZ(0) scale(0.9929); }
  87.5% { transform: translateZ(0) scale(0.9952); }
  88.75% { transform: translateZ(0) scale(0.9972); }
  90% { transform: translateZ(0) scale(0.9987); }
  91.25% { transform: translateZ(0) scale(0.9997); }
  92.5% { transform: translateZ(0) scale(1.0004); }
  93.75% { transform: translateZ(0) scale(1.0007); }
  95% { transform: translateZ(0) scale(1.0008); }
  96.25% { transform: translateZ(0) scale(1.0007); }
  97.5% { transform: translateZ(0) scale(1.0005); }
  98.75% { transform: translateZ(0) scale(1.0002); }
  100% { transform: translateZ(0) scale(1); }
}

/* ---------- SVG parts (done / lossy) ---------- */

/* Appear when SVG glyph is injected for done/lossy */
.fi-glyph {
  transform-box: fill-box;
  transform-origin: center;
  animation:
    fi-pop-scale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both,
    fi-pop-fade 0.3s linear both;
}

.fi-disc {
  fill: var(--fi-amber);
  fill-opacity: 0.3;
}

.fi-dot-wrap,
.fi-dot {
  transform-box: fill-box;
  transform-origin: center;
}

.fi-dot {
  fill: var(--fi-amber);
  animation: none;
}

.fi-check,
.fi-dash {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
}

.fi-check {
  stroke: var(--fi-blue);
  stroke-width: 1.5;
}

.fi-dash {
  stroke: var(--fi-amber);
  stroke-width: 2;
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(0.6);
}

/* ---------- Done: single-frame swap to a blue disc (40%) + blue check ---------- */

.fi-root[data-state='done'] .fi-html {
  display: none;
}

.fi-root[data-state='done'] .fi-dot-wrap {
  display: none;
}

.fi-root[data-state='done'] .fi-disc {
  fill: var(--fi-blue);
  fill-opacity: 0.4;
}

.fi-root[data-state='done'] .fi-check {
  opacity: 1;
}

/* Held for DONE_HOLD_MS (attachFidelityIndicator.ts), then fades out over
 * 0.2 s. Does not reappear. */
.fi-root[data-state='done'] {
  transition: opacity 0.2s linear;
}

.fi-root[data-state='done'][data-shown='false'] {
  opacity: 0;
}

/* ---------- As good as it gets (lossy): amber disc (30%) + amber dash. Stays. ---------- */

.fi-root[data-state='lossy'] .fi-html {
  display: none;
}

.fi-root[data-state='lossy'] .fi-dot-wrap {
  transform: scale(0);
}

.fi-root[data-state='lossy'] .fi-dash {
  opacity: 1;
  transform: scale(1);
}

/* From loading, the change takes 0.4 s: the inner fill collapses to the centre (ease-in t^2.2)
   while the disc stays at 30%; the dash fades in over 0.18–0.34 s and grows 60% → 100% over
   0.18–0.4 s, with a slight overshoot. From any other state it simply pops in, already settled. */
.fi-root[data-state='lossy'][data-from='loading'] .fi-dot-wrap {
  transition: transform 0.4s cubic-bezier(0.2, 0, 0.57, 0.05);
}

.fi-root[data-state='lossy'][data-from='loading'] .fi-dash {
  transition:
    opacity 0.16s linear 0.18s,
    transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) 0.18s;
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
