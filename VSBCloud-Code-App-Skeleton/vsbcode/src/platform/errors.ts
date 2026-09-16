/**
 * Error model.
 *
 * The canvas apps wrap risky work in `IfError(..., Trace(..., TraceSeverity.Critical))`
 * and distinguish four practical failure classes by how they react. Those four classes are
 * reproduced here so screens can branch the same way, and `App.OnError`'s
 * `gblReportError` shape is preserved for the Report-a-problem panel.
 */

export type AppErrorKind =
  /** Dataverse rejected the operation for privilege reasons. Not retryable. */
  | "permission"
  /** The record or payload was rejected. Not retryable without a change. */
  | "validation"
  /** 429 / 503 / network. Retryable with backoff. */
  | "transient"
  /** Anything else. */
  | "unknown";

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly source?: string;
  readonly details?: unknown;
  readonly retryAfterMs?: number;

  constructor(
    kind: AppErrorKind,
    message: string,
    opts: { status?: number; source?: string; details?: unknown; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.status = opts.status;
    this.source = opts.source;
    this.details = opts.details;
    this.retryAfterMs = opts.retryAfterMs;
  }

  get isRetryable(): boolean {
    return this.kind === "transient";
  }

  /** Message intended for the user, not the log. */
  get userMessage(): string {
    switch (this.kind) {
      case "permission":
        return "You do not have permission to do that. If you believe you should, ask your administrator to check your security role.";
      case "validation":
        return this.message || "That value was rejected. Check the highlighted fields and try again.";
      case "transient":
        return "The service is busy. This will retry automatically.";
      default:
        return "Something went wrong. The details have been recorded — you can send them from Help → Report a problem.";
    }
  }
}

interface ODataError {
  error?: { code?: string; message?: string; innererror?: { message?: string } };
  status?: number;
}

/** Map anything thrown by the SDK, fetch, or our own code into an AppError. */
export function toAppError(e: unknown, source?: string): AppError {
  if (e instanceof AppError) return e;

  if (e instanceof Error && e.name === "AbortError") {
    return new AppError("transient", "The request was cancelled.", { source });
  }

  const anyE = e as (ODataError & { message?: string; statusCode?: number }) | undefined;
  const status = anyE?.status ?? anyE?.statusCode;
  const msg =
    anyE?.error?.innererror?.message ??
    anyE?.error?.message ??
    anyE?.message ??
    "Unexpected error";
  const code = anyE?.error?.code ?? "";

  if (status === 401 || status === 403 || /PrivilegeDenied|AccessDenied|0x80040220/i.test(code)) {
    return new AppError("permission", msg, { status, source, details: e });
  }
  if (status === 400 || status === 404 || status === 409 || status === 412) {
    return new AppError("validation", msg, { status, source, details: e });
  }
  if (status === 429 || status === 503 || status === 504 || status === undefined) {
    // 429 is the Dataverse service-protection response; honour Retry-After when present.
    const ra = (e as { retryAfter?: number })?.retryAfter;
    return new AppError("transient", msg, {
      status,
      source,
      details: e,
      retryAfterMs: ra ? ra * 1000 : undefined,
    });
  }
  return new AppError("unknown", msg, { status, source, details: e });
}

/** The `gblReportError` record built by App.OnError. */
export interface ReportErrorRecord {
  user: string;
  errorScreen: string;
  errorSource: string;
  errorMessage: string;
  timestamp: string;
}

export function toReportError(
  e: AppError,
  user: string,
  screen: string,
): ReportErrorRecord {
  return {
    user,
    errorScreen: screen,
    errorSource: e.source ?? "unknown",
    errorMessage: e.message,
    timestamp: new Date().toISOString(),
  };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never,>(error: AppError): Result<T> => ({ ok: false, error });

export async function attempt<T>(fn: () => Promise<T>, source?: string): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(toAppError(e, source));
  }
}
