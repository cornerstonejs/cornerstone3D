import { CastClient } from '../../src';
import {
  setTitleAndDescription,
  createInfoSection,
} from '../../../../utils/demo/helpers';

setTitleAndDescription(
  'Cast client API',
  'Demonstrate connecting, messaging and conferencing with the 3D Slicer hub.'
);

/** Default actor keyword for subscribe list and publish preset. */
const DEFAULT_ACTOR_KEYWORD = 'WORKLIST_CLIENT';
/** Default subscribe actors field: JSON array of actor keywords. */
const DEFAULT_SUBSCRIBE_ACTORS_JSON = `["${DEFAULT_ACTOR_KEYWORD}","WATCHER"]`;
/** Default actor keyword for Get preset. */
const DEFAULT_GET_ACTOR_KEYWORD = 'HUB';
/** Default Cast subscriber name (Subscribe + Get). */
const DEFAULT_SUBSCRIBER_NAME = 'CS3D-EXAMPLE';

const content = document.getElementById('content');
if (!content) throw new Error('Missing #content');

const root = content;

const css = `
.cast { max-width: 1100px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.cast .container { background:#3d3d3d; border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,.5); color:#e0e0e0; }
.cast .cast-header { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; margin-bottom:0; }
.cast .header-title { font-size:1.75rem; font-weight:700; color:#e0e0e0; }
.cast .header-center { display:flex; justify-content:center; }
.cast .header-right { display:flex; align-items:center; gap:12px; justify-content:flex-end; }
.cast .status.status-header { margin:0; padding:10px 16px; font-size:1.1rem; line-height:1.4; border-left-width:4px; border-radius:6px; white-space:nowrap; }
.cast .status.status-header strong { font-weight:600; }
.cast .connection-controls { padding:10px 0 16px; border-bottom:1px solid #555; margin-bottom:8px; }
.cast .connection-controls .grid { margin-top:0; }
.cast .auth-topic-pair { display:flex; gap:8px; align-items:flex-end; }
.cast .auth-topic-pair > div { flex:1 1 0; min-width:0; display:flex; flex-direction:column; }
.cast .auth-topic-pair > div > div { display:flex; gap:8px; }
.cast .auth-topic-pair > div > div > input { flex:1 1 0; min-width:0; width:auto; box-sizing:border-box; padding:9px 10px; font-size:13px; border:1px solid #666; border-radius:4px; background:#4a4a4a; color:#e0e0e0; }
.cast .auth-topic-pair button { flex-shrink:0; align-self:flex-end; }
.cast .header-token-btn { white-space:nowrap; }
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
.cast .status { padding:10px 12px; border-radius:4px; margin:12px 0; background:#4a4a4a; border-left:4px solid #777; }
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
.cast .subscribe-events-topic-actors,
.cast .publish-event-topic-actor-row,
.cast .get-datatype-topic-actor-row { grid-column:1/-1; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-items:start; }
.cast .cast-hidden-endpoint { display:none !important; }
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
`;

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

root.className = 'cast';
root.innerHTML = `
<div class="container">
  <div class="cast-header"><span class="header-title">Cast client</span><div class="header-center"><div id="connectionStatus" class="status status-header disconnected"><strong>Status:</strong> <span id="statusText">Not connected</span></div></div><div class="header-right"><button type="button" id="hubAdminPortalBtn" class="header-token-btn">Hub Admin portal</button></div></div>
  <div class="connection-controls section">
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
  </span>

  <div class="section">
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
  </div>

  <div class="section">
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
  </div>

  <div class="section">
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
  </div>

  <div class="section">
    <h2>Collaborate</h2>
    <div class="grid">
      <div class="cast-hidden-endpoint"><label for="conferenceEndpoint">Conference endpoint</label><input id="conferenceEndpoint" /></div>
    </div>
    <div class="actions">
      <button id="conferenceBtn" disabled>Open Conference Client</button>
    </div>
  </div>

  <div class="section">
    <h2>Messages received <span id="messageCount" style="font-weight:normal;color:#90A4AE">(0)</span></h2>
    <div class="actions"><button id="clearBtn">Clear Messages</button></div>
    <div id="messages" class="messages"></div>
  </div>
</div>`;

createInfoSection(root, { title: 'Instructions' })
  .addInstruction('Select a Hub (local 3D Slicer or cloud) from the dropdown.')
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

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const tokenEndpointEl = byId<HTMLInputElement>('tokenEndpoint');
const hubEndpointEl = byId<HTMLInputElement>('hubEndpoint');
const hubSelectEl = byId<HTMLSelectElement>('hubSelect');
const subscriberNameEl = byId<HTMLInputElement>('subscriberName');
const subscribeActorsEl = byId<HTMLInputElement>('subscribeActors');
const topicEl = byId<HTMLInputElement>('topic');
const eventsEl = byId<HTMLInputElement>('events');
const productNameEl = byId<HTMLInputElement>('productName');
const publishTopicEl = byId<HTMLInputElement>('publishTopic');
const publishActorPresetEl = byId<HTMLSelectElement>('publishActorPreset');
const eventTypeEl = byId<HTMLSelectElement>('eventType');
const eventTypeCustomEl = byId<HTMLInputElement>('eventTypeCustom');
const eventDataEl = byId<HTMLTextAreaElement>('eventData');
const getEndpointEl = byId<HTMLInputElement>('getEndpoint');
const getSubscriberEl = byId<HTMLInputElement>('getSubscriber');
const getTopicEl = byId<HTMLInputElement>('getTopic');
const getActorPresetEl = byId<HTMLSelectElement>('getActorPreset');
const getDataTypeEl = byId<HTMLSelectElement>('getDataType');
const conferenceEndpointEl = byId<HTMLInputElement>('conferenceEndpoint');
const subscribeBtnEl = byId<HTMLButtonElement>('subscribeBtn');
const unsubscribeBtnEl = byId<HTMLButtonElement>('unsubscribeBtn');
const publishBtnEl = byId<HTMLButtonElement>('publishBtn');
const getBtnEl = byId<HTMLButtonElement>('getBtn');
const conferenceBtnEl = byId<HTMLButtonElement>('conferenceBtn');
const tokenBtnEl = byId<HTMLButtonElement>('tokenBtn');
const hubAdminPortalBtnEl = byId<HTMLButtonElement>('hubAdminPortalBtn');
const clearBtnEl = byId<HTMLButtonElement>('clearBtn');
const messagesEl = byId<HTMLDivElement>('messages');
const statusTextEl = byId<HTMLSpanElement>('statusText');
const connectionStatusEl = byId<HTMLDivElement>('connectionStatus');
const topicDisplayEl = byId<HTMLInputElement>('topicDisplay');
const topicUpdateBtnEl = byId<HTMLButtonElement>('topicUpdateBtn');
const messageCountEl = byId<HTMLSpanElement>('messageCount');

const defaultTopic =
  new URLSearchParams(window.location.search).get('topic') ?? '';

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
  for (const p of ACTOR_PRESETS) {
    const o = document.createElement('option');
    o.value = p.keyword;
    o.textContent = p.keyword;
    o.title = `${p.name}\n\n${p.description}`;
    select.append(o);
  }
}

fillActorPresetSelect(publishActorPresetEl);
fillActorPresetSelect(getActorPresetEl, {
  value: 'OpenIGTLink',
  label: 'OpenIGTLink',
  title: OPENIGT_LINK_ACTOR_TOOLTIP,
});
publishActorPresetEl.value = DEFAULT_ACTOR_KEYWORD;
getActorPresetEl.value = DEFAULT_GET_ACTOR_KEYWORD;

function syncGetActorSelectTooltip() {
  getActorPresetEl.title =
    getActorPresetEl.value === 'OpenIGTLink' ? OPENIGT_LINK_ACTOR_TOOLTIP : '';
}

getActorPresetEl.addEventListener('change', syncGetActorSelectTooltip);
syncGetActorSelectTooltip();

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
let selectedClientId = '';
let selectedClientSecret = '';

function applyHubPreset(hubKey: keyof typeof HUB_DEFINITIONS): void {
  const hubDef = HUB_DEFINITIONS[hubKey];
  hubEndpointEl.value = hubDef.hubEndpoint;
  tokenEndpointEl.value = hubDef.authEndpoint;
  productNameEl.value = hubDef.product_name;
  selectedClientId = hubDef.client_id;
  selectedClientSecret = hubDef.client_secret;
  try {
    const hubUrl = new URL(hubEndpointEl.value.trim());
    getEndpointEl.value = `${hubUrl.origin}/api/hub/cast-get`;
    conferenceEndpointEl.value = `${hubUrl.origin}/api/hub/conference-client`;
  } catch {
    // Ignore malformed URL.
  }
}

hubSelectEl.value = 'cloud';
applyHubPreset('cloud');
topicEl.value = defaultTopic;
publishTopicEl.value = defaultTopic;
subscriberNameEl.value = DEFAULT_SUBSCRIBER_NAME;
getSubscriberEl.value = DEFAULT_SUBSCRIBER_NAME;
getTopicEl.value = topicEl.value.trim();
eventDataEl.value = `[
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
topicDisplayEl.value = defaultTopic;

/** When `hub_endpoint` is edited manually, derive token/cast-get/conference URLs from its origin. Hub dropdown uses `applyHubPreset` only (presets carry full auth URLs). */
function refreshDerivedUrls(): void {
  try {
    const hub = new URL(hubEndpointEl.value.trim());
    tokenEndpointEl.value = `${hub.origin}/oauth/token`;
    getEndpointEl.value = `${hub.origin}/api/hub/cast-get`;
    conferenceEndpointEl.value = `${hub.origin}/api/hub/conference-client`;
  } catch {
    // Keep user-entered values if parse fails.
  }
}
refreshDerivedUrls();

topicEl.addEventListener('input', () => {
  const t = topicEl.value.trim();
  topicDisplayEl.value = t;
  publishTopicEl.value = t;
  getTopicEl.value = t;
});

hubEndpointEl.addEventListener('change', refreshDerivedUrls);
hubSelectEl.addEventListener('change', () => {
  applyHubPreset(hubSelectEl.value as keyof typeof HUB_DEFINITIONS);
});

eventTypeEl.addEventListener('change', () => {
  eventTypeCustomEl.style.display =
    eventTypeEl.value === 'custom' ? 'block' : 'none';
});

let messageCount = 0;
function addMessage(
  kind: 'received' | 'sent' | 'err',
  label: string,
  payload: unknown
): void {
  const line = document.createElement('div');
  line.className = `msg ${kind}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `${label} - ${ts}\n${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}`;
  messagesEl.insertBefore(line, messagesEl.firstChild);
  messageCount += 1;
  messageCountEl.textContent = `(${messageCount})`;
  while (messagesEl.children.length > 60) {
    messagesEl.removeChild(messagesEl.lastChild as ChildNode);
  }
}

function setConnection(
  status: 'connected' | 'disconnected' | 'connecting' | 'token-ready',
  text: string
): void {
  connectionStatusEl.className = `status status-header ${status}`;
  statusTextEl.textContent = text;
}

let client: CastClient | null = null;

function applyHeaderTopicToAll(): void {
  const t = topicDisplayEl.value.trim();
  topicEl.value = t;
  publishTopicEl.value = t;
  getTopicEl.value = t;
  client?.setTopic(t);
}

topicUpdateBtnEl.addEventListener('click', applyHeaderTopicToAll);

function parseEvents(raw: string): string[] {
  const value = raw.trim();
  if (!value) return ['*'];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Values sent as repeated `subscriber.actor` fields (each must be a string). */
function parseSubscribeActorsList(raw: string): string[] {
  const value = raw.trim();
  if (!value) return [];
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
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function parseActorField(raw: string): unknown | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function buildHubConfig() {
  return {
    name: 'demo',
    version: '1',
    hub_endpoint: hubEndpointEl.value.trim(),
    token_endpoint: tokenEndpointEl.value.trim(),
    client_id: selectedClientId || undefined,
    client_secret: selectedClientSecret || undefined,
  };
}

function buildSessionConfig() {
  const actorsList = parseSubscribeActorsList(subscribeActorsEl.value);
  return {
    subscriberName: subscriberNameEl.value.trim() || undefined,
    actors: actorsList.length ? actorsList : undefined,
    topic: topicEl.value.trim(),
    events: parseEvents(eventsEl.value),
    lease: 7200,
  };
}

function ensureClient(recreate = false): CastClient {
  if (!client || recreate) {
    client?.destroy();
    const hub = buildHubConfig();
    const session = buildSessionConfig();
    client = new CastClient({
      hub,
      session,
      productName: productNameEl.value.trim() || 'CS3D-EXAMPLE',
      callbackUrl: `${window.location.origin}/castCallback`,
      autoReconnect: true,
    });
    client.onMessage((message) => {
      addMessage('received', 'Received', message);
    });
  }
  client.setTopic(topicEl.value.trim());
  return client;
}

hubAdminPortalBtnEl.addEventListener('click', () => {
  const base = hubEndpointEl.value.trim();
  if (!base) {
    addMessage('err', 'Hub Admin', 'hub_endpoint is empty');
    return;
  }
  try {
    // e.g. https://host/api/hub + admin -> https://host/api/hub/admin
    const hubBase = base.endsWith('/') ? base : `${base}/`;
    const url = new URL('admin', hubBase).href;
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    addMessage('err', 'Hub Admin', 'Invalid hub_endpoint URL');
  }
});

tokenBtnEl.addEventListener('click', async () => {
  setConnection('connecting', 'Getting token');
  try {
    const c = ensureClient(true);
    const hubPreset =
      HUB_DEFINITIONS[hubSelectEl.value as keyof typeof HUB_DEFINITIONS];
    const tokenFormData = new URLSearchParams();
    tokenFormData.append('client_id', selectedClientId || hubPreset.client_id);
    tokenFormData.append('grant_type', 'client_credentials');
    tokenFormData.append(
      'client_secret',
      selectedClientSecret || hubPreset.client_secret
    );
    const response = await fetch(tokenEndpointEl.value.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenFormData,
    });
    let ok = false;
    if (response.ok) {
      const data = await response.json();
      c.setToken(data.access_token ?? '');
      const receivedTopic =
        typeof data.topic === 'string' ? data.topic.trim() : '';
      if (receivedTopic) {
        c.setTopic(receivedTopic);
        c.setSubscriberName(`CS3D-${receivedTopic}`);
      } else if (data.subscriber_name) {
        c.setSubscriberName(data.subscriber_name);
      }
      ok = Boolean(c.getConnectionState().token);
    }
    subscribeBtnEl.disabled = !ok;
    if (ok) {
      setConnection('token-ready', 'Token ready');
      const session = c.getSessionConfig();
      if (session.subscriberName) {
        subscriberNameEl.value = session.subscriberName;
        getSubscriberEl.value = session.subscriberName;
      }
      if (session.topic) {
        topicEl.value = session.topic;
        publishTopicEl.value = session.topic;
        getTopicEl.value = session.topic;
        topicDisplayEl.value = session.topic;
      }
      addMessage('received', 'Token', 'Token obtained');
    } else {
      setConnection('disconnected', 'Token failed');
      addMessage('err', 'Token error', 'Failed to get token');
    }
  } catch (error) {
    subscribeBtnEl.disabled = true;
    setConnection('disconnected', 'Token error');
    addMessage('err', 'Token exception', String(error));
  }
});

subscribeBtnEl.addEventListener('click', async () => {
  setConnection('connecting', 'Subscribing');
  const c = ensureClient();
  const result = await c.subscribe();
  if (result === 202) {
    setConnection('connected', 'Websocket connected');
    unsubscribeBtnEl.disabled = false;
    publishBtnEl.disabled = false;
    getBtnEl.disabled = false;
    conferenceBtnEl.disabled = false;
    addMessage('sent', 'Subscribe', { topic: topicEl.value.trim() });
  } else {
    setConnection('disconnected', `Subscribe failed (${String(result)})`);
    addMessage(
      'err',
      'Subscribe error',
      `Subscribe failed (${String(result)})`
    );
  }
});

unsubscribeBtnEl.addEventListener('click', async () => {
  if (!client) return;
  await client.unsubscribe();
  unsubscribeBtnEl.disabled = true;
  publishBtnEl.disabled = true;
  getBtnEl.disabled = true;
  conferenceBtnEl.disabled = true;
  subscribeBtnEl.disabled = false;
  setConnection('disconnected', 'Not connected');
  addMessage('sent', 'Unsubscribe', topicEl.value.trim());
});

publishBtnEl.addEventListener('click', async () => {
  if (!client) {
    addMessage('err', 'Publish error', 'Subscribe first');
    return;
  }
  const eventType =
    eventTypeEl.value === 'custom'
      ? eventTypeCustomEl.value.trim()
      : eventTypeEl.value;
  if (!eventType) {
    addMessage('err', 'Publish error', 'Event type required');
    return;
  }
  let context: unknown;
  try {
    context = JSON.parse(eventDataEl.value || '[]');
  } catch {
    addMessage('err', 'Publish error', 'Invalid Event Data JSON');
    return;
  }
  const payload: Record<string, unknown> = {
    event: {
      'hub.topic': publishTopicEl.value.trim(),
      'hub.event': eventType,
      context,
    },
  };
  const actorValue = parseActorField(publishActorPresetEl.value.trim());
  if (actorValue !== undefined) {
    payload.actor = actorValue;
  }
  const res = await client.publish(payload);
  if (res?.ok) {
    addMessage('sent', 'Publish', payload);
  } else {
    addMessage(
      'err',
      'Publish error',
      res ? `HTTP ${res.status}` : 'No response'
    );
  }
});

getBtnEl.addEventListener('click', async () => {
  const subscriber = getSubscriberEl.value.trim();
  if (!subscriber) {
    addMessage('err', 'Get error', 'Subscriber is required');
    return;
  }
  const endpoint = getEndpointEl.value.trim();
  const dataType = getDataTypeEl.value;
  const url = new URL(endpoint);
  url.searchParams.set('subscriber', subscriber);
  const getTopic = getTopicEl.value.trim();
  if (getTopic) url.searchParams.set('topic', getTopic);
  if (dataType) url.searchParams.set('dataType', dataType);
  const getActorRaw = getActorPresetEl.value.trim();
  if (getActorRaw) {
    url.searchParams.set('actor', getActorRaw);
  }

  const response = await fetch(url.toString(), { method: 'GET' });
  if (response.ok) {
    const json = await response.json();
    byId<HTMLDivElement>('getResults').innerHTML =
      `<div class="status success"><pre>${JSON.stringify(json, null, 2)}</pre></div>`;
    addMessage('received', 'Get', json);
  } else {
    const text = await response.text();
    byId<HTMLDivElement>('getResults').innerHTML = '';
    addMessage('err', 'Get error', `${response.status} ${text}`);
  }
});

conferenceBtnEl.addEventListener('click', () => {
  const url = new URL(conferenceEndpointEl.value.trim());
  url.searchParams.set('subscriberName', subscriberNameEl.value.trim());
  url.searchParams.set('topic', topicEl.value.trim());
  window.open(url.toString(), '_blank');
});

clearBtnEl.addEventListener('click', () => {
  messagesEl.innerHTML = '';
  messageCount = 0;
  messageCountEl.textContent = '(0)';
});

window.addEventListener('beforeunload', () => {
  client?.destroy();
});
