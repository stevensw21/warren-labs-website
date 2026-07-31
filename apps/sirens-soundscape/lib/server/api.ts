export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      { status: error.status },
    );
  }

  console.error("Unhandled Siren's Soundscape API error", error);
  return jsonResponse(
    {
      error: {
        code: "internal_error",
        message: "The request could not be completed.",
      },
    },
    { status: 500 },
  );
}

export async function withApiErrors(
  operation: () => Response | Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function readJsonObject(
  request: Request,
  maximumBytes = 512 * 1024,
): Promise<Record<string, unknown>> {
  const declaredLength = parseContentLength(request.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > maximumBytes) {
    throw new ApiError(
      413,
      "request_too_large",
      "The JSON request body is too large.",
    );
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new ApiError(
      413,
      "request_too_large",
      "The JSON request body is too large.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_json", "The JSON body must be an object.");
  }

  return value as Record<string, unknown>;
}

export function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function requireString(
  value: unknown,
  field: string,
  options: { maximum: number; minimum?: number; allowEmpty?: boolean },
): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_field", `${field} must be a string.`, {
      field,
    });
  }

  const normalized = value.trim();
  const minimum = options.allowEmpty ? 0 : (options.minimum ?? 1);
  if (normalized.length < minimum || normalized.length > options.maximum) {
    throw new ApiError(
      400,
      "invalid_field",
      `${field} must be between ${minimum} and ${options.maximum} characters.`,
      { field },
    );
  }

  return normalized;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
