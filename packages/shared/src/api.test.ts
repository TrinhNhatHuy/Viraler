import { describe, expect, it } from 'vitest';
import { CreateProjectBody, PROJECT_TITLE_MAX, UpdateProjectBody } from './api';
import { createEmptyProject } from './project';

describe('CreateProjectBody', () => {
  it('accepts an empty body and a title', () => {
    expect(CreateProjectBody.safeParse({}).success).toBe(true);
    expect(CreateProjectBody.parse({ title: '  My video  ' }).title).toBe('My video');
  });

  it('rejects blank and too-long titles', () => {
    expect(CreateProjectBody.safeParse({ title: '   ' }).success).toBe(false);
    expect(CreateProjectBody.safeParse({ title: 'a'.repeat(PROJECT_TITLE_MAX + 1) }).success).toBe(
      false,
    );
  });
});

describe('UpdateProjectBody', () => {
  const data = createEmptyProject();

  it('accepts a title-only update without a revision', () => {
    expect(UpdateProjectBody.safeParse({ title: 'New name' }).success).toBe(true);
  });

  it('accepts a data update with expectedRevision', () => {
    expect(UpdateProjectBody.safeParse({ data, expectedRevision: 3 }).success).toBe(true);
    expect(UpdateProjectBody.safeParse({ title: 'x', data, expectedRevision: 1 }).success).toBe(
      true,
    );
  });

  it('requires title or data', () => {
    expect(UpdateProjectBody.safeParse({}).success).toBe(false);
    expect(UpdateProjectBody.safeParse({ expectedRevision: 1 }).success).toBe(false);
  });

  it('requires expectedRevision when data is sent', () => {
    const r = UpdateProjectBody.safeParse({ data });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['expectedRevision']);
  });

  it('rejects invalid project data', () => {
    const bad = { ...data, canvas: { ...data.canvas, fit: 'stretch' } };
    expect(UpdateProjectBody.safeParse({ data: bad, expectedRevision: 1 }).success).toBe(false);
  });

  it('rejects non-positive or fractional revisions', () => {
    expect(UpdateProjectBody.safeParse({ data, expectedRevision: 0 }).success).toBe(false);
    expect(UpdateProjectBody.safeParse({ data, expectedRevision: 1.5 }).success).toBe(false);
  });
});
