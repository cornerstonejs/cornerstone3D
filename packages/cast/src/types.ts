export interface HubConfig {
  name: string;
  friendlyName?: string;
  productName?: string;
  enabled: boolean;
  events: string[];
  lease: number;
  hub_endpoint: string;
  authorization_endpoint?: string;
  token_endpoint: string;
  client_id?: string;
  client_secret?: string;
  token?: string;
  subscriberName?: string;
  /** Optional; each entry is sent as a repeated `subscriber.actor` form field. */
  actors?: string[];
  topic?: string;
  subscribed?: boolean;
  resubscribeRequested?: boolean;
  websocket?: WebSocket | null;
  lastPublishedMessageID?: string;
}

export interface CastMessage {
  id?: string;
  timestamp?: string;
  event?: {
    'hub.event': string;
    'hub.topic'?: string;
    context?: unknown;
  };
}

export interface CastClientConfig {
  hubs?: HubConfig[];
  defaultHub?: string;
  productName?: string;
  callbackUrl?: string;
  autoStart?: boolean;
  autoReconnect?: boolean;
  /**
   * Prefix for generated message IDs (publish and get-response). Defaults to `OHIF-` for backward compatibility.
   */
  messageIdPrefix?: string;
}
