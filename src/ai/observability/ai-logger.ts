type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

function write(level: LogLevel, event: string, payload: LogPayload): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component: "ai",
    event,
    ...payload,
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const aiLogger = {
  debug(event: string, payload: LogPayload = {}): void {
    write("debug", event, payload);
  },

  info(event: string, payload: LogPayload = {}): void {
    write("info", event, payload);
  },

  warn(event: string, payload: LogPayload = {}): void {
    write("warn", event, payload);
  },

  error(event: string, payload: LogPayload = {}): void {
    write("error", event, payload);
  },
};
