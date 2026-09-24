import type { Page } from '@playwright/test';

/**
 * A description of what a simulated pointer gesture must achieve.
 *
 * `simulateDrag` uses this to tell two failures apart that otherwise look the
 * same in a screenshot diff:
 *
 *   - the tool did the work and drew the wrong thing (a product bug), and
 *   - the input never arrived, so the tool drew a half-finished gesture (a
 *     runner problem).
 *
 * The second one is a known failure on the self-hosted runner: a mousemove can
 * be coalesced or dropped, the active handle never leaves the start point, and
 * the length tool records ~0.5mm instead of ~138mm. Before this interface
 * existed, that surfaced as "966 pixels differ", which reads like a rendering
 * regression and is not one.
 *
 * Implement `holds` for any tool that changes observable state, and pass the
 * verifier to `simulateDrag`. Any test with the same problem can do so; the two
 * verifiers below cover the tools this repository drags today.
 */
export interface GestureVerifier {
  /** Named in the error when the gesture does not register. */
  readonly description: string;
  /** Records the state before the gesture, for a verifier that compares. */
  prepare?(page: Page): Promise<void>;
  /**
   * True once the tool has responded to the mousedown. `simulateDrag` waits
   * for this instead of sleeping for a fixed time before the first move.
   */
  hasStarted?(page: Page): Promise<boolean>;
  /** True once the gesture has had its effect. */
  holds(page: Page): Promise<boolean>;
  /** What the page shows now, for the error message. */
  describeActual(page: Page): Promise<string>;
}

/**
 * A length label that belongs to a drag that registered.
 *
 * The dropped-gesture failure produces `0.552 mm`, and a real drag across the
 * viewport produces a value of two or more digits. This pattern separates the
 * two and says nothing about the measurement itself, which the screenshot and
 * `expectAnnotationText` already check.
 */
export const REGISTERED_LENGTH_LABEL = /^\d{2,}(\.\d+)?\s*mm$/;

/**
 * `drawTextBox` is the only place that stamps `data-annotation-uid` on a `<g>`,
 * so this selector finds annotation text boxes and no other SVG primitive. The
 * same selector backs `expectAnnotationText`.
 */
const LABEL_SELECTOR = 'svg.svg-layer g[data-annotation-uid] text';
const ANNOTATION_SELECTOR = 'svg.svg-layer g[data-annotation-uid]';

/** Reads the rendered annotation labels of one viewport. */
export async function getAnnotationLabels(
  page: Page,
  viewportIndex = 0
): Promise<string[]> {
  const texts = await page
    .locator('[data-viewport-uid]')
    .nth(viewportIndex)
    .locator(LABEL_SELECTOR)
    .allTextContents();

  return texts.map((text) => text.trim()).filter(Boolean);
}

/**
 * Passes once an annotation label of the viewport matches.
 *
 * Cornerstone draws the label live while the button is down, so this holds
 * during the gesture and not only after it. That is what lets `simulateDrag`
 * repair a dropped move before it releases the button.
 */
export function annotationLabelMatches(
  expected: string | RegExp,
  viewportIndex = 0
): GestureVerifier {
  const matches = (label: string) =>
    typeof expected === 'string' ? label === expected : expected.test(label);

  return {
    description: `an annotation label matching ${expected} in viewport ${viewportIndex}`,

    async hasStarted(page) {
      return (
        (await page
          .locator('[data-viewport-uid]')
          .nth(viewportIndex)
          .locator(ANNOTATION_SELECTOR)
          .count()) > 0
      );
    },

    async holds(page) {
      return (await getAnnotationLabels(page, viewportIndex)).some(matches);
    },

    async describeActual(page) {
      const labels = await getAnnotationLabels(page, viewportIndex);
      return labels.length
        ? `labels ${JSON.stringify(labels)}`
        : 'no annotation label at all';
    },
  };
}

/**
 * Passes once the VOI (window level) of the viewport differs from the value it
 * had before the gesture.
 *
 * `initDemo` puts `cornerstone` on `window`, so this reads the viewport state
 * rather than the pixels. A window-level drag draws no annotation, so the
 * label verifier above cannot serve it.
 */
export function viewportVoiChanged(viewportIndex = 0): GestureVerifier {
  let before: string | null = null;

  const readVoi = (page: Page) =>
    page.evaluate((index) => {
      type VoiRange = { lower: number; upper: number };
      type EnabledElementLike = {
        viewport?: {
          getProperties?: () => { voiRange?: VoiRange } | undefined;
        };
      };
      // `initDemo` assigns this; the test tsconfig declares no window globals.
      const { cornerstone } = window as unknown as {
        cornerstone?: { getEnabledElements?: () => EnabledElementLike[] };
      };

      const elements = cornerstone?.getEnabledElements?.() ?? [];
      const range = elements[index]?.viewport?.getProperties?.()?.voiRange;
      return range ? `${range.lower},${range.upper}` : null;
    }, viewportIndex);

  return {
    description: `a VOI change in viewport ${viewportIndex}`,

    async prepare(page) {
      before = await readVoi(page);
    },

    async holds(page) {
      const now = await readVoi(page);
      return now !== null && now !== before;
    },

    async describeActual(page) {
      return `VOI ${(await readVoi(page)) ?? 'unavailable'}, and it was ${
        before ?? 'unavailable'
      } before the gesture`;
    },
  };
}
