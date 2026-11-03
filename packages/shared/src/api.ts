import { z } from 'zod';
import { StockItem } from './job';
import { isMediaMimeType, MAX_MEDIA_BYTES } from './limits';
import { MEDIA_NAME_MAX, Ms, Project } from './project';
import { isAllowedExternalUrl } from './storage-paths';

/** Request/response shapes for /api/projects. Shared with future API callers (n8n). */

export const PROJECT_TITLE_MAX = 200;
export const DEFAULT_PROJECT_TITLE = 'Untitled';

export const ProjectTitle = z.string().trim().min(1, 'Title is required').max(PROJECT_TITLE_MAX);

export const CreateProjectBody = z.object({
  title: ProjectTitle.optional(),
});
export type CreateProjectBody = z.infer<typeof CreateProjectBody>;

export const UpdateProjectBody = z
  .object({
    title: ProjectTitle.optional(),
    data: Project.optional(),
    /** Required when `data` is sent: the revision the client last loaded/saved. */
    expectedRevision: z.number().int().min(1).optional(),
  })
  .refine((b) => b.title !== undefined || b.data !== undefined, {
    message: 'Provide title and/or data',
  })
  .refine((b) => b.data === undefined || b.expectedRevision !== undefined, {
    message: 'expectedRevision is required when data is sent',
    path: ['expectedRevision'],
  });
export type UpdateProjectBody = z.infer<typeof UpdateProjectBody>;

export const ProjectSummary = z.object({
  id: z.uuid(),
  title: z.string(),
  revision: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const ProjectDetail = ProjectSummary.extend({ data: Project });
export type ProjectDetail = z.infer<typeof ProjectDetail>;

export const UpdateProjectResult = z.object({
  revision: z.number().int(),
  updatedAt: z.string(),
});
export type UpdateProjectResult = z.infer<typeof UpdateProjectResult>;

export const ApiError = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.unknown().optional(),
  /** Present on 409 conflicts: the revision currently stored. */
  revision: z.number().int().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

// --- /api/media (the user's media library) -------------------------------------

export const MediaAttribution = z.object({
  provider: z.literal('pexels'),
  author: z.string(),
  authorUrl: z.string(),
  pageUrl: z.string(),
});
export type MediaAttribution = z.infer<typeof MediaAttribution>;

/** A library item as returned by the API. */
export const MediaView = z.object({
  id: z.uuid(),
  kind: z.enum(['video', 'image', 'audio']),
  origin: z.enum(['upload', 'stock', 'ai']),
  /** Storage path or stock URL (what goes into project.media[].src). */
  src: z.string(),
  /** Storage path or stock URL of the thumbnail. */
  thumbnail: z.string().nullable(),
  /** Thumbnail URL the browser can load right away (signed for Storage files). */
  thumbnailUrl: z.string().nullable(),
  name: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  attribution: MediaAttribution.nullable(),
  createdAt: z.string(),
});
export type MediaView = z.infer<typeof MediaView>;

export const CreateUploadMediaBody = z.object({
  origin: z.literal('upload'),
  /** Chosen by the browser; also the file name in Storage ({uid}/media/{id}.{ext}). */
  id: z.uuid(),
  kind: z.enum(['video', 'image']),
  storagePath: z.string().min(1),
  thumbnailPath: z.string().min(1).optional(),
  mimeType: z.string().refine(isMediaMimeType, 'Unsupported file type'),
  sizeBytes: z.number().int().positive().max(MAX_MEDIA_BYTES),
  durationMs: Ms.optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().trim().min(1).max(MEDIA_NAME_MAX),
});
export type CreateUploadMediaBody = z.infer<typeof CreateUploadMediaBody>;

export const CreateStockMediaBody = z.object({
  origin: z.literal('stock'),
  item: StockItem.refine(
    (i) => isAllowedExternalUrl(i.url) && isAllowedExternalUrl(i.thumbnailUrl),
    'Stock media must come from an allowed host',
  ),
});
export type CreateStockMediaBody = z.infer<typeof CreateStockMediaBody>;

export const CreateMediaBody = z.discriminatedUnion('origin', [
  CreateUploadMediaBody,
  CreateStockMediaBody,
]);
export type CreateMediaBody = z.infer<typeof CreateMediaBody>;
