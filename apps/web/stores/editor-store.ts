import type { Project, UpdateProjectBody } from '@viraler/shared';
import { createStore } from 'zustand/vanilla';

/**
 * Editor state for one open project. Created per page (see EditorStoreProvider),
 * never as a module singleton, so SSR requests never share state.
 *
 * Dirty tracking uses sequence numbers: every edit bumps `changeSeq` and records
 * it in `titleSeq` / `dataSeq`. A save snapshots the current seq; when it
 * succeeds only edits up to that seq count as saved, so edits made while a save
 * is in flight stay dirty.
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface EditorInit {
  id: string;
  title: string;
  project: Project;
  revision: number;
}

export interface SaveSnapshot {
  seq: number;
  title?: string;
  data?: Project;
  /** Revision the data edits are based on. */
  expectedRevision: number;
}

export interface EditorState {
  id: string;
  title: string;
  /** Last title confirmed by the server (used to revert an emptied title). */
  savedTitle: string;
  project: Project;
  revision: number;

  changeSeq: number;
  titleSeq: number;
  dataSeq: number;
  savedTitleSeq: number;
  savedDataSeq: number;

  saveStatus: SaveStatus;
  saveError: string | null;
  /** Server revision reported by the last 409. */
  conflictRevision: number | null;

  setTitle(title: string): void;
  updateProject(recipe: (project: Project) => Project): void;
  /** Returns what needs saving and marks the store as saving, or null if nothing is savable. */
  beginSave(): SaveSnapshot | null;
  saveSucceeded(snapshot: SaveSnapshot, revision: number): void;
  saveFailed(message: string): void;
  saveConflicted(revision: number): void;
  /** Keep local changes and base them on the server's current revision (next save overwrites). */
  overwriteConflict(serverRevision: number): void;
  /** Discard local state and load the server's copy. */
  replaceFromServer(init: EditorInit): void;
}

export const isTitleDirty = (s: EditorState) => s.titleSeq > s.savedTitleSeq;
export const isDataDirty = (s: EditorState) => s.dataSeq > s.savedDataSeq;
export const isDirty = (s: EditorState) => isTitleDirty(s) || isDataDirty(s);

/** Request body for a snapshot. */
export function snapshotToBody(s: SaveSnapshot): UpdateProjectBody {
  return s.data !== undefined
    ? { title: s.title, data: s.data, expectedRevision: s.expectedRevision }
    : { title: s.title };
}

function initialState(init: EditorInit) {
  return {
    id: init.id,
    title: init.title,
    savedTitle: init.title,
    project: init.project,
    revision: init.revision,
    changeSeq: 0,
    titleSeq: 0,
    dataSeq: 0,
    savedTitleSeq: 0,
    savedDataSeq: 0,
    saveStatus: 'idle' as SaveStatus,
    saveError: null,
    conflictRevision: null,
  };
}

export function createEditorStore(init: EditorInit) {
  return createStore<EditorState>()((set, get) => ({
    ...initialState(init),

    setTitle(title) {
      if (title === get().title) return;
      set((s) => ({ title, changeSeq: s.changeSeq + 1, titleSeq: s.changeSeq + 1 }));
    },

    updateProject(recipe) {
      const next = recipe(get().project);
      if (next === get().project) return;
      set((s) => ({ project: next, changeSeq: s.changeSeq + 1, dataSeq: s.changeSeq + 1 }));
    },

    beginSave() {
      const s = get();
      if (s.saveStatus === 'saving' || s.saveStatus === 'conflict') return null;
      const trimmed = s.title.trim();
      const sendTitle = isTitleDirty(s) && trimmed.length > 0;
      const sendData = isDataDirty(s);
      if (!sendTitle && !sendData) return null;

      set({ saveStatus: 'saving', saveError: null });
      return {
        seq: s.changeSeq,
        title: sendTitle ? trimmed : undefined,
        data: sendData ? s.project : undefined,
        expectedRevision: s.revision,
      };
    },

    saveSucceeded(snapshot, revision) {
      set((s) => {
        const next: Partial<EditorState> = { saveError: null, conflictRevision: null };
        if (snapshot.title !== undefined) {
          next.savedTitleSeq = Math.max(s.savedTitleSeq, snapshot.seq);
          next.savedTitle = snapshot.title;
        }
        if (snapshot.data !== undefined) {
          next.savedDataSeq = Math.max(s.savedDataSeq, snapshot.seq);
          // Only adopt the revision when we sent data: a title-only save returns the
          // current revision, which may include another tab's data we haven't seen.
          next.revision = revision;
        }
        const merged = { ...s, ...next };
        next.saveStatus = isDirty(merged) ? 'idle' : 'saved';
        return next;
      });
    },

    saveFailed(message) {
      set({ saveStatus: 'error', saveError: message });
    },

    saveConflicted(revision) {
      set({ saveStatus: 'conflict', conflictRevision: revision, saveError: null });
    },

    overwriteConflict(serverRevision) {
      set((s) => ({
        revision: serverRevision,
        saveStatus: 'idle',
        conflictRevision: null,
        // Force the full document to be re-sent on top of the server revision.
        changeSeq: s.changeSeq + 1,
        dataSeq: s.changeSeq + 1,
      }));
    },

    replaceFromServer(next) {
      set({ ...initialState(next), saveStatus: 'saved' });
    },
  }));
}

export type EditorStore = ReturnType<typeof createEditorStore>;
