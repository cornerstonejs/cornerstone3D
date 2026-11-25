import type LegacyWSIViewport from '../RenderingEngine/WSIViewport';
import type WSIViewport from '../RenderingEngine/GenericViewport/WSI/WSIViewport';

type IWSIViewport = LegacyWSIViewport | WSIViewport;

export type { IWSIViewport as default };
