export type ToolProps = {
  name: string
  supportedInteractionTypes?: Array<string>
  configuration?: Record<string, any>
}

export type PublicToolProps = {
  name?: string
  supportedInteractionTypes?: Array<string>
  configuration?: Record<string, any>
}
