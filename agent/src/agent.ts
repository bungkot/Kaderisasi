import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OpenCode } from "@opencode/client"
import type { FileDiffInfo, SessionInfo, SessionMessageInfo } from "@opencode/client"
import { EventBus } from "./events.js"
import type { Logger } from "./logger.js"
import type { OpenCodeConfig, PermissionReply } from "./permission.js"

export type WaitOutcome = "idle" | "timeout" | "error"
export interface PermissionRequest {
  action: string
  sessionID: string
  id: string
}
export type PermissionPolicy = (permission: PermissionRequest) => PermissionReply
export type PermissionPrompt = PermissionRequest

export type SessionMessage = SessionMessageInfo

type Client = ReturnType<typeof OpenCode.make>

export class OpenCodeAgent {
  private server: ChildProcess | null = null
  private client: Client | null = null
  private events: EventBus | null = null
  private homeDir: string | null = null

  constructor(private readonly logger: Logger) {}

  async start(config: OpenCodeConfig): Promise<void> {
    this.homeDir = await mkdtemp(join(tmpdir(), "kaderisasi-opencode-"))
    const password = randomBytes(24).toString("hex")
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: this.homeDir,
      XDG_CONFIG_HOME: join(this.homeDir, ".config"),
      XDG_DATA_HOME: join(this.homeDir, ".local", "share"),
      XDG_STATE_HOME: join(this.homeDir, ".local", "state"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      OPENCODE_PASSWORD: password,
    }

    const child = spawn("opencode", ["serve", "--hostname=127.0.0.1", "--port=0"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    const url = await new Promise<string>((resolve, reject) => {
      let settled = false
      let output = ""
      const timer = setTimeout(() => fail("server_start_timeout"), 30_000)
      const fail = (message: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`${message}: ${output.slice(-1000)}`))
      }
      const onData = (chunk: Buffer) => {
        if (settled) return
        output += chunk.toString()
        const match = output.match(/server listening on (https?:\/\/\S+)/)
        if (!match) return
        settled = true
        clearTimeout(timer)
        resolve(match[1]!.trim())
      }
      child.stdout?.on("data", onData)
      child.stderr?.on("data", onData)
      child.once("error", (error) => fail(error.message))
      child.once("exit", (code) => fail(`server exited with code ${code}`))
    })

    this.server = child
    this.client = OpenCode.make({
      baseUrl: url,
      headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` },
    })
    this.events = new EventBus(
      (signal) => this.requireClient().event.subscribe({ signal }),
      (error) => {
        this.logger.error("agent", "event_stream_error", {
          error: error instanceof Error ? error.message : String(error),
        })
      },
    )
    this.events.start()
    this.logger.info("agent", "server_up", { url, isolatedHome: this.homeDir })
  }

  handlePermissions(policy: PermissionPolicy): void {
    const events = this.events
    if (!events) return
    events.on((event) => {
      if (event.type !== "permission.asked") return
      const data = event.data as { sessionID?: string; id?: string; action?: string } | undefined
      if (!data?.sessionID || !data.id) return
      const decision = policy({
        action: data.action ?? "",
        sessionID: data.sessionID,
        id: data.id,
      })
      void this.requireClient()
        .permission.reply({ sessionID: data.sessionID, requestID: data.id, decision })
        .catch(() => undefined)
    })
  }

  private requireClient(): Client {
    if (!this.client) throw new Error("OpenCode agent is not started")
    return this.client
  }

  async createSession(
    directory: string,
    title: string,
    agent: string,
    model: { providerID: string; modelID: string },
  ): Promise<string> {
    const session: SessionInfo = await this.requireClient().session.create({
      location: { directory },
      title,
      agent,
      model: { providerID: model.providerID, id: model.modelID },
    })
    return session.id
  }

  async prompt(sessionID: string, text: string): Promise<void> {
    await this.requireClient().session.prompt({ sessionID, text })
  }

  async promptAndWait(sessionID: string, text: string, timeoutMs: number): Promise<void> {
    await this.prompt(sessionID, text)
    const outcome = await this.waitForIdle(sessionID, Date.now() + timeoutMs)
    if (outcome !== "idle") {
      await this.abort(sessionID).catch(() => undefined)
      if (outcome === "timeout") throw new Error("agent_timeout")
      throw new Error("session_error: session stream reported an error")
    }
  }

  async waitForIdle(sessionID: string, deadline: number): Promise<WaitOutcome> {
    const events = this.events
    if (!events) return "error"
    return new Promise<WaitOutcome>((resolve) => {
      let settled = false
      let off: () => void = () => undefined
      const controller = new AbortController()
      const settle = (outcome: WaitOutcome) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        controller.abort()
        off()
        resolve(outcome)
      }

      const timer = setTimeout(() => settle("timeout"), Math.max(0, deadline - Date.now()))
      void this.requireClient()
        .experimental.session.wait({ sessionID }, { signal: controller.signal })
        .then(() => settle("idle"))
        .catch(() => undefined)

      off = events.on((event) => {
        const data = event.data as { sessionID?: string } | undefined
        if (event.type === "session.idle" && (!data?.sessionID || data.sessionID === sessionID)) settle("idle")
        if (
          (event.type === "session.execution.failed" || event.type === "session.execution.interrupted") &&
          (!data?.sessionID || data.sessionID === sessionID)
        ) {
          settle("error")
        }
      })
    })
  }

  async getSessionStatus(sessionID: string): Promise<string | undefined> {
    const session: SessionInfo = await this.requireClient().session.get({ sessionID })
    return session.time.busy && (!session.time.idle || session.time.busy > session.time.idle) ? "busy" : "idle"
  }

  async collectMessages(sessionID: string): Promise<SessionMessage[]> {
    return this.requireClient().session.context({ sessionID })
  }

  async collectDiff(sessionID: string): Promise<FileDiffInfo[]> {
    return this.requireClient().session.diff({ sessionID })
  }

  async abort(sessionID: string): Promise<void> {
    await this.requireClient().session.interrupt({ sessionID })
  }

  async stop(): Promise<void> {
    this.events?.stop()
    this.server?.kill("SIGTERM")
    if (this.homeDir) await rm(this.homeDir, { recursive: true, force: true }).catch(() => undefined)
    this.server = null
    this.client = null
    this.events = null
    this.homeDir = null
  }
}
