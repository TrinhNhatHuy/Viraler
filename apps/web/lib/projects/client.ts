import {
  ApiError,
  ProjectDetail,
  ProjectSummary,
  UpdateProjectResult,
  type UpdateProjectBody,
} from '@viraler/shared';
import type { z } from 'zod';

/** Browser-side wrappers around /api/projects. Never throw; return a result union. */

export type RequestFailure =
  | { ok: false; kind: 'conflict'; revision: number; message: string }
  | { ok: false; kind: 'not_found' | 'unauthorized' | 'error'; message: string };
export type RequestResult<T> = { ok: true; value: T } | RequestFailure;

/** Browsers reject keepalive requests with bodies over 64 KB. */
const KEEPALIVE_MAX_BYTES = 60_000;

export async function request<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T> | null,
): Promise<RequestResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    return { ok: false, kind: 'error', message: "Can't reach the server. Check your connection." };
  }

  if (res.ok) {
    if (!schema) return { ok: true, value: undefined as T };
    const parsed = schema.safeParse(await res.json().catch(() => null));
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, kind: 'error', message: 'Unexpected response from the server.' };
  }

  const body = ApiError.safeParse(await res.json().catch(() => null));
  const message = (body.success && body.data.message) || `Request failed (${res.status}).`;
  if (res.status === 409 && body.success && body.data.revision !== undefined) {
    return { ok: false, kind: 'conflict', revision: body.data.revision, message };
  }
  if (res.status === 404) {
    return {
      ok: false,
      kind: 'not_found',
      message: (body.success && body.data.message) || 'Not found.',
    };
  }
  if (res.status === 401) {
    return { ok: false, kind: 'unauthorized', message: 'Your session expired. Log in again.' };
  }
  return { ok: false, kind: 'error', message };
}

export function createProjectRequest(title?: string) {
  return request(
    '/api/projects',
    { method: 'POST', body: JSON.stringify({ title }) },
    ProjectSummary,
  );
}

export function fetchProjectRequest(id: string) {
  return request(`/api/projects/${id}`, { method: 'GET', cache: 'no-store' }, ProjectDetail);
}

export function saveProjectRequest(
  id: string,
  body: UpdateProjectBody,
  opts: { keepalive?: boolean } = {},
) {
  const json = JSON.stringify(body);
  const keepalive = Boolean(opts.keepalive) && json.length < KEEPALIVE_MAX_BYTES;
  return request(
    `/api/projects/${id}`,
    { method: 'PATCH', body: json, keepalive },
    UpdateProjectResult,
  );
}

export function renameProjectRequest(id: string, title: string) {
  return request(
    `/api/projects/${id}`,
    { method: 'PATCH', body: JSON.stringify({ title }) },
    UpdateProjectResult,
  );
}

export function deleteProjectRequest(id: string) {
  return request<void>(`/api/projects/${id}`, { method: 'DELETE' }, null);
}

export function duplicateProjectRequest(id: string) {
  return request(`/api/projects/${id}/duplicate`, { method: 'POST' }, ProjectSummary);
}
