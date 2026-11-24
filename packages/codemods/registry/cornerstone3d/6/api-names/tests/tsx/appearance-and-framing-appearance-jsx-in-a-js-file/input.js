import React from 'react';
import { getEnabledElement, utilities } from '@cornerstonejs/core';

export function InvertButton({ element, displaySetId, presentation }) {
  const { viewport } = getEnabledElement(element);

  const toggle = () => {
    if (!utilities.viewportSupportsDisplaySetPresentation(viewport)) {
      return;
    }

    const look = viewport.getDisplaySetPresentation(displaySetId) ?? {};

    viewport.setDisplaySetPresentation(displaySetId, { invert: !look.invert });
    viewport.render();
  };

  return (
    <button onClick={toggle} title={presentation.title}>
      {presentation.label}
    </button>
  );
}
