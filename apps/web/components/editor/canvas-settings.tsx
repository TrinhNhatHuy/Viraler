'use client';

import type { Project } from '@viraler/shared';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEditorStore } from './editor-store-provider';

type Fit = Project['canvas']['fit'];

const FIT_LABELS: Record<Fit, string> = {
  fill: 'Fill (crop to 9:16)',
  fit: 'Fit (letterbox)',
};

/** `<input type="color">` only accepts #rrggbb. */
export function toColorInputValue(hex: string): string {
  const h = hex.toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  if (/^#[0-9a-f]{8}$/.test(h)) return h.slice(0, 7);
  if (/^#[0-9a-f]{3}$/.test(h)) return `#${[...h.slice(1)].map((c) => c + c).join('')}`;
  return '#000000';
}

export function CanvasSettings() {
  const fit = useEditorStore((s) => s.project.canvas.fit);
  const background = useEditorStore((s) => s.project.canvas.background);
  const updateProject = useEditorStore((s) => s.updateProject);

  const setCanvas = (patch: Partial<Project['canvas']>) =>
    updateProject((p) => ({ ...p, canvas: { ...p.canvas, ...patch } }));

  return (
    <section className="grid gap-4">
      <h2 className="text-sm font-semibold">Canvas</h2>
      <div className="grid gap-1.5">
        <Label htmlFor="canvas-fit">Media fit</Label>
        <Select
          items={FIT_LABELS}
          value={fit}
          onValueChange={(value) => {
            if (value === 'fill' || value === 'fit') setCanvas({ fit: value });
          }}
        >
          <SelectTrigger id="canvas-fit" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FIT_LABELS) as Fit[]).map((value) => (
              <SelectItem key={value} value={value}>
                {FIT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="canvas-background">Background</Label>
        <div className="flex items-center gap-2">
          <input
            id="canvas-background"
            type="color"
            value={toColorInputValue(background)}
            onChange={(e) => setCanvas({ background: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
          />
          <span className="font-mono text-sm text-muted-foreground">{background}</span>
        </div>
      </div>
    </section>
  );
}
