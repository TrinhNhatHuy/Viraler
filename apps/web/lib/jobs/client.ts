import { type CreateJobBody, JobView } from '@viraler/shared';
import { z } from 'zod';
import { request } from '@/lib/projects/client';

export function createJobRequest(body: CreateJobBody) {
  return request('/api/jobs', { method: 'POST', body: JSON.stringify(body) }, JobView);
}

export function fetchJobRequest(id: string) {
  return request(`/api/jobs/${id}`, { method: 'GET', cache: 'no-store' }, JobView);
}

export function fetchActiveJobsRequest(projectId: string) {
  return request(
    `/api/jobs?projectId=${projectId}&active=1`,
    { method: 'GET', cache: 'no-store' },
    z.object({ jobs: z.array(JobView) }),
  );
}

export function fetchRecentJobsRequest(projectId: string) {
  return request(
    `/api/jobs?projectId=${projectId}`,
    { method: 'GET', cache: 'no-store' },
    z.object({ jobs: z.array(JobView) }),
  );
}
