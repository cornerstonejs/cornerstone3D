// Lightweight event recorder for CustomEvents dispatched on a viewport
// element (or any EventTarget). Keeps only shallow-safe detail fields so
// live object graphs (viewports, images, actors) are never retained.

export interface RecordedEvent {
  type: string;
  detail?: unknown;
}

export interface RecordEventsHandle {
  events: RecordedEvent[];
  count(type: string): number;
  types(): string[];
  clear(): void;
  stop(): void;
  waitFor(
    type: string,
    opts?: { timeoutMs?: number; minCount?: number }
  ): Promise<void>;
}

// Interesting, shallow, primitive-or-small-object detail fields worth
// retaining across the various Cornerstone3D CustomEvent detail shapes.
const INTERESTING_DETAIL_KEYS = [
  'viewportId',
  'renderingEngineId',
  'imageId',
  'imageIdIndex',
  'newImageIdIndex',
  'previousImageIdIndex',
  'volumeId',
  'displaySetId',
  'dataId',
  'range',
  'VOILUTFunction',
  'invert',
  'colormap',
  'displayArea',
  'rotation',
];

function extractDetail(detail: unknown): unknown {
  if (!detail || typeof detail !== 'object') {
    return detail;
  }

  const source = detail as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const key of INTERESTING_DETAIL_KEYS) {
    if (key in source) {
      out[key] = source[key];
    }
  }

  return out;
}

export function recordEvents(
  target: EventTarget,
  eventNames: string[]
): RecordEventsHandle {
  const events: RecordedEvent[] = [];

  const listener = (evt: Event) => {
    events.push({
      type: evt.type,
      detail: extractDetail((evt as CustomEvent).detail),
    });
  };

  eventNames.forEach((name) => target.addEventListener(name, listener));

  let stopped = false;

  return {
    events,
    count(type: string): number {
      return events.filter((event) => event.type === type).length;
    },
    types(): string[] {
      return events.map((event) => event.type);
    },
    clear(): void {
      events.length = 0;
    },
    stop(): void {
      if (stopped) {
        return;
      }

      stopped = true;
      eventNames.forEach((name) => target.removeEventListener(name, listener));
    },
    waitFor(
      type: string,
      opts: { timeoutMs?: number; minCount?: number } = {}
    ): Promise<void> {
      const { timeoutMs = 2000, minCount = 1 } = opts;
      const alreadySeen = events.filter((event) => event.type === type).length;

      if (alreadySeen >= minCount) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        let seen = alreadySeen;

        const onEvent = () => {
          seen += 1;

          if (seen >= minCount) {
            clearTimeout(timer);
            target.removeEventListener(type, onEvent);
            resolve();
          }
        };

        const timer = setTimeout(() => {
          target.removeEventListener(type, onEvent);
          reject(
            new Error(
              `recordEvents.waitFor: timed out after ${timeoutMs}ms waiting for "${type}" (minCount=${minCount}, seen=${seen})`
            )
          );
        }, timeoutMs);

        target.addEventListener(type, onEvent);
      });
    },
  };
}
