'use client';

import type { HookTitle, Ranking, TextStyle } from '@viraler/shared';
import { AudioLinesIcon, ListOrderedIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatTimecode } from '@/lib/format';
import {
  MAX_RANK,
  numberClips,
  RANK_LABEL_MAX,
  setClipLabel,
  setClipRank,
} from '@/lib/ranking/edit';
import { type SyncResult, syncRanksToVoiceover } from '@/lib/ranking/sync';
import { patchTextStyle } from '@/lib/text-style';
import { useEditorStore, useEditorStoreApi } from './editor-store-provider';
import { ColorField, StyleGroup, SwitchField, TextStyleFields } from './text-style-fields';

const HOOK_TEXT_MAX = 120;
const RANKING_TITLE_MAX = 100;
const LAYOUT_LABELS: Record<Ranking['layout'], string> = {
  badge: 'Badge (current rank)',
  list: 'Countdown list (all ranks)',
};
const ORDER_LABELS: Record<Ranking['order'], string> = {
  descending: 'Countdown (highest first)',
  ascending: 'Count up (1 first)',
};

/** Hook title and ranking overlays (styling comes in Phase 7). */
export function OverlaysPanel() {
  return (
    <div className="grid gap-6">
      <HookTitleSection />
      <RankingSection />
    </div>
  );
}

function HookTitleSection() {
  const hook = useEditorStore((s) => s.project.hookTitle);
  const updateProject = useEditorStore((s) => s.updateProject);
  const id = useId();
  const set = (patch: Partial<HookTitle>, key?: string) =>
    updateProject(
      (p) => ({ ...p, hookTitle: { ...p.hookTitle, ...patch } }),
      key ? { key } : undefined,
    );

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Hook title</h2>
        <Switch
          aria-label="Show hook title"
          checked={hook.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
      </div>
      <Textarea
        id={`${id}-text`}
        aria-label="Hook title text"
        placeholder="e.g. You won't believe #1"
        value={hook.text}
        maxLength={HOOK_TEXT_MAX}
        rows={2}
        onChange={(e) => set({ text: e.target.value, enabled: true }, 'hook-text')}
        className="min-h-0 resize-none text-sm"
      />
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label id={`${id}-dur`}>Shown for</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {(hook.durationMs / 1000).toFixed(1)} s
          </span>
        </div>
        <Slider
          aria-labelledby={`${id}-dur`}
          min={1000}
          max={10_000}
          step={500}
          value={hook.durationMs}
          onValueChange={(v) =>
            set({ durationMs: typeof v === 'number' ? v : (v[0] ?? 3000) }, 'hook-duration')
          }
        />
      </div>
      <SwitchField
        label="Pop in"
        checked={hook.entrance === 'pop'}
        onChange={(on) => set({ entrance: on ? 'pop' : 'none' })}
      />
      <StyleGroup>
        <TextStyleFields
          style={hook.style}
          onChange={(patch) =>
            set(
              { style: patchTextStyle(hook.style, patch) },
              `hook-style:${Object.keys(patch).join(',')}`,
            )
          }
        />
      </StyleGroup>
    </section>
  );
}

function RankingSection() {
  const ranking = useEditorStore((s) => s.project.ranking);
  const clips = useEditorStore((s) => s.project.clips);
  const updateProject = useEditorStore((s) => s.updateProject);
  const id = useId();
  const store = useEditorStoreApi();
  const [sync, setSync] = useState<SyncResult | null>(null);
  const set = (patch: Partial<Ranking>, key?: string) =>
    updateProject(
      (p) => ({ ...p, ranking: { ...p.ranking, ...patch } }),
      key ? { key } : undefined,
    );
  const setStyle = (which: 'titleStyle' | 'labelStyle', patch: Partial<TextStyle>) =>
    updateProject(
      (p) => ({
        ...p,
        ranking: { ...p.ranking, [which]: patchTextStyle(p.ranking[which], patch) },
      }),
      { key: `ranking-${which}:${Object.keys(patch).join(',')}` },
    );

  const runSync = () => {
    const result = syncRanksToVoiceover(store.getState().project);
    setSync(result);
    if (result.kind === 'ok') updateProject((p) => ({ ...p, clips: result.clips }));
  };

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Ranking</h2>
        <Switch
          aria-label="Show ranking overlays"
          checked={ranking.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
      </div>
      <Input
        aria-label="Ranking title"
        placeholder="e.g. Fastest animals on Earth"
        value={ranking.title}
        maxLength={RANKING_TITLE_MAX}
        onChange={(e) => set({ title: e.target.value }, 'ranking-title')}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-order`}>Order</Label>
        <Select
          items={ORDER_LABELS}
          value={ranking.order}
          onValueChange={(v) => {
            if (v === 'descending' || v === 'ascending') set({ order: v });
          }}
        >
          <SelectTrigger id={`${id}-order`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ORDER_LABELS) as Ranking['order'][]).map((o) => (
              <SelectItem key={o} value={o}>
                {ORDER_LABELS[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-layout`}>Layout</Label>
        <Select
          items={LAYOUT_LABELS}
          value={ranking.layout}
          onValueChange={(v) => {
            if (v === 'badge' || v === 'list') set({ layout: v });
          }}
        >
          <SelectTrigger id={`${id}-layout`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LAYOUT_LABELS) as Ranking['layout'][]).map((l) => (
              <SelectItem key={l} value={l}>
                {LAYOUT_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SwitchField
        label="Pop in"
        checked={ranking.entrance === 'pop'}
        onChange={(on) => set({ entrance: on ? 'pop' : 'none' })}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={clips.length === 0}
          onClick={() =>
            updateProject((p) => ({
              ...p,
              ranking: { ...p.ranking, enabled: true },
              clips: numberClips(p.clips, p.ranking.order),
            }))
          }
        >
          <ListOrderedIcon /> Number clips
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!clips.some((c) => c.rank !== undefined)}
          onClick={runSync}
          title='Start each ranked clip where "Number N" is said'
        >
          <AudioLinesIcon /> Sync to voice
        </Button>
      </div>
      {sync && <SyncReport result={sync} />}

      <StyleGroup title="Title style">
        <TextStyleFields
          style={ranking.titleStyle}
          onChange={(patch) => setStyle('titleStyle', patch)}
        />
      </StyleGroup>
      <StyleGroup title={ranking.layout === 'list' ? 'List style' : 'Rank style'}>
        <TextStyleFields
          style={ranking.labelStyle}
          onChange={(patch) => setStyle('labelStyle', patch)}
          extraColors={
            <ColorField
              label="Rank"
              value={ranking.rankColor}
              onChange={(rankColor) => set({ rankColor }, 'ranking-rank-color')}
            />
          }
        />
      </StyleGroup>

      {clips.length === 0 ? (
        <p className="text-xs text-muted-foreground">Add clips to the timeline to rank them.</p>
      ) : (
        <ol className="grid gap-1.5">
          {clips.map((clip, i) => (
            <li key={clip.id} className="grid grid-cols-[3.25rem_3.5rem_1fr] items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {i + 1}. {formatTimecode(clip.startMs)}
              </span>
              <Input
                aria-label={`Rank of clip ${i + 1}`}
                type="number"
                min={1}
                max={MAX_RANK}
                placeholder="#"
                value={clip.rank ?? ''}
                onChange={(e) => {
                  const rank = e.target.value === '' ? undefined : Number(e.target.value);
                  updateProject((p) => ({ ...p, clips: setClipRank(p.clips, clip.id, rank) }), {
                    key: `clip-rank:${clip.id}`,
                  });
                }}
                className="h-7 px-1.5 text-xs"
              />
              <Input
                aria-label={`Label of clip ${i + 1}`}
                placeholder="Label"
                value={clip.label ?? ''}
                maxLength={RANK_LABEL_MAX}
                onChange={(e) =>
                  updateProject(
                    (p) => ({ ...p, clips: setClipLabel(p.clips, clip.id, e.target.value) }),
                    {
                      key: `clip-label:${clip.id}`,
                    },
                  )
                }
                className="h-7 text-xs"
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SyncReport({ result }: { result: SyncResult }) {
  if (result.kind === 'error') {
    return (
      <p className="text-xs text-destructive" role="alert">
        {result.message}
      </p>
    );
  }
  return (
    <div className="grid gap-1 text-xs" role="status">
      <p className="text-muted-foreground">
        Synced {result.found.map((r) => `#${r}`).join(', ')} to the voiceover.
      </p>
      {result.missing.length > 0 && (
        <p className="text-amber-700 dark:text-amber-400">
          Not found in the captions: {result.missing.map((r) => `#${r}`).join(', ')}.
        </p>
      )}
      {result.shortfalls.map((s) => (
        <p key={`${s.rank}-${s.needMs}`} className="text-amber-700 dark:text-amber-400">
          {s.rank === null ? 'The intro' : `#${s.rank}`} needs {(s.needMs / 1000).toFixed(1)} s of
          footage but has {(s.haveMs / 1000).toFixed(1)} s: add a clip or a longer video.
        </p>
      ))}
    </div>
  );
}
