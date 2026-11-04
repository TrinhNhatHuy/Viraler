'use client';

import type { CaptionStyle } from '@viraler/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setCaptionStyle } from '@/lib/captions/edit';
import { applyCaptionPreset, CAPTION_PRESETS } from '@/lib/captions/presets';
import { useEditorStore } from './editor-store-provider';
import {
  ColorField,
  SliderField,
  StyleGroup,
  SwitchField,
  TextStyleFields,
} from './text-style-fields';

const HIGHLIGHT_LABELS: Record<CaptionStyle['highlightMode'], string> = {
  color: 'Color the spoken word',
  box: 'Box behind the spoken word',
  karaoke: 'Karaoke (color words as spoken)',
  none: 'No highlight',
};

export function CaptionStyleForm() {
  const style = useEditorStore((s) => s.project.captions.style);
  const updateProject = useEditorStore((s) => s.updateProject);
  // One undo step per control while it's being dragged/picked.
  const set = (patch: Partial<CaptionStyle>) =>
    updateProject((p) => setCaptionStyle(p, patch), {
      key: `caption-style:${Object.keys(patch).join(',')}`,
    });

  return (
    <section className="grid gap-4">
      <h3 className="text-sm font-semibold">Look</h3>
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Caption presets">
        {CAPTION_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            variant="outline"
            onClick={() => updateProject((p) => applyCaptionPreset(p, preset.id))}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="caption-highlight">Highlight</Label>
        <Select
          items={HIGHLIGHT_LABELS}
          value={style.highlightMode}
          onValueChange={(v) => {
            if (typeof v === 'string' && v in HIGHLIGHT_LABELS) {
              set({ highlightMode: v as CaptionStyle['highlightMode'] });
            }
          }}
        >
          <SelectTrigger id="caption-highlight" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(HIGHLIGHT_LABELS) as CaptionStyle['highlightMode'][]).map((m) => (
              <SelectItem key={m} value={m}>
                {HIGHLIGHT_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SwitchField
        label="Pop the spoken word"
        checked={style.animation === 'pop'}
        onChange={(on) => set({ animation: on ? 'pop' : 'none' })}
      />
      <SliderField
        label="Words per line"
        value={style.maxWordsPerLine}
        min={1}
        max={6}
        onChange={(maxWordsPerLine) => set({ maxWordsPerLine })}
      />
      <SwitchField
        label="Two lines"
        checked={style.maxLines === 2}
        onChange={(on) => set({ maxLines: on ? 2 : 1 })}
      />

      <StyleGroup>
        <TextStyleFields
          style={style}
          onChange={set}
          sizeRange={[32, 140]}
          extraColors={
            <ColorField
              label="Highlight"
              value={style.highlightColor}
              onChange={(highlightColor) => set({ highlightColor })}
            />
          }
        />
      </StyleGroup>
    </section>
  );
}
