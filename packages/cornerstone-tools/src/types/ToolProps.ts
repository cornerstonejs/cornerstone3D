type SharedToolProp = {
  supportedInteractionTypes?: Array<string>
  configuration?: Record<string, any>
}

export type ToolProps = SharedToolProp

export type PublicToolProps = SharedToolProp & {
  name?: string
}
