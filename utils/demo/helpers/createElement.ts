import { utilities } from '@cornerstonejs/core';

export type configElement = {
  merge?: object;
  tag?: string;
  class?: string;
  attr?: Record<string, any>;
  style?: Record<string, any>;
  html?: string;
  event?: Record<string, any>;
  container?: HTMLElement;
};

export default function createElement(config: configElement): HTMLElement {
  config = utilities.deepMerge(config, config.merge);

  const element = document.createElement(config.tag ?? 'div');

  if (config.class) {
    const splitted = config.class.split(' ');
    splitted.forEach((item) => element.classList.add(item));
  }

  if (config.attr) {
    for (const key in config.attr) {
      element[key] = config.attr[key];
    }
  }

  if (config.style) {
    for (const key in config.style) {
      element.style[key] = config.style[key];
    }
  }

  if (config.html) {
    element.innerHTML = config.html;
  }

  if (config.event) {
    for (const key in config.event) {
      element.addEventListener(key, config.event[key]);
    }
  }

  if (config.container) {
    config.container.append(element);
  }

  return element;
}
