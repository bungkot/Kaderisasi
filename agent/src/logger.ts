export interface LogContext {
  [key: string]: unknown
}

export type LogSink = (line: string) => void

type Level = "INFO" | "WARN" | "ERROR"

function defaultSink(line: string): void {
  process.stdout.write(`${line}\n`)
}

export class Logger {
  constructor(
    private readonly bindings: LogContext,
    private readonly sink: LogSink = defaultSink,
  ) {}

  child(extra: LogContext): Logger {
    return new Logger({ ...this.bindings, ...extra }, this.sink)
  }

  write(level: Level, phase: string, event: string, fields: LogContext = {}): void {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      phase,
      event,
      ...this.bindings,
      ...fields,
    })
    this.sink(line)
  }

  info(phase: string, event: string, fields: LogContext = {}): void {
    this.write("INFO", phase, event, fields)
  }

  warn(phase: string, event: string, fields: LogContext = {}): void {
    this.write("WARN", phase, event, fields)
  }

  error(phase: string, event: string, fields: LogContext = {}): void {
    this.write("ERROR", phase, event, fields)
  }
}
