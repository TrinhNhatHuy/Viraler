import { createEmptyProject, type Project } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { createEditorStore, isDirty, snapshotToBody } from './editor-store';

const setup = () =>
  createEditorStore({
    id: 'p1',
    title: 'Video',
    project: createEmptyProject(),
    revision: 1,
  });

const withFit = (fit: 'fill' | 'fit') => (p: Project) => ({ ...p, canvas: { ...p.canvas, fit } });

describe('editor store', () => {
  it('starts clean with nothing to save', () => {
    const store = setup();
    expect(isDirty(store.getState())).toBe(false);
    expect(store.getState().beginSave()).toBeNull();
  });

  it('marks data edits dirty and saves them with the expected revision', () => {
    const store = setup();
    store.getState().updateProject(withFit('fit'));
    expect(isDirty(store.getState())).toBe(true);

    const snap = store.getState().beginSave();
    expect(snap).not.toBeNull();
    expect(snap!.data?.canvas.fit).toBe('fit');
    expect(snap!.title).toBeUndefined();
    expect(snapshotToBody(snap!)).toMatchObject({ expectedRevision: 1 });
    expect(store.getState().saveStatus).toBe('saving');

    store.getState().saveSucceeded(snap!, 2);
    const s = store.getState();
    expect(isDirty(s)).toBe(false);
    expect(s.revision).toBe(2);
    expect(s.saveStatus).toBe('saved');
  });

  it('ignores no-op edits', () => {
    const store = setup();
    store.getState().updateProject((p) => p);
    store.getState().setTitle('Video');
    expect(store.getState().changeSeq).toBe(0);
  });

  it('keeps edits made during an in-flight save dirty', () => {
    const store = setup();
    store.getState().updateProject(withFit('fit'));
    const snap = store.getState().beginSave()!;

    store
      .getState()
      .updateProject((p) => ({ ...p, canvas: { ...p.canvas, background: '#ff0000' } }));
    store.getState().saveSucceeded(snap, 2);

    const s = store.getState();
    expect(isDirty(s)).toBe(true);
    expect(s.saveStatus).toBe('idle');
    const next = s.beginSave()!;
    expect(next.data?.canvas.background).toBe('#ff0000');
    expect(next.expectedRevision).toBe(2);
  });

  it('does not start a second save while one is in flight', () => {
    const store = setup();
    store.getState().updateProject(withFit('fit'));
    store.getState().beginSave();
    store.getState().updateProject(withFit('fill'));
    expect(store.getState().beginSave()).toBeNull();
  });

  it('saves a title-only change without data and keeps the local revision', () => {
    const store = setup();
    store.getState().setTitle('  New name  ');
    const snap = store.getState().beginSave()!;
    expect(snap).toMatchObject({ title: 'New name', data: undefined });
    expect(snapshotToBody(snap)).toEqual({ title: 'New name' });

    // Server reports a newer revision (another tab saved data): don't adopt it.
    store.getState().saveSucceeded(snap, 7);
    expect(store.getState().revision).toBe(1);
    expect(store.getState().savedTitle).toBe('New name');
    expect(isDirty(store.getState())).toBe(false);
  });

  it('does not send an empty title', () => {
    const store = setup();
    store.getState().setTitle('   ');
    expect(store.getState().beginSave()).toBeNull();
    expect(isDirty(store.getState())).toBe(true);
  });

  it('records errors and allows a retry', () => {
    const store = setup();
    store.getState().updateProject(withFit('fit'));
    store.getState().beginSave();
    store.getState().saveFailed('offline');
    expect(store.getState()).toMatchObject({ saveStatus: 'error', saveError: 'offline' });
    expect(isDirty(store.getState())).toBe(true);
    expect(store.getState().beginSave()).not.toBeNull();
  });

  it('blocks saving on conflict until overwrite, then re-sends on the server revision', () => {
    const store = setup();
    store.getState().updateProject(withFit('fit'));
    store.getState().beginSave();
    store.getState().saveConflicted(5);
    expect(store.getState()).toMatchObject({ saveStatus: 'conflict', conflictRevision: 5 });
    expect(store.getState().beginSave()).toBeNull();

    store.getState().overwriteConflict(5);
    const snap = store.getState().beginSave()!;
    expect(snap.expectedRevision).toBe(5);
    expect(snap.data?.canvas.fit).toBe('fit');
  });

  it('replaceFromServer discards local changes', () => {
    const store = setup();
    store.getState().updateProject(withFit('fit'));
    store.getState().beginSave();
    store.getState().saveConflicted(3);

    const server = createEmptyProject();
    store.getState().replaceFromServer({ id: 'p1', title: 'Theirs', project: server, revision: 3 });
    const s = store.getState();
    expect(s).toMatchObject({ title: 'Theirs', revision: 3, saveStatus: 'saved' });
    expect(s.project.canvas.fit).toBe('fill');
    expect(isDirty(s)).toBe(false);
  });
});
