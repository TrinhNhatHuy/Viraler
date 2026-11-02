'use client';

import { SCRIPT_MAX_CHARS } from '@viraler/shared';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { countWords, estimateDurationMs, formatDuration } from '@/lib/script/stats';
import { cn } from '@/lib/utils';
import { useEditorStore } from './editor-store-provider';

export function ScriptPanel() {
  const script = useEditorStore((s) => s.project.script);
  const updateProject = useEditorStore((s) => s.updateProject);

  const words = countWords(script);
  const nearLimit = script.length > SCRIPT_MAX_CHARS * 0.9;

  return (
    <section className="grid gap-2">
      <Label htmlFor="script" className="text-sm font-semibold">
        Script
      </Label>
      <Textarea
        id="script"
        value={script}
        maxLength={SCRIPT_MAX_CHARS}
        onChange={(e) => updateProject((p) => ({ ...p, script: e.target.value }))}
        placeholder="Write what the voiceover should say…"
        className="min-h-48 resize-y text-sm leading-relaxed"
      />
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground" aria-live="polite">
        <span className={cn(nearLimit && 'text-amber-600 dark:text-amber-400')}>
          {script.length.toLocaleString()} / {SCRIPT_MAX_CHARS.toLocaleString()}
        </span>
        <span>{words.toLocaleString()} words</span>
        <span>≈ {formatDuration(estimateDurationMs(words))} spoken</span>
      </p>
    </section>
  );
}
