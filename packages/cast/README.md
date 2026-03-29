# @cornerstonejs/cast

Cast hub networking for browser-based viewers: OAuth client-credentials token, HTTP subscribe/unsubscribe, WebSocket receive, and JSON publish. This package contains transport only; application-specific message handling (e.g. OHIF `CastMessageHandler`) stays in the host app to implement FHIRcast or other messaging.

## Example

The **Cast client** example under `examples/castClient` mirrors the Slicer Cast `test-client.html` flow (subscribe, log incoming events, publish) using `CastClient` for all network calls.

From the monorepo root:

```bash
yarn install
yarn workspace @cornerstonejs/cast build:esm
yarn example castClient
```

Then open the dev server URL (default port from `CS3D_PORT` or `3000`). Set **Token endpoint** and **Hub endpoint** to your Cast hub (defaults target `127.0.0.1:2017`). If the hub runs on another origin, ensure CORS allows the example origin.

Optional query parameter: `?topic=your-topic` pre-fills the topic fields.

The full static example index is built with `yarn build-all-examples` (output under `.static-examples/castClient.html`).
