import React, { useEffect } from 'react';
import { Enums, type Types } from '@cornerstonejs/core';

const { ACTORS_CHANGED, STACK_NEW_IMAGE } = Enums.Events;
const NEW_IMAGE = 'local';

export function Listener({ element }: { element: HTMLDivElement }) {
  useEffect(() => {
    const onActors = (evt: Types.EventTypes.ActorsChangedEvent) => evt.detail;

    element.addEventListener(Enums.Events.PRE_STACK_NEW_IMAGE, onPre);
    element.addEventListener(ACTORS_CHANGED, onActors as EventListener);
    element.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', onPre);
    element.addEventListener(STACK_NEW_IMAGE, onPre);
  }, [element]);

  return <span>{NEW_IMAGE}</span>;
}
