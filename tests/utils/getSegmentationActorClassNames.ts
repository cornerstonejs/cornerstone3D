import type { Page } from 'playwright';

export async function getSegmentationActorClassNames(
  page: Page,
  segmentationId: string
): Promise<string[]> {
  return page.evaluate((segId) => {
    const cs = (window as any).cornerstone;

    if (!cs) {
      return [];
    }

    const enabledElements = cs.getEnabledElements?.() ?? [];

    if (!enabledElements.length) {
      return [];
    }

    const { viewport } = enabledElements[0];
    const actors = viewport.getActors?.() ?? [];

    return actors
      .filter((actor) =>
        actor.representationUID?.startsWith?.(segId + '-')
      )
      .map((actor) => {
        if (typeof actor.actor?.getClassName === 'function') {
          return actor.actor.getClassName();
        }
        return 'unknown';
      });
  }, segmentationId);
}
