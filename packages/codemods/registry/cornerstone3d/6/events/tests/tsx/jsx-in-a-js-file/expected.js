import React, { useEffect } from 'react';
import { Enums } from '@cornerstonejs/core';

const { ACTORS_CHANGED, NEW_IMAGE: STACK_NEW_IMAGE } = Enums.Events;
const NEW_IMAGE = 'local';

export function Listener({ element }) {
  useEffect(() => {
    const onActors = (evt) => evt.detail;

    element.addEventListener(Enums.Events.PRE_STACK_NEW_IMAGE, onPre);
    element.addEventListener(ACTORS_CHANGED, onActors);
    element.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', onPre);
    element.addEventListener(STACK_NEW_IMAGE, onPre);
  }, [element]);

  return <span>{NEW_IMAGE}</span>;
}
