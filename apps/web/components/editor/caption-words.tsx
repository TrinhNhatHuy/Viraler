'use client';

import { cn } from 'cn';
import { Trash2Icon } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteCaptionWord, editCaptionWord } from '@/lib/captions/edit';
import { formatTimecode } from '@/lib/format';
import { buildCaptionPages, captionFrameAt } from '@/lib/render/captions';
import { textMeasurer } from '@/lib/render/fonts';
import { useEditorStore, usePlayback, usePlaybackApi } from './editor-store-provider';

function subscribeFonts(onChange: () => void) {
  document.fonts?.addEventListener('loadingdone', onChange);
  return () => document.fonts?.removeEventListener('loadingdone', onChange);
}

/**
 * Caption words grouped the way the preview shows them. Click a word to jump
 * there and fix or delete it.
 */
export function CaptionWords() {
  const words = useEditorStore((s) => s.project.captions.words);
  const style = useEditorStore((s) => s.project.captions.style);
  const playback = usePlaybackApi();
  const positionMs = usePlayback((s) => s.positionMs);
  const [selected, setSelected] = useState<number | null>(null);

  // 'ssr' on the server and during hydration (no canvas to measure with), then the
  // font loading status, so pages are re-measured once the caption font is in.
  const fonts = useSyncExternalStore(
    subscribeFonts,
    () => document.fonts?.status ?? 'loaded',
    () => 'ssr',
  );
  const pages = useMemo(() => {
    const measure =
      fonts === 'ssr'
        ? (text: string) => text.length * style.fontSizePx * 0.6
        : textMeasurer(style);
    return buildCaptionPages(words, style, measure);
  }, [words, style, fonts]);
  const current = captionFrameAt(pages, positionMs)?.page;

  const select = (index: number) => {
    setSelected(index);
    playback.getState().seek(words[index]!.startMs);
  };

  const word = selected !== null ? words[selected] : undefined;

  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Words</h3>
        <span className="text-xs text-muted-foreground">{words.length} words · click to edit</span>
      </div>
      <div className="grid max-h-72 gap-0.5 overflow-y-auto rounded-lg border p-1.5">
        {pages.map((page) => (
          <div
            key={page.words[0]!.index}
            className={cn(
              'flex items-baseline gap-2 rounded px-1 py-0.5',
              page === current && 'bg-muted',
            )}
          >
            <span className="w-11 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
              {formatTimecode(page.startMs)}
            </span>
            <span className="flex flex-wrap gap-0.5">
              {page.words.map((w) => (
                <button
                  key={w.index}
                  type="button"
                  onClick={() => select(w.index)}
                  className={cn(
                    'rounded px-1 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    selected === w.index && 'bg-primary text-primary-foreground hover:bg-primary',
                  )}
                >
                  {words[w.index]!.text}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      {word && selected !== null && (
        <WordEditor
          // Remount when another word is picked or the text changes elsewhere.
          key={`${selected}:${word.text}`}
          index={selected}
          text={word.text}
          startMs={word.startMs}
          endMs={word.endMs}
          onDone={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function WordEditor(props: {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
  onDone: () => void;
}) {
  const updateProject = useEditorStore((s) => s.updateProject);
  const [draft, setDraft] = useState(props.text);

  const commit = () => {
    updateProject((p) => editCaptionWord(p, props.index, draft));
    if (!draft.trim()) props.onDone(); // cleared = deleted
  };

  return (
    <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Caption word"
          value={draft}
          autoFocus
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              props.onDone();
            } else if (e.key === 'Escape') {
              props.onDone();
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete word"
          // Keep the input's blur from saving the draft first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            updateProject((p) => deleteCaptionWord(p, props.index));
            props.onDone();
          }}
        >
          <Trash2Icon />
        </Button>
      </div>
      <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {formatTimecode(props.startMs)} – {formatTimecode(props.endMs)} · Enter to save, Esc to
        cancel. Timing edits come with the timeline.
      </p>
    </div>
  );
}
