import type {
  HubConfig,
  CastMessage,
  CastClientConfig,
  HubRuntimeState,
  ActiveHub,
} from './types';
import { generateMessageId } from './generateMessageId';
import { RECONNECT_INTERVAL_MS, SUBSCRIBE_TIMEOUT_MS } from './constants';

export interface CastTransport {
  sendGetResponse(requestId: string, data: unknown, topic?: string): void;
}

const DEFAULT_MESSAGE_ID_PREFIX = 'CS3D-';

export class CastClient implements CastTransport {
  private _config: CastClientConfig;
  private _hub: ActiveHub;
  private _reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private _onMessageCallback: ((message: CastMessage) => void) | null = null;

  constructor(config: CastClientConfig = {}) {
    this._config = config;
    this._hub = config.hub
      ? { ...config.hub, ...this._createEmptyHubRuntimeState() }
      : this._createEmptyHub();

    if (config.autoReconnect) {
      this._reconnectInterval = setInterval(
        () => this._checkWebsocket(),
        RECONNECT_INTERVAL_MS
      );
    }
  }

  destroy(): void {
    if (this._reconnectInterval) {
      clearInterval(this._reconnectInterval);
      this._reconnectInterval = null;
    }
    this.unsubscribe();
  }

  onMessage(callback: (message: CastMessage) => void): void {
    this._onMessageCallback = callback;
  }

  getHubConfig(): HubConfig {
    const {
      token,
      subscribed,
      resubscribeRequested,
      websocket,
      lastPublishedMessageID,
      ...config
    } = this._hub;
    return config;
  }

  getHubState(): HubRuntimeState {
    const {
      token,
      subscribed,
      resubscribeRequested,
      websocket,
      lastPublishedMessageID,
    } = this._hub;
    return {
      token,
      subscribed,
      resubscribeRequested,
      websocket,
      lastPublishedMessageID,
    };
  }

  setTopic(topic: string): void {
    console.debug('CastClient: setting topic to', topic);
    this._hub.topic = topic;
  }

  setToken(token: string): void {
    this._hub.token = token;
  }

  setSubscriberName(subscriberName: string): void {
    this._hub.subscriberName = subscriberName;
  }

  async getToken(): Promise<boolean> {
    const hub = this._hub;
    try {
      const url = new URL(hub.token_endpoint);
      console.debug(
        'CastClient: Getting token from:',
        url.origin + url.pathname
      );
    } catch {
      console.debug('CastClient: Getting token from hub');
    }

    const tokenFormData = new URLSearchParams();
    tokenFormData.append('grant_type', 'client_credentials');
    tokenFormData.append('client_id', hub.client_id ?? '');
    tokenFormData.append('client_secret', hub.client_secret ?? '');
    tokenFormData.append(
      'client_product_name',
      this._config.productName ?? 'CS3D-EXAMPLE'
    );

    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenFormData,
    };

    try {
      const response = await fetch(hub.token_endpoint, requestOptions);
      if (response.status === 200) {
        const config = (await response.json()) as Record<string, unknown>;
        if (typeof config.access_token === 'string' && config.access_token) {
          hub.token = config.access_token;
        }
        if (typeof config.subscriber_name === 'string') {
          hub.subscriberName = config.subscriber_name;
        }
        if (config.topic && typeof config.topic === 'string') {
          this.setTopic(config.topic);
          if (this._config.autoStart) {
            void this.subscribe();
          }
        }
        return Boolean(hub.token);
      }
      await response.text(); // consume body (may contain sensitive data; do not log)
      console.error(
        'CastClient: Error getting token. Status:',
        response.status
      );
      return false;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('CastClient: Exception getting token:', message);
      return false;
    }
  }

  async subscribe(): Promise<number | string> {
    const hub = this._hub;
    const topic = hub.topic?.trim();
    if (!topic) {
      console.warn(
        'CastClient: Error. subscription not sent. No topic defined.'
      );
      return 'error: topic not defined';
    }
    if (!hub.token) {
      console.warn(
        'CastClient: Error. subscription not sent. No token available.'
      );
      return 'error: no token';
    }

    const callbackUrl =
      this._config.callbackUrl ??
      (typeof window !== 'undefined'
        ? `${window.location.origin}/castCallback`
        : '');
    const subscribeFormData = new URLSearchParams();
    subscribeFormData.append('hub.mode', 'subscribe');
    subscribeFormData.append('hub.channel.type', 'websocket');
    subscribeFormData.append('hub.callback', callbackUrl);
    subscribeFormData.append('hub.events', (hub.events ?? []).toString());
    subscribeFormData.append('hub.topic', topic);
    subscribeFormData.append('hub.lease', String(hub.lease ?? 999));
    subscribeFormData.append('subscriber.name', hub.subscriberName ?? '');
    for (const a of hub.actors ?? []) {
      const v = a.trim();
      if (v) subscribeFormData.append('subscriber.actor', v);
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Bearer ' + hub.token,
      },
      body: subscribeFormData,
      signal: AbortSignal.timeout(SUBSCRIBE_TIMEOUT_MS),
    };

    try {
      const response = await fetch(hub.hub_endpoint, requestOptions);
      if (response.status === 202) {
        hub.subscribed = true;
        hub.resubscribeRequested = false;
        const subscriptionResponse = await response.json();
        const websocketUrl = subscriptionResponse['hub.channel.endpoint'];

        let normalizedWebsocketUrl = websocketUrl;
        try {
          const hubEndpointUrl = new URL(hub.hub_endpoint);
          const wsUrl = new URL(websocketUrl);
          const wsProtocol =
            hubEndpointUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          normalizedWebsocketUrl = websocketUrl.replace(
            wsUrl.origin,
            `${wsProtocol}//${hubEndpointUrl.host}`
          );
        } catch {
          // use original
        }

        hub.websocket = new WebSocket(normalizedWebsocketUrl);
        hub.websocket.onopen = function () {
          (this as WebSocket).send(
            '{"hub.channel.endpoint":"' + normalizedWebsocketUrl + '"}'
          );
        };
        hub.websocket.addEventListener('message', (ev) =>
          this._processEvent(ev.data)
        );
        hub.websocket.addEventListener('close', () => this._websocketClose());
        hub.websocket.onerror = function () {
          console.warn('CastClient: Error reported on websocket');
        };

        return response.status;
      }
      if (response.status === 401) {
        console.warn(
          'CastClient: Subscription response 401 - Token refresh needed.'
        );
        await this.getToken();
      } else {
        console.error(
          'CastClient: Subscription rejected by hub. Status:',
          response.status
        );
      }
      return response.status;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('CastClient: Exception subscribing to the hub:', message);
      return 0;
    }
  }

  async unsubscribe(): Promise<void> {
    const hub = this._hub;
    hub.subscribed = false;
    hub.resubscribeRequested = false;

    const callbackUrl =
      this._config.callbackUrl ??
      (typeof window !== 'undefined'
        ? `${window.location.origin}/castCallback`
        : '');
    const subscribeFormData = new URLSearchParams();
    subscribeFormData.append('hub.mode', 'unsubscribe');
    subscribeFormData.append('hub.channel.type', 'websocket');
    subscribeFormData.append('hub.callback', callbackUrl);
    subscribeFormData.append('hub.events', (hub.events ?? []).toString());
    subscribeFormData.append('hub.topic', hub.topic ?? '');
    subscribeFormData.append('hub.lease', String(hub.lease ?? 999));
    subscribeFormData.append('subscriber.name', hub.subscriberName ?? '');
    for (const a of hub.actors ?? []) {
      const v = a.trim();
      if (v) subscribeFormData.append('subscriber.actor', v);
    }

    try {
      const response = await fetch(hub.hub_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Bearer ' + hub.token,
        },
        body: subscribeFormData,
        signal: AbortSignal.timeout(SUBSCRIBE_TIMEOUT_MS),
      });
      if (response.status === 202) {
        console.debug(
          'CastClient: Unsubscribe successfully from hub',
          hub.name
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('CastClient: Error unsubscribing from the hub.', message);
    }
    if (hub.websocket) {
      hub.websocket.close();
      hub.websocket = null;
    }
  }

  async publish(
    castMessage: Record<string, unknown>,
    hub: ActiveHub = this._hub
  ): Promise<Response | null> {
    const timestamp = new Date();
    const msg = { ...castMessage, timestamp: timestamp.toJSON() } as Record<
      string,
      unknown
    >;
    msg.id = generateMessageId(this._messageIdPrefix());
    hub.lastPublishedMessageID = msg.id as string;

    const event = msg.event as Record<string, unknown>;
    if (event) {
      event['hub.topic'] = hub.topic;
    }

    const hubEndpoint = hub.hub_endpoint;

    try {
      const response = await fetch(hubEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + hub.token,
        },
        body: JSON.stringify(msg),
      });
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.debug('CastClient:', message);
      return null;
    }
  }

  sendGetResponse(requestId: string, data: unknown, topic?: string): void {
    const hub = this._hub;
    if (!hub.websocket || hub.websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const response = {
      timestamp: new Date().toJSON(),
      id: generateMessageId(this._messageIdPrefix()),
      event: {
        'hub.topic': topic ?? hub.topic,
        'hub.event': 'get-response',
        context: { requestId, data },
      },
    };
    hub.websocket.send(JSON.stringify(response));
  }

  private _messageIdPrefix(): string {
    return this._config.messageIdPrefix ?? DEFAULT_MESSAGE_ID_PREFIX;
  }

  private _createEmptyHub(): ActiveHub {
    return {
      name: '',
      friendlyName: '',
      productName: '',
      version: '',
      events: [],
      lease: 999,
      hub_endpoint: '',
      authorization_endpoint: '',
      token_endpoint: '',
      ...this._createEmptyHubRuntimeState(),
      subscriberName: '',
      actors: [],
      topic: '',
    };
  }

  private _createEmptyHubRuntimeState(): HubRuntimeState {
    return {
      token: '',
      lastPublishedMessageID: '',
      subscribed: false,
      resubscribeRequested: false,
      websocket: null,
    };
  }

  private async _checkWebsocket(): Promise<void> {
    const hub = this._hub;
    if (
      hub.resubscribeRequested &&
      hub.subscribed &&
      this._config.autoReconnect
    ) {
      console.debug('CastClient: Try to resubscribe');
      hub.resubscribeRequested = false;
      const response = await this.subscribe();
      if (response !== 202) {
        hub.resubscribeRequested = true;
      }
    } else if (!hub.subscribed && hub.resubscribeRequested) {
      hub.resubscribeRequested = false;
    }
  }

  private _processEvent(eventData: string): void {
    try {
      const castMessage = JSON.parse(eventData) as CastMessage;
      if (castMessage['hub.mode']) {
        return;
      }
      const event = castMessage.event;
      if (!event) return;
      if (event['hub.event'] === 'heartbeat') {
        return;
      }
      if (castMessage.id === this._hub.lastPublishedMessageID) {
        return;
      }
      this._onMessageCallback?.(castMessage);
    } catch (err) {
      console.warn('CastClient: websocket processing error:', err);
    }
  }

  private _websocketClose(): void {
    console.debug('CastClient: websocket is closed.');
    this._hub.resubscribeRequested = true;
  }
}
