import { createEmptyProject, type Project } from '@viraler/shared';
import { describe, expect, it } from 'vitest';
import { createEditorStore, isDirty, snapshotToBody } from './editor-store';

const setup = () =>
  createEditorStore({
    id: 'p1',
    userId: 'u1',
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
    store
      .getState()
      .replaceFromServer({ id: 'p1', userId: 'u1', title: 'Theirs', project: server, revision: 3 });
    const s = store.getState();
    expect(s).toMatchObject({ title: 'Theirs', revision: 3, saveStatus: 'saved' });
    expect(s.project.canvas.fit).toBe('fill');
    expect(isDirty(s)).toBe(false);
  });
});

describe('undo / redo', () => {
  const withScript = (script: string) => (p: Project) => ({ ...p, script });

  function clocked() {
    let t = 0;
    const store = createEditorStore(
      { id: 'p1', userId: 'u1', title: 'Video', project: createEmptyProject(), revision: 1 },
      { now: () => t },
    );
    return { store, tick: (ms: number) => (t += ms) };
  }

  it('undoes and redoes each edit, marking the project dirty', () => {
    const { store } = clocked();
    const s = () => store.getState();
    s().updateProject(withFit('fit'));
    s().updateProject(withScript('hello'));
    const saved = s().beginSave()!;
    s().saveSucceeded(saved, 2);
    expect(isDirty(s())).toBe(false);

    s().undo();
    expect(s().project.script).toBe('');
    expect(s().project.canvas.fit).toBe('fit');
    expect(isDirty(s())).toBe(true);
    s().undo();
    expect(s().project.canvas.fit).toBe('fill');
    s().undo(); // nothing left
    expect(s().past).toHaveLength(0);

    s().redo();
    s().redo();
    expect(s().project).toMatchObject({ script: 'hello', canvas: { fit: 'fit' } });
    expect(s().future).toHaveLength(0);
  });

  it('merges same-key edits within a second', () => {
    const { store, tick } = clocked();
    const s = () => store.getState();
    s().updateProject(withScript('h'), { key: 'script' });
    tick(300);
    s().updateProject(withScript('he'), { key: 'script' });
    tick(300);
    s().updateProject(withScript('hey'), { key: 'script' });
    expect(s().past).toHaveLength(1);
    tick(1500);
    s().updateProject(withScript('hey!'), { key: 'script' });
    expect(s().past).toHaveLength(2);
    s().undo();
    expect(s().project.script).toBe('hey');
    s().undo();
    expect(s().project.script).toBe('');
  });

  it('does not merge different keys or unkeyed edits', () => {
    const { store } = clocked();
    const s = () => store.getState();
    s().updateProject(withScript('a'), { key: 'script' });
    s().updateProject(withFit('fit'), { key: 'fit' });
    s().updateProject(withScript('b'));
    s().updateProject(withScript('c'));
    expect(s().past).toHaveLength(4);
  });

  it('makes a gesture one step', () => {
    const { store } = clocked();
    const s = () => store.getState();
    s().beginGesture();
    s().updateProject(withScript('1'));
    s().updateProject(withScript('12'));
    s().updateProject(withScript('123'));
    s().endGesture();
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().project.script).toBe('');
  });

  it('clears redo on a new edit and caps the history', () => {
    const { store } = clocked();
    const s = () => store.getState();
    s().updateProject(withScript('a'));
    s().undo();
    expect(s().future).toHaveLength(1);
    s().updateProject(withScript('b'));
    expect(s().future).toHaveLength(0);

    for (let i = 0; i < 150; i++) s().updateProject(withScript(`x${i}`));
    expect(s().past).toHaveLength(100);
  });

  it('forgets history when the server copy replaces local state', () => {
    const { store } = clocked();
    store.getState().updateProject(withScript('a'));
    store.getState().replaceFromServer({
      id: 'p1',
      userId: 'u1',
      title: 'Video',
      project: createEmptyProject(),
      revision: 3,
    });
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().future).toHaveLength(0);
  });
});
