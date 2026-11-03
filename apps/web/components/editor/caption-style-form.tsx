'use client';

import type { CaptionStyle } from '@viraler/shared';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { setCaptionStyle } from '@/lib/captions/edit';
import { toColorInputValue } from './canvas-settings';
import { useEditorStore } from './editor-store-provider';

const sliderValue = (v: number | readonly number[]) => (typeof v === 'number' ? v : (v[0] ?? 0));

function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label id={id}>{props.label}</Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {props.format ? props.format(props.value) : props.value}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onValueChange={(v) => props.onChange(sliderValue(v))}
      />
    </div>
  );
}

function ColorField(props: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="grid justify-items-start gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {props.label}
      </Label>
      <input
        id={id}
        type="color"
        value={toColorInputValue(props.value)}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
      />
    </div>
  );
}

export function CaptionStyleForm() {
  const style = useEditorStore((s) => s.project.captions.style);
  const updateProject = useEditorStore((s) => s.updateProject);
  const set = (patch: Partial<CaptionStyle>) => updateProject((p) => setCaptionStyle(p, patch));
  const uppercaseId = useId();
  const backgroundId = useId();

  return (
    <section className="grid gap-4">
      <h3 className="text-sm font-semibold">Style</h3>
      <SliderField
        label="Size"
        value={style.fontSizePx}
        min={40}
        max={120}
        step={2}
        format={(v) => `${v}px`}
        onChange={(fontSizePx) => set({ fontSizePx })}
      />
      <SliderField
        label="Position"
        value={Math.round(style.positionY * 100)}
        min={10}
        max={90}
        format={(v) => `${v}% from top`}
        onChange={(v) => set({ positionY: v / 100 })}
      />
      <SliderField
        label="Words at a time"
        value={style.maxWordsPerLine}
        min={1}
        max={5}
        onChange={(maxWordsPerLine) => set({ maxWordsPerLine })}
      />
      <SliderField
        label="Outline"
        value={style.strokeWidthPx}
        min={0}
        max={16}
        format={(v) => (v === 0 ? 'Off' : `${v}px`)}
        onChange={(strokeWidthPx) => set({ strokeWidthPx })}
      />

      <div className="flex flex-wrap gap-4">
        <ColorField label="Text" value={style.color} onChange={(color) => set({ color })} />
        <ColorField
          label="Highlight"
          value={style.highlightColor}
          onChange={(highlightColor) => set({ highlightColor })}
        />
        <ColorField
          label="Outline"
          value={style.strokeColor}
          onChange={(strokeColor) => set({ strokeColor })}
        />
        {style.backgroundColor && (
          <ColorField
            label="Background"
            value={style.backgroundColor}
            onChange={(backgroundColor) => set({ backgroundColor })}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor={uppercaseId}>Uppercase</Label>
        <Switch
          id={uppercaseId}
          checked={style.uppercase}
          onCheckedChange={(uppercase) => set({ uppercase })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={backgroundId}>Background box</Label>
        <Switch
          id={backgroundId}
          checked={style.backgroundColor !== undefined}
          onCheckedChange={(on) => set({ backgroundColor: on ? '#000000' : undefined })}
        />
      </div>
    </section>
  );
}
