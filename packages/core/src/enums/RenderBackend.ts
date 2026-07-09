/**
 * The rendering backend preference for planar GenericViewports, configured
 * globally at `rendering.planar.renderBackend` or per display set via the
 * `renderBackend` mount option.
 *
 * - `Auto` (default): the backend is resolved from the capability detection
 *   performed at `init()` (WebGL availability, texture-format probes) and the
 *   deprecated `useCPURendering` flag.
 * - `GPU`: pin to GPU rendering.
 * - `CPU`: pin to CPU rendering.
 */
enum RenderBackend {
  Auto = 'auto',
  GPU = 'gpu',
  CPU = 'cpu',
}

/** String-literal form accepted anywhere a {@link RenderBackend} is expected. */
export type RenderBackendValue = `${RenderBackend}`;

export default RenderBackend;
