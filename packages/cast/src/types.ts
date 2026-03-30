export interface HubConfig {
  name: string;
  friendlyName?: string;
  productName?: string;
  version?: string;
  events: string[];
  lease: number;
  hub_endpoint: string;
  authorization_endpoint?: string;
  token_endpoint: string;
  client_id?: string;
  client_secret?: string;
  subscriberName?: string;
  /** Optional; each entry is sent as a repeated `subscriber.actor` form field. */
  actors?: string[];
  topic?: string;
}

export interface HubRuntimeState {
  token: string;
  subscribed: boolean;
  resubscribeRequested: boolean;
  websocket: WebSocket | null;
  lastPublishedMessageID: string;
}

export type ActiveHub = HubConfig & HubRuntimeState;

export interface CastMessage {
  id?: string;
  timestamp?: string;
  /** Present on control-plane messages; ignored for app events. */
  'hub.mode'?: string;
  event?: {
    'hub.event': string;
    'hub.topic'?: string;
    context?: unknown;
  };
}

export interface CastClientConfig {
  hub?: HubConfig;
  productName?: string;
  callbackUrl?: string;
  autoStart?: boolean;
  autoReconnect?: boolean;
  /**
   * Prefix for generated message IDs (publish and get-response). Defaults to `CS3D-`.
   */
  messageIdPrefix?: string;
}
