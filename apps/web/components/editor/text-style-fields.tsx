'use client';

import { TEXT_FONTS, type TextStyle } from '@viraler/shared';
import { cn } from 'cn';
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
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
import { resolveFontFamily } from '@/lib/render/fonts';
import { toColorInputValue } from './canvas-settings';

const sliderValue = (v: number | readonly number[]) => (typeof v === 'number' ? v : (v[0] ?? 0));

export function SliderField(props: {
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

export function ColorField(props: { label: string; value: string; onChange: (v: string) => void }) {
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

export function SwitchField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id}>{props.label}</Label>
      <Switch id={id} checked={props.checked} onCheckedChange={props.onChange} />
    </div>
  );
}

const FONT_ITEMS = Object.fromEntries(TEXT_FONTS.map((f) => [f.id, f.id]));
const ALIGNS = [
  { value: 'left', icon: AlignLeftIcon, label: 'Align left' },
  { value: 'center', icon: AlignCenterIcon, label: 'Align center' },
  { value: 'right', icon: AlignRightIcon, label: 'Align right' },
] as const;

/**
 * Font, size, position, alignment, case, colors, outline and background box:
 * the controls every on-video text shares (captions, hook title, ranking).
 */
export function TextStyleFields({
  style,
  onChange,
  sizeRange = [24, 160],
  extraColors,
}: {
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  sizeRange?: [number, number];
  /** More color pickers to show next to Text / Outline (e.g. highlight). */
  extraColors?: React.ReactNode;
}) {
  const fontId = useId();
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={fontId}>Font</Label>
        <Select
          items={FONT_ITEMS}
          value={style.fontFamily}
          onValueChange={(v) => {
            if (typeof v === 'string') onChange({ fontFamily: v });
          }}
        >
          <SelectTrigger id={fontId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEXT_FONTS.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                <span style={{ fontFamily: resolveFontFamily(f.id), fontWeight: f.weight }}>
                  {f.id}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SliderField
        label="Size"
        value={style.fontSizePx}
        min={sizeRange[0]}
        max={sizeRange[1]}
        step={2}
        format={(v) => `${v}px`}
        onChange={(fontSizePx) => onChange({ fontSizePx })}
      />
      <SliderField
        label="Position"
        value={Math.round(style.positionY * 100)}
        min={5}
        max={95}
        format={(v) => `${v}% from top`}
        onChange={(v) => onChange({ positionY: v / 100 })}
      />
      <div className="flex items-center justify-between">
        <Label>Align</Label>
        <div className="flex gap-0.5" role="group" aria-label="Alignment">
          {ALIGNS.map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              size="icon-sm"
              variant={style.align === value ? 'secondary' : 'ghost'}
              aria-label={label}
              aria-pressed={style.align === value}
              onClick={() => onChange({ align: value })}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </div>
      <SliderField
        label="Outline"
        value={style.strokeWidthPx}
        min={0}
        max={16}
        format={(v) => (v === 0 ? 'Off' : `${v}px`)}
        onChange={(strokeWidthPx) => onChange({ strokeWidthPx })}
      />
      <div className={cn('flex flex-wrap gap-4')}>
        <ColorField label="Text" value={style.color} onChange={(color) => onChange({ color })} />
        {extraColors}
        <ColorField
          label="Outline"
          value={style.strokeColor}
          onChange={(strokeColor) => onChange({ strokeColor })}
        />
        {style.backgroundColor && (
          <ColorField
            label="Background"
            value={style.backgroundColor}
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />
        )}
      </div>
      <SwitchField
        label="Uppercase"
        checked={style.uppercase}
        onChange={(uppercase) => onChange({ uppercase })}
      />
      <SwitchField
        label="Background box"
        checked={style.backgroundColor !== undefined}
        onChange={(on) => onChange({ backgroundColor: on ? '#000000' : undefined })}
      />
    </div>
  );
}

/** A collapsible "Style" group, so the sidebar stays short. */
export function StyleGroup({
  title = 'Style',
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border px-3 py-2">
      <summary className="cursor-pointer list-none text-sm font-medium select-none marker:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
