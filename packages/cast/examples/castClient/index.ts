import { CastClient } from '../../src';
import {
  setTitleAndDescription,
  createInfoSection,
} from '../../../../utils/demo/helpers';

/** Default actor keyword for subscribe list and publish preset. */
const DEFAULT_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
/** Default subscribe actors field: JSON array of actor keywords. */
const DEFAULT_SUBSCRIBE_ACTORS_JSON = `["${DEFAULT_ACTOR_KEYWORD}","WATCHER"]`;
/** Default actor keyword for Get preset. */
const DEFAULT_GET_ACTOR_KEYWORD = 'HUB';
/** Default Cast subscriber name (Subscribe + Get). */
const DEFAULT_SUBSCRIBER_NAME = 'CS3D-EXAMPLE';

/** Tooltip for Get actor preset OpenIGTLink (option + closed select when selected). */
const OPENIGT_LINK_ACTOR_TOOLTIP =
  'Image Guided Therapy link\nA system that handles navigation and other dataTypes';

/** IHE / DICOM actor presets: value sent is `keyword` only; name/description are tooltips. */
const ACTOR_PRESETS = [
  {
    keyword: 'REPORT_CREATOR',
    name: 'Report Creator',
    description:
      'A system that generates and transmits preliminary, final, or amended diagnostic results (i.e., reports).',
  },
  {
    keyword: 'EC',
    name: 'Evidence Creator',
    description:
      'A system that creates evidence data such as images or measurements, through a process other than data acquisition.',
  },
  {
    keyword: 'ID',
    name: 'Image Display',
    description:
      'A system that presents medical images and associated imaging data.',
  },
  {
    keyword: 'CONTENT_CREATOR',
    name: 'Content Creator',
    description:
      'The Content Creator Actor creates content and transmits to a Content Consumer.',
  },
  {
    keyword: 'WATCHER',
    name: 'Watcher',
    description:
      'Subscribes and receives notifications of events associated with a workitem (such as modification, cancelation or completion).',
  },
  {
    keyword: 'HUB',
    name: 'Hub',
    description:
      'Manages event flows between Subscribers in a session and maintains the current context and transaction of content sharing in each session.',
  },
  {
    keyword: 'WORKLIST_CLIENT',
    name: 'Worklist Client',
    description: 'Providing a reporting worklist to the user.',
  },
  {
    keyword: 'STATELESS_EC',
    name: 'Stateless Evidence Creator',
    description:
      'An Evidence Creator that is not responsible for maintaining its application state when its operations are suspended and resumed.',
  },
] as const;

const HUB_DEFINITIONS = {
  local: {
    hubEndpoint: 'http://127.0.0.1:2017/api/hub',
    authEndpoint: 'http://127.0.0.1:2017/oauth/token',
    product_name: 'CS3D-EXAMPLE',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
  cloud: {
    hubEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/api/hub',
    authEndpoint:
      'https://cast-hub-g6abetanhjesb6cx.westeurope-01.azurewebsites.net/oauth/token',
    product_name: 'CS3D-EXAMPLE',
    client_id: 'client_id_3d_Slicer',
    client_secret: 'client_secret_3d_Slicer',
  },
} as const;

type ConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'token-ready';

type UiElements = {
  tokenEndpoint: HTMLInputElement;
  hubEndpoint: HTMLInputElement;
  hubSelect: HTMLSelectElement;
  subscriberName: HTMLInputElement;
  subscribeActors: HTMLInputElement;
  topic: HTMLInputElement;
  events: HTMLInputElement;
  productName: HTMLInputElement;
  publishTopic: HTMLInputElement;
  publishActorPreset: HTMLSelectElement;
  eventType: HTMLSelectElement;
  eventTypeCustom: HTMLInputElement;
  eventData: HTMLTextAreaElement;
  getEndpoint: HTMLInputElement;
  getSubscriber: HTMLInputElement;
  getTopic: HTMLInputElement;
  getActorPreset: HTMLSelectElement;
  getDataType: HTMLSelectElement;
  conferenceEndpoint: HTMLInputElement;
  subscribeBtn: HTMLButtonElement;
  unsubscribeBtn: HTMLButtonElement;
  publishBtn: HTMLButtonElement;
  getBtn: HTMLButtonElement;
  conferenceBtn: HTMLButtonElement;
  tokenBtn: HTMLButtonElement;
  hubAdminPortalBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  messages: HTMLDivElement;
  statusText: HTMLSpanElement;
  connectionStatus: HTMLDivElement;
  topicDisplay: HTMLInputElement;
  topicUpdateBtn: HTMLButtonElement;
  messageCount: HTMLSpanElement;
  getResults: HTMLDivElement;
};

type DemoState = {
  client: CastClient | null;
  messageCount: number;
  selectedClientId: string;
  selectedClientSecret: string;
  defaultTopic: string;
};

setTitleAndDescription(
  'Cast client API',
  'Demonstrate connecting, messaging and conferencing with the 3D Slicer hub.'
);

const content = document.getElementById('content');
if (!content) {
  throw new Error('Missing #content');
}
const root = content;

injectStyles();
renderUi(root);
renderInstructions(root);

const el = getElements();
const state = createInitialState();

setupActorPresets(el);
setupDefaults(el, state);
setupUiBehavior(el, state);
setupActions(el, state);

window.addEventListener('beforeunload', () => {
  state.client?.destroy();
});

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = [
    `
.cast { max-width: 1100px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.cast .container { background:#3d3d3d; border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,.5); color:#e0e0e0; }
.cast h2 { color:#e0e0e0; margin:0 0 12px; }
.cast .section { margin-top:20px; padding-bottom:16px; border-bottom:1px solid #555; }
.cast .section:last-child { border-bottom:none; }
.cast .grid { display:grid; grid-template-columns: repeat(2, minmax(220px,1fr)); gap:12px; }
.cast .section label,
.cast .cast-hidden-endpoint label { display:block; margin-bottom:6px; color:#b0b0b0; font-size:13px; }
.cast .section input,
.cast .section textarea,
.cast .section select,
.cast .cast-hidden-endpoint input,
.cast .cast-hidden-endpoint select { width:100%; box-sizing:border-box; border:1px solid #666; border-radius:4px; background:#4a4a4a; color:#e0e0e0; padding:9px 10px; font-size:13px; }
.cast .section textarea { min-height:110px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; resize:vertical; }
.cast .section input.subscribe-actors-json { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cast .cast-hidden-endpoint { display:none !important; }
`,
    `
.cast .cast-header { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; margin-bottom:0; }
.cast .header-title { font-size:1.75rem; font-weight:700; color:#e0e0e0; }
.cast .header-center { display:flex; justify-content:center; }
.cast .header-right { display:flex; align-items:center; gap:12px; justify-content:flex-end; }
.cast .header-token-btn { white-space:nowrap; }
.cast .connection-controls { padding:10px 0 16px; border-bottom:1px solid #555; margin-bottom:8px; }
.cast .connection-controls .grid { margin-top:0; }
.cast .auth-topic-pair { display:flex; gap:8px; align-items:flex-end; }
.cast .auth-topic-pair > div { flex:1 1 0; min-width:0; display:flex; flex-direction:column; }
.cast .auth-topic-pair > div > div { display:flex; gap:8px; }
.cast .auth-topic-pair > div > div > input { flex:1 1 0; min-width:0; width:auto; box-sizing:border-box; padding:9px 10px; font-size:13px; border:1px solid #666; border-radius:4px; background:#4a4a4a; color:#e0e0e0; }
.cast .auth-topic-pair button { flex-shrink:0; align-self:flex-end; }
.cast .subscribe-events-topic-actors,
.cast .publish-event-topic-actor-row,
.cast .get-datatype-topic-actor-row { grid-column:1/-1; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-items:start; }
`,
    `
.cast .status { padding:10px 12px; border-radius:4px; margin:12px 0; background:#4a4a4a; border-left:4px solid #777; }
.cast .status.status-header { margin:0; padding:10px 16px; font-size:1.1rem; line-height:1.4; border-left-width:4px; border-radius:6px; white-space:nowrap; }
.cast .status.status-header strong { font-weight:600; }
.cast .connected { border-left-color:#4CAF50; }
.cast .disconnected { border-left-color:#d32f2f; }
.cast .connecting { border-left-color:#ff9800; }
.cast .token-ready { border-left-color:#ff9800; }
.cast .success { border-left-color:#4CAF50; }
.cast .error { border-left-color:#ff9800; background:#5d4037; }
.cast .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
.cast button { padding:9px 14px; border:1px solid #666; border-radius:4px; background:#90A4AE; color:white; cursor:pointer; font-size:13px; }
.cast button:hover:not(:disabled){ background:#78909C; }
.cast button:disabled{ background:#3a3a3a; color:#777; border-color:#555; cursor:not-allowed; }
.cast .messages { margin-top:12px; max-height:380px; overflow:auto; background:#2b2b2b; border-radius:4px; padding:10px; font-size:12px; }
.cast .msg { border-left:3px solid #90A4AE; background:#3d3d3d; border-radius:4px; margin-bottom:8px; padding:8px; white-space:pre-wrap; word-break:break-word; }
.cast .msg.received { border-left-color:#4CAF50; }
.cast .msg.sent { border-left-color:#2196F3; }
.cast .msg.err { border-left-color:#d32f2f; background:#5d4037; }
`,
    `
@media (max-width:600px) {
  .cast .container { padding:12px; }
  .cast .cast-header { grid-template-columns:1fr 1fr; grid-template-rows:auto auto; }
  .cast .header-title { grid-column:1; grid-row:1; }
  .cast .header-right { grid-column:2; grid-row:1; }
  .cast .header-center { grid-column:1/-1; grid-row:2; justify-content:flex-start; }
  .cast .status.status-header { white-space:normal; font-size:0.95rem; }
  .cast .grid { grid-template-columns:1fr; }
  .cast .subscribe-events-topic-actors,
  .cast .publish-event-topic-actor-row,
  .cast .get-datatype-topic-actor-row { grid-template-columns:1fr; }
  .cast .auth-topic-pair { flex-wrap:wrap; }
  .cast .auth-topic-pair > div { flex:1 1 100%; }
}
`,
  ].join('\n');
  document.head.appendChild(style);
}

function renderUi(target: HTMLElement): void {
  target.className = 'cast';
  target.innerHTML = buildPageHtml();
}

function buildPageHtml(): string {
  return `<div class="container">
  ${renderHeaderSection()}
  ${renderAuthenticateSection()}
  ${renderSubscribeSection()}
  ${renderPublishSection()}
  ${renderGetSection()}
  ${renderCollaborateSection()}
  ${renderMessagesSection()}
</div>`;
}

function renderHeaderSection(): string {
  return `<div class="cast-header"><span class="header-title">Cast client</span><div class="header-center"><div id="connectionStatus" class="status status-header disconnected"><strong>Status:</strong> <span id="statusText">Not connected</span></div></div><div class="header-right"><button type="button" id="hubAdminPortalBtn" class="header-token-btn">Hub Admin portal</button></div></div>`;
}

function renderAuthenticateSection(): string {
  return `<div class="connection-controls section">
    <h2>Authenticate</h2>
    <div class="grid">
      <div><label for="hubSelect">Hub</label><select id="hubSelect"><option value="local">3D Slicer local</option><option value="cloud" selected>3D Slicer cloud</option></select></div>
      <div style="grid-column:1/-1"><div class="auth-topic-pair"><button type="button" id="tokenBtn">Authenticate</button><div><label for="topicDisplay">Topic</label><div><input id="topicDisplay" type="text" spellcheck="false" autocomplete="off" /><button type="button" id="topicUpdateBtn">Update</button></div></div></div></div>
    </div>
  </div>
  <span class="cast-hidden-endpoint">
    <div>
      <label for="tokenEndpoint">auth endpoint</label>
      <input id="tokenEndpoint" />
    </div>
  </span>`;
}

function renderSubscribeSection(): string {
  return `<div class="section">
    <h2>Subscribe</h2>
    <div class="grid">
      <div class="cast-hidden-endpoint"><label for="hubEndpoint">hub_endpoint</label><input id="hubEndpoint" /></div>
      <div><label for="subscriberName">Subscriber</label><input id="subscriberName" /></div>
      <div class="subscribe-events-topic-actors">
        <div><label for="events">Events</label><input id="events" value="*" /></div>
        <div><label for="topic">Topic</label><input id="topic" /></div>
        <div><label for="subscribeActors">Actors (JSON array)</label><input id="subscribeActors" class="subscribe-actors-json" type="text" spellcheck="false" value='${DEFAULT_SUBSCRIBE_ACTORS_JSON}' /></div>
      </div>
      <div class="cast-hidden-endpoint" style="grid-column:1/-1"><label for="productName">client_product_name</label><input id="productName" value="CS3D-EXAMPLE" /></div>
    </div>
    <div class="actions">
      <button type="button" id="subscribeBtn" disabled>Subscribe</button>
      <button type="button" id="unsubscribeBtn" disabled>Unsubscribe</button>
    </div>
  </div>`;
}

function renderPublishSection(): string {
  return `<div class="section">
    <h2>Publish</h2>
    <div class="grid">
      <div class="publish-event-topic-actor-row">
        <div>
          <label for="eventType">Event type</label>
          <select id="eventType">
            <option value="imagingstudy-open">imagingstudy-open</option>
            <option value="imagingstudy-close">imagingstudy-close</option>
            <option value="patient-open">patient-open</option>
            <option value="patient-close">patient-close</option>
            <option value="custom">Other (custom)</option>
          </select>
          <input id="eventTypeCustom" placeholder="Custom event type" style="display:none;margin-top:8px" />
        </div>
        <div><label for="publishTopic">Topic</label><input id="publishTopic" /></div>
        <div>
          <label for="publishActorPreset">Actor</label>
          <select id="publishActorPreset"></select>
        </div>
      </div>
    </div>
    <label for="eventData">Event data JSON</label>
    <textarea id="eventData"></textarea>
    <div class="actions">
      <button id="publishBtn" disabled>Publish</button>
    </div>
  </div>`;
}

function renderGetSection(): string {
  return `<div class="section">
    <h2>Get</h2>
    <div class="grid">
      <div class="cast-hidden-endpoint"><label for="getEndpoint">GET endpoint</label><input id="getEndpoint" /></div>
      <div class="cast-hidden-endpoint"><label for="getSubscriber">Subscriber</label><input id="getSubscriber" /></div>
      <div class="get-datatype-topic-actor-row">
        <div><label for="getDataType">DataType</label>
          <select id="getDataType">
            <option value="FHIRcastContext" selected>FHIRcastContext</option>
            <option value="SCENEVIEW">SCENEVIEW</option>
            <option value="TRANSFORM">TRANSFORM</option>
            <option value="POSITION">POSITION</option>
            <option value="CAPIBIL">CAPIBIL</option>
            <option value="STATUS">STATUS</option>
            <option value="TDATA">TDATA</option>
            <option value="IMGMETA">IMGMETA</option>
            <option value="LBMETA">LBMETA</option>
            <option value="POINT">POINT</option>
            <option value="TRAJ">TRAJ</option>
            <option value="NDARRAY">NDARRAY</option>
          </select>
        </div>
        <div><label for="getTopic">Topic</label><input id="getTopic" /></div>
        <div>
          <label for="getActorPreset">Actor</label>
          <select id="getActorPreset"></select>
        </div>
      </div>
    </div>
    <div id="getResults"></div>
    <div class="actions">
      <button id="getBtn" disabled>Get</button>
    </div>
  </div>`;
}

function renderCollaborateSection(): string {
  return `<div class="section">
    <h2>Collaborate</h2>
    <div class="grid">
      <div class="cast-hidden-endpoint"><label for="conferenceEndpoint">Conference endpoint</label><input id="conferenceEndpoint" /></div>
    </div>
    <div class="actions">
      <button id="conferenceBtn" disabled>Open Conference Client</button>
    </div>
  </div>`;
}

function renderMessagesSection(): string {
  return `<div class="section">
    <h2>Messages received <span id="messageCount" style="font-weight:normal;color:#90A4AE">(0)</span></h2>
    <div class="actions"><button id="clearBtn">Clear Messages</button></div>
    <div id="messages" class="messages"></div>
  </div>`;
}

function renderInstructions(target: HTMLElement): void {
  createInfoSection(target, { title: 'Instructions' })
    .addInstruction(
      'Select a Hub (local 3D Slicer or cloud) from the dropdown.'
    )
    .addInstruction('Click Authenticate to obtain a user id and access token.')
    .addInstruction(
      'Click Subscribe to open a WebSocket connection and start receiving events from the hub.'
    )
    .addInstruction('Use Publish to send an event to the hub.')
    .addInstruction(
      'Use Get to fetch context from a FHIRCast hub or other data from cast compliant IHE actors.'
    )
    .addInstruction(
      'Use Collaborate to open a conference client for real-time collaboration.'
    );
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing #${id}`);
  }
  return found as T;
}

function getElements(): UiElements {
  return {
    tokenEndpoint: byId<HTMLInputElement>('tokenEndpoint'),
    hubEndpoint: byId<HTMLInputElement>('hubEndpoint'),
    hubSelect: byId<HTMLSelectElement>('hubSelect'),
    subscriberName: byId<HTMLInputElement>('subscriberName'),
    subscribeActors: byId<HTMLInputElement>('subscribeActors'),
    topic: byId<HTMLInputElement>('topic'),
    events: byId<HTMLInputElement>('events'),
    productName: byId<HTMLInputElement>('productName'),
    publishTopic: byId<HTMLInputElement>('publishTopic'),
    publishActorPreset: byId<HTMLSelectElement>('publishActorPreset'),
    eventType: byId<HTMLSelectElement>('eventType'),
    eventTypeCustom: byId<HTMLInputElement>('eventTypeCustom'),
    eventData: byId<HTMLTextAreaElement>('eventData'),
    getEndpoint: byId<HTMLInputElement>('getEndpoint'),
    getSubscriber: byId<HTMLInputElement>('getSubscriber'),
    getTopic: byId<HTMLInputElement>('getTopic'),
    getActorPreset: byId<HTMLSelectElement>('getActorPreset'),
    getDataType: byId<HTMLSelectElement>('getDataType'),
    conferenceEndpoint: byId<HTMLInputElement>('conferenceEndpoint'),
    subscribeBtn: byId<HTMLButtonElement>('subscribeBtn'),
    unsubscribeBtn: byId<HTMLButtonElement>('unsubscribeBtn'),
    publishBtn: byId<HTMLButtonElement>('publishBtn'),
    getBtn: byId<HTMLButtonElement>('getBtn'),
    conferenceBtn: byId<HTMLButtonElement>('conferenceBtn'),
    tokenBtn: byId<HTMLButtonElement>('tokenBtn'),
    hubAdminPortalBtn: byId<HTMLButtonElement>('hubAdminPortalBtn'),
    clearBtn: byId<HTMLButtonElement>('clearBtn'),
    messages: byId<HTMLDivElement>('messages'),
    statusText: byId<HTMLSpanElement>('statusText'),
    connectionStatus: byId<HTMLDivElement>('connectionStatus'),
    topicDisplay: byId<HTMLInputElement>('topicDisplay'),
    topicUpdateBtn: byId<HTMLButtonElement>('topicUpdateBtn'),
    messageCount: byId<HTMLSpanElement>('messageCount'),
    getResults: byId<HTMLDivElement>('getResults'),
  };
}

function createInitialState(): DemoState {
  return {
    client: null,
    messageCount: 0,
    selectedClientId: '',
    selectedClientSecret: '',
    defaultTopic:
      new URLSearchParams(window.location.search).get('topic') ?? '',
  };
}

function setupActorPresets(elm: UiElements): void {
  fillActorPresetSelect(elm.publishActorPreset);
  fillActorPresetSelect(elm.getActorPreset, {
    value: 'OpenIGTLink',
    label: 'OpenIGTLink',
    title: OPENIGT_LINK_ACTOR_TOOLTIP,
  });
  elm.publishActorPreset.value = DEFAULT_ACTOR_KEYWORD;
  elm.getActorPreset.value = DEFAULT_GET_ACTOR_KEYWORD;
  const sync = () => {
    elm.getActorPreset.title =
      elm.getActorPreset.value === 'OpenIGTLink'
        ? OPENIGT_LINK_ACTOR_TOOLTIP
        : '';
  };
  elm.getActorPreset.addEventListener('change', sync);
  sync();
}

function setupDefaults(elm: UiElements, stateValue: DemoState): void {
  elm.hubSelect.value = 'cloud';
  applyHubPreset(elm, stateValue, 'cloud');
  elm.topic.value = stateValue.defaultTopic;
  elm.publishTopic.value = stateValue.defaultTopic;
  elm.subscriberName.value = DEFAULT_SUBSCRIBER_NAME;
  elm.getSubscriber.value = DEFAULT_SUBSCRIBER_NAME;
  elm.getTopic.value = elm.topic.value.trim();
  elm.eventData.value = `[
  {
    "key": "patient",
    "resource": {
      "resourceType": "Patient",
      "identifier": [{ "value": "NEW_PATIENT_ID" }]
    }
  },
  {
    "key": "study",
    "resource": {
      "resourceType": "ImagingStudy",
      "uid": "urn:oid:2.16.840.1.114362.1.11972228.22789312658.616067305.306.2",
      "status": "available"
    }
  }
]`;
  elm.topicDisplay.value = stateValue.defaultTopic;
  refreshDerivedUrls(elm);
}

function setupUiBehavior(elm: UiElements, stateValue: DemoState): void {
  elm.topic.addEventListener('input', () => {
    const nextTopic = elm.topic.value.trim();
    elm.topicDisplay.value = nextTopic;
    elm.publishTopic.value = nextTopic;
    elm.getTopic.value = nextTopic;
  });

  elm.hubEndpoint.addEventListener('change', () => {
    refreshDerivedUrls(elm);
  });

  elm.hubSelect.addEventListener('change', () => {
    applyHubPreset(
      elm,
      stateValue,
      elm.hubSelect.value as keyof typeof HUB_DEFINITIONS
    );
  });

  elm.eventType.addEventListener('change', () => {
    elm.eventTypeCustom.style.display =
      elm.eventType.value === 'custom' ? 'block' : 'none';
  });

  elm.topicUpdateBtn.addEventListener('click', () => {
    applyHeaderTopicToAll(elm, stateValue);
  });
}

function setupActions(elm: UiElements, stateValue: DemoState): void {
  elm.hubAdminPortalBtn.addEventListener('click', () => {
    openHubAdmin(elm, stateValue);
  });
  elm.tokenBtn.addEventListener('click', async () => {
    await handleToken(elm, stateValue);
  });
  elm.subscribeBtn.addEventListener('click', async () => {
    await handleSubscribe(elm, stateValue);
  });
  elm.unsubscribeBtn.addEventListener('click', async () => {
    await handleUnsubscribe(elm, stateValue);
  });
  elm.publishBtn.addEventListener('click', async () => {
    await handlePublish(elm, stateValue);
  });
  elm.getBtn.addEventListener('click', async () => {
    await handleGet(elm, stateValue);
  });
  elm.conferenceBtn.addEventListener('click', () => {
    openConference(elm);
  });
  elm.clearBtn.addEventListener('click', () => {
    clearMessages(elm, stateValue);
  });
}

function fillActorPresetSelect(
  select: HTMLSelectElement,
  firstOption?: { value: string; label: string; title?: string }
): void {
  select.replaceChildren();
  if (firstOption) {
    const head = document.createElement('option');
    head.value = firstOption.value;
    head.textContent = firstOption.label;
    if (firstOption.title) {
      head.title = firstOption.title;
    }
    select.append(head);
  }
  for (const preset of ACTOR_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.keyword;
    option.textContent = preset.keyword;
    option.title = `${preset.name}\n\n${preset.description}`;
    select.append(option);
  }
}

function applyHubPreset(
  elm: UiElements,
  stateValue: DemoState,
  hubKey: keyof typeof HUB_DEFINITIONS
): void {
  const hubDef = HUB_DEFINITIONS[hubKey];
  elm.hubEndpoint.value = hubDef.hubEndpoint;
  elm.tokenEndpoint.value = hubDef.authEndpoint;
  elm.productName.value = hubDef.product_name;
  stateValue.selectedClientId = hubDef.client_id;
  stateValue.selectedClientSecret = hubDef.client_secret;
  try {
    const hubUrl = new URL(elm.hubEndpoint.value.trim());
    elm.getEndpoint.value = `${hubUrl.origin}/api/hub/cast-get`;
    elm.conferenceEndpoint.value = `${hubUrl.origin}/api/hub/conference-client`;
  } catch {
    // Ignore malformed URL.
  }
}

/** When `hub_endpoint` is edited manually, derive token/cast-get/conference URLs from its origin. Hub dropdown uses `applyHubPreset` only (presets carry full auth URLs). */
function refreshDerivedUrls(elm: UiElements): void {
  try {
    const hub = new URL(elm.hubEndpoint.value.trim());
    elm.tokenEndpoint.value = `${hub.origin}/oauth/token`;
    elm.getEndpoint.value = `${hub.origin}/api/hub/cast-get`;
    elm.conferenceEndpoint.value = `${hub.origin}/api/hub/conference-client`;
  } catch {
    // Keep user-entered values if parse fails.
  }
}

function addMessage(
  elm: UiElements,
  stateValue: DemoState,
  kind: 'received' | 'sent' | 'err',
  label: string,
  payload: unknown
): void {
  const line = document.createElement('div');
  line.className = `msg ${kind}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `${label} - ${ts}\n${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}`;
  elm.messages.insertBefore(line, elm.messages.firstChild);
  stateValue.messageCount += 1;
  elm.messageCount.textContent = `(${stateValue.messageCount})`;
  while (elm.messages.children.length > 60) {
    elm.messages.removeChild(elm.messages.lastChild as ChildNode);
  }
}

function setConnection(
  elm: UiElements,
  status: ConnectionStatus,
  text: string
): void {
  elm.connectionStatus.className = `status status-header ${status}`;
  elm.statusText.textContent = text;
}

function applyHeaderTopicToAll(elm: UiElements, stateValue: DemoState): void {
  const topic = elm.topicDisplay.value.trim();
  elm.topic.value = topic;
  elm.publishTopic.value = topic;
  elm.getTopic.value = topic;
  stateValue.client?.setTopic(topic);
}

function parseEvents(raw: string): string[] {
  const value = raw.trim();
  if (!value) {
    return ['*'];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Values sent as repeated `subscriber.actor` fields (each must be a string). */
function parseSubscribeActorsList(raw: string): string[] {
  const value = raw.trim();
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) =>
          typeof item === 'string' ? item.trim() : JSON.stringify(item)
        )
        .filter(Boolean);
    }
    return [
      typeof parsed === 'string' ? parsed.trim() : JSON.stringify(parsed),
    ].filter(Boolean);
  } catch {
    return value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}

function parseActorField(raw: string): unknown | undefined {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function buildHubConfig(elm: UiElements, stateValue: DemoState) {
  return {
    name: 'demo',
    version: '1',
    hub_endpoint: elm.hubEndpoint.value.trim(),
    token_endpoint: elm.tokenEndpoint.value.trim(),
    client_id: stateValue.selectedClientId || undefined,
    client_secret: stateValue.selectedClientSecret || undefined,
  };
}

function buildSessionConfig(elm: UiElements) {
  const actorsList = parseSubscribeActorsList(elm.subscribeActors.value);
  return {
    subscriberName: elm.subscriberName.value.trim() || undefined,
    actors: actorsList.length ? actorsList : undefined,
    topic: elm.topic.value.trim(),
    events: parseEvents(elm.events.value),
    lease: 7200,
  };
}

function ensureClient(
  elm: UiElements,
  stateValue: DemoState,
  recreate = false
): CastClient {
  if (!stateValue.client || recreate) {
    stateValue.client?.destroy();
    const hub = buildHubConfig(elm, stateValue);
    const session = buildSessionConfig(elm);
    stateValue.client = new CastClient({
      hub,
      session,
      productName: elm.productName.value.trim() || 'CS3D-EXAMPLE',
      callbackUrl: `${window.location.origin}/castCallback`,
      autoReconnect: true,
    });
    stateValue.client.onMessage((message) => {
      addMessage(elm, stateValue, 'received', 'Received', message);
    });
  }
  stateValue.client.setTopic(elm.topic.value.trim());
  return stateValue.client;
}

function openHubAdmin(elm: UiElements, stateValue: DemoState): void {
  const base = elm.hubEndpoint.value.trim();
  if (!base) {
    addMessage(elm, stateValue, 'err', 'Hub Admin', 'hub_endpoint is empty');
    return;
  }
  try {
    // e.g. https://host/api/hub + admin -> https://host/api/hub/admin
    const hubBase = base.endsWith('/') ? base : `${base}/`;
    const url = new URL('admin', hubBase).href;
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    addMessage(elm, stateValue, 'err', 'Hub Admin', 'Invalid hub_endpoint URL');
  }
}

async function handleToken(
  elm: UiElements,
  stateValue: DemoState
): Promise<void> {
  setConnection(elm, 'connecting', 'Getting token');
  try {
    const castClient = ensureClient(elm, stateValue, true);
    const hubPreset =
      HUB_DEFINITIONS[elm.hubSelect.value as keyof typeof HUB_DEFINITIONS];
    const tokenFormData = new URLSearchParams();
    tokenFormData.append(
      'client_id',
      stateValue.selectedClientId || hubPreset.client_id
    );
    tokenFormData.append('grant_type', 'client_credentials');
    tokenFormData.append(
      'client_secret',
      stateValue.selectedClientSecret || hubPreset.client_secret
    );
    const response = await fetch(elm.tokenEndpoint.value.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenFormData,
    });

    let ok = false;
    if (response.ok) {
      const data = await response.json();
      castClient.setToken(data.access_token ?? '');
      const receivedTopic =
        typeof data.topic === 'string' ? data.topic.trim() : '';
      if (receivedTopic) {
        castClient.setTopic(receivedTopic);
        castClient.setSubscriberName(`CS3D-${receivedTopic}`);
      } else if (data.subscriber_name) {
        castClient.setSubscriberName(data.subscriber_name);
      }
      ok = Boolean(castClient.getConnectionState().token);
    }

    elm.subscribeBtn.disabled = !ok;
    if (!ok) {
      setConnection(elm, 'disconnected', 'Token failed');
      addMessage(elm, stateValue, 'err', 'Token error', 'Failed to get token');
      return;
    }

    setConnection(elm, 'token-ready', 'Token ready');
    const session = castClient.getSessionConfig();
    if (session.subscriberName) {
      elm.subscriberName.value = session.subscriberName;
      elm.getSubscriber.value = session.subscriberName;
    }
    if (session.topic) {
      elm.topic.value = session.topic;
      elm.publishTopic.value = session.topic;
      elm.getTopic.value = session.topic;
      elm.topicDisplay.value = session.topic;
    }
    addMessage(elm, stateValue, 'received', 'Token', 'Token obtained');
  } catch (error) {
    elm.subscribeBtn.disabled = true;
    setConnection(elm, 'disconnected', 'Token error');
    addMessage(elm, stateValue, 'err', 'Token exception', String(error));
  }
}

async function handleSubscribe(
  elm: UiElements,
  stateValue: DemoState
): Promise<void> {
  setConnection(elm, 'connecting', 'Subscribing');
  const castClient = ensureClient(elm, stateValue);
  const result = await castClient.subscribe();
  if (result === 202) {
    setConnection(elm, 'connected', 'Websocket connected');
    elm.unsubscribeBtn.disabled = false;
    elm.publishBtn.disabled = false;
    elm.getBtn.disabled = false;
    elm.conferenceBtn.disabled = false;
    addMessage(elm, stateValue, 'sent', 'Subscribe', {
      topic: elm.topic.value.trim(),
    });
    return;
  }
  setConnection(elm, 'disconnected', `Subscribe failed (${String(result)})`);
  addMessage(
    elm,
    stateValue,
    'err',
    'Subscribe error',
    `Subscribe failed (${String(result)})`
  );
}

async function handleUnsubscribe(
  elm: UiElements,
  stateValue: DemoState
): Promise<void> {
  if (!stateValue.client) {
    return;
  }
  await stateValue.client.unsubscribe();
  elm.unsubscribeBtn.disabled = true;
  elm.publishBtn.disabled = true;
  elm.getBtn.disabled = true;
  elm.conferenceBtn.disabled = true;
  elm.subscribeBtn.disabled = false;
  setConnection(elm, 'disconnected', 'Not connected');
  addMessage(elm, stateValue, 'sent', 'Unsubscribe', elm.topic.value.trim());
}

async function handlePublish(
  elm: UiElements,
  stateValue: DemoState
): Promise<void> {
  if (!stateValue.client) {
    addMessage(elm, stateValue, 'err', 'Publish error', 'Subscribe first');
    return;
  }
  const eventType =
    elm.eventType.value === 'custom'
      ? elm.eventTypeCustom.value.trim()
      : elm.eventType.value;
  if (!eventType) {
    addMessage(elm, stateValue, 'err', 'Publish error', 'Event type required');
    return;
  }

  let context: unknown;
  try {
    context = JSON.parse(elm.eventData.value || '[]');
  } catch {
    addMessage(
      elm,
      stateValue,
      'err',
      'Publish error',
      'Invalid Event Data JSON'
    );
    return;
  }

  const payload: Record<string, unknown> = {
    event: {
      'hub.topic': elm.publishTopic.value.trim(),
      'hub.event': eventType,
      context,
    },
  };
  const actorValue = parseActorField(elm.publishActorPreset.value.trim());
  if (actorValue !== undefined) {
    payload.actor = actorValue;
  }
  const res = await stateValue.client.publish(payload);
  if (res?.ok) {
    addMessage(elm, stateValue, 'sent', 'Publish', payload);
    return;
  }
  addMessage(
    elm,
    stateValue,
    'err',
    'Publish error',
    res ? `HTTP ${res.status}` : 'No response'
  );
}

async function handleGet(
  elm: UiElements,
  stateValue: DemoState
): Promise<void> {
  const subscriber = elm.getSubscriber.value.trim();
  if (!subscriber) {
    addMessage(elm, stateValue, 'err', 'Get error', 'Subscriber is required');
    return;
  }
  const endpoint = elm.getEndpoint.value.trim();
  const dataType = elm.getDataType.value;
  const url = new URL(endpoint);
  url.searchParams.set('subscriber', subscriber);
  const getTopic = elm.getTopic.value.trim();
  if (getTopic) {
    url.searchParams.set('topic', getTopic);
  }
  if (dataType) {
    url.searchParams.set('dataType', dataType);
  }
  const getActorRaw = elm.getActorPreset.value.trim();
  if (getActorRaw) {
    url.searchParams.set('actor', getActorRaw);
  }

  const response = await fetch(url.toString(), { method: 'GET' });
  if (response.ok) {
    const json = await response.json();
    elm.getResults.innerHTML = `<div class="status success"><pre>${JSON.stringify(json, null, 2)}</pre></div>`;
    addMessage(elm, stateValue, 'received', 'Get', json);
    return;
  }
  const text = await response.text();
  elm.getResults.innerHTML = '';
  addMessage(elm, stateValue, 'err', 'Get error', `${response.status} ${text}`);
}

function openConference(elm: UiElements): void {
  const url = new URL(elm.conferenceEndpoint.value.trim());
  url.searchParams.set('subscriberName', elm.subscriberName.value.trim());
  url.searchParams.set('topic', elm.topic.value.trim());
  window.open(url.toString(), '_blank');
}

function clearMessages(elm: UiElements, stateValue: DemoState): void {
  elm.messages.innerHTML = '';
  stateValue.messageCount = 0;
  elm.messageCount.textContent = '(0)';
}
