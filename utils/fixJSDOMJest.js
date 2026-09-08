import JSDOMEnvironment from 'jest-environment-jsdom';
// Static import: this module is ESM, so `require` is not defined in it. The
// call site below only ever ran on environments that already had TextEncoder,
// which is why the ReferenceError stayed hidden.
import { TextEncoder, TextDecoder } from 'util';

// https://github.com/facebook/jest/blob/v29.4.3/website/versioned_docs/version-29.4/Configuration.md#testenvironment-string
export default class FixJSDOMEnvironment extends JSDOMEnvironment {
  constructor(...args) {
    super(...args);

    // FIXME https://github.com/jsdom/jsdom/issues/3363
    this.global.structuredClone = structuredClone;

    // jsdom doesn't provide TextEncoder/TextDecoder
    if (!this.global.TextEncoder) {
      this.global.TextEncoder = TextEncoder;
      this.global.TextDecoder = TextDecoder;
    }
  }
}
