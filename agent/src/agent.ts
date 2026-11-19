import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk"
import type { AssistantMessage, Config, FileDiff, Message, OpencodeClient, Part, Permission } from "@opencode-ai/sdk"
import { EventBus } from "./events.js"
import type { Logger } from "./logger.js"

export type WaitOutcome = "idle" | "timeout" | "error"
export type PermissionPolicy = (permission: Permission) => "once" | "always" | "reject"
export type PermissionPrompt = Permission

export interface SessionMessage {
  info: AssistantMessage
  parts: Part[]
}

export class OpenCodeAgent {
  private server: { url: string; close(): void } | null = null
  private client: OpencodeClient | null = null
  private events: EventBus | null = null
  private directory: string | null = null
  private homeDir: string | null = null

  constructor(private readonly logger: Logger) {}

  async start(config: Config): Promise<void> {
    this.homeDir = await mkdtemp(join(tmpdir(), "kaderisasi-opencode-"))
    const keys = ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"] as const
    const saved = new Map<string, string | undefined>()
    for (const key of keys) saved.set(key, process.env[key])
    process.env.HOME = this.homeDir
    process.env.XDG_CONFIG_HOME = join(this.homeDir, ".config")
    process.env.XDG_DATA_HOME = join(this.homeDir, ".local", "share")
    process.env.XDG_STATE_HOME = join(this.homeDir, ".local", "state")

    try {
      this.server = await createOpencodeServer({ port: 0, timeout: 30_000, config })
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }

    this.client = createOpencodeClient({ baseUrl: this.server.url })
    this.events = new EventBus(this.client)
    this.events.start(this.directory ?? undefined)
    this.logger.info("agent", "server_up", { url: this.server.url, isolatedHome: this.homeDir })
  }

  handlePermissions(policy: PermissionPolicy): void {
    const events = this.events
    if (!events) return
    events.on((event) => {
      if (event.type !== "permission.updated") return
      const permission = event.properties as unknown as Permission | undefined
      if (!permission) return
      const response = policy(permission)
      void this.requireClient()
        .postSessionIdPermissionsPermissionId({
          path: { id: permission.sessionID, permissionID: permission.id },
          body: { response },
        })
        .catch(() => undefined)
    })
  }

  private requireClient(): OpencodeClient {
    if (!this.client) throw new Error("OpenCode agent is not started")
    return this.client
  }

  private unwrap<T>(result: { data?: T }): T {
    if (result.data === undefined) throw new Error("OpenCode server returned an empty response")
    return result.data
  }

  async createSession(directory: string, title: string): Promise<string> {
    this.directory = directory
    const result = await this.requireClient().session.create({
      query: { directory },
      body: { title },
    })
    const session = this.unwrap(result) as { id?: string }
    if (!session.id) throw new Error("OpenCode session has no id")
    return session.id
  }

  async prompt(
    sessionID: string,
    agent: string,
    model: { providerID: string; modelID: string },
    text: string,
  ): Promise<void> {
    const result = await this.requireClient().session.promptAsync({
      path: { id: sessionID },
      query: this.directory ? { directory: this.directory } : undefined,
      body: { model, agent, parts: [{ type: "text", text }] },
    })
    if (result.error) throw new Error(`prompt_async_failed: ${JSON.stringify(result.error)}`)
  }

  async promptAndWait(
    sessionID: string,
    agent: string,
    model: { providerID: string; modelID: string },
    text: string,
    timeoutMs: number,
  ): Promise<{ info: AssistantMessage; parts: Part[] }> {
    const promise = this.requireClient()
      .session.prompt({
        path: { id: sessionID },
        query: this.directory ? { directory: this.directory } : undefined,
        body: { model, agent, parts: [{ type: "text", text }] },
      })
      .then((result) => this.unwrap(result) as { info: AssistantMessage; parts: Part[] })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("agent_timeout")), Math.max(0, timeoutMs))
    })

    try {
      return await Promise.race([promise, timeout])
    } catch (err) {
      await this.abort(sessionID).catch(() => undefined)
      throw err
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async waitForIdle(sessionID: string, deadline: number): Promise<WaitOutcome> {
    const events = this.events
    if (!events) return "error"
    return new Promise<WaitOutcome>((resolve) => {
      let settled = false
      let started = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let poll: ReturnType<typeof setInterval> | undefined
      let off: () => void = () => undefined

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        if (poll) clearInterval(poll)
        off()
      }
      const settle = (outcome: WaitOutcome) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(outcome)
      }

      timer = setTimeout(() => settle("timeout"), Math.max(0, deadline - Date.now()))
      poll = setInterval(() => {
        const dir = this.directory
        const options = dir ? { query: { directory: dir } } : {}
        void this.requireClient()
          .session.status(options)
          .then((result) => {
            if (settled) return
            const status = this.unwrap(result) as Record<string, { type: string }>
            const st = status[sessionID]
            if (st && st.type === "busy") started = true
            else if (started && st && st.type === "idle") settle("idle")
            else if (started && !st) settle("idle")
          })
          .catch(() => undefined)
      }, 1000)

      off = events.on((event) => {
        if (event.type === "session.idle" && event.properties?.sessionID === sessionID) settle("idle")
        if (
          event.type === "session.error" &&
          (!event.properties?.sessionID || event.properties.sessionID === sessionID)
        ) {
          settle("error")
        }
      })
    })
  }

  async getSessionStatus(sessionID: string): Promise<string | undefined> {
    const dir = this.directory
    const options = dir ? { query: { directory: dir } } : {}
    const result = await this.requireClient().session.status(options)
    const status = this.unwrap(result) as Record<string, { type: string }>
    return status[sessionID]?.type
  }

  async collectMessages(sessionID: string): Promise<SessionMessage[]> {
    const result = await this.requireClient().session.messages({ path: { id: sessionID } })
    return this.unwrap(result) as unknown as SessionMessage[]
  }

  async collectDiff(sessionID: string): Promise<FileDiff[]> {
    const result = await this.requireClient().session.diff({ path: { id: sessionID } })
    return this.unwrap(result) as FileDiff[]
  }

  async abort(sessionID: string): Promise<void> {
    await this.requireClient().session.abort({ path: { id: sessionID } })
  }

  async stop(): Promise<void> {
    this.events?.stop()
    this.server?.close()
    if (this.homeDir) await rm(this.homeDir, { recursive: true, force: true }).catch(() => undefined)
    this.server = null
    this.client = null
    this.events = null
    this.directory = null
    this.homeDir = null
  }
}
