import { getEnabledElement } from '@cornerstonejs/core';

export function RenderMode({ element }) {
  const { viewport } = getEnabledElement(element);
  const entry = viewport.getDefaultActor();
  const mapper = entry.actorMapper.mapper;

  return <span title={String(mapper)}>{viewport.getRenderPlan()[0].renderMode}</span>;
}
