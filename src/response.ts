import type { ApiMeta, Env } from "./types.js";

export function buildMeta(env: Env): ApiMeta {
  return {
    dataset_version: env.DATASET_VERSION,
    dataset_date: env.DATASET_DATE,
    last_synced: env.LAST_SYNCED,
    source: "Bangko Sentral ng Pilipinas (BSP)",
    source_url: "https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx",
  };
}

export function wrapResponse<T>(data: T, meta: ApiMeta) {
  return {
    _meta: meta,
    data,
  };
}

export function wrapPaginatedResponse<T>(
  data: T,
  meta: ApiMeta,
  pagination: { total: number; offset: number; limit: number; has_more: boolean }
) {
  return {
    _meta: meta,
    data,
    pagination,
  };
}

export function toolResult(data: unknown, meta: ApiMeta) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(wrapResponse(data, meta), null, 2),
      },
    ],
  };
}

export function toolPaginatedResult(
  data: unknown,
  meta: ApiMeta,
  pagination: { total: number; offset: number; limit: number; has_more: boolean }
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(wrapPaginatedResponse(data, meta, pagination), null, 2),
      },
    ],
  };
}

export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
