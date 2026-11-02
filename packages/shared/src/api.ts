import { z } from 'zod';
import { Project } from './project';

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
