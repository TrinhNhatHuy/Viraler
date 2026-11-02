'use client';

import { CopyIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { duplicateProjectRequest } from '@/lib/projects/client';
import { DeleteProjectDialog } from './delete-project-dialog';
import { RenameDialog } from './rename-dialog';

export function ProjectCard({
  id,
  title,
  editedLabel,
}: {
  id: string;
  title: string;
  editedLabel: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicating, startDuplicate] = useTransition();

  const duplicate = () =>
    startDuplicate(async () => {
      setError(null);
      const res = await duplicateProjectRequest(id);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });

  return (
    <div className="group relative" aria-busy={duplicating || undefined}>
      <Link
        href={`/projects/${id}`}
        className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="aspect-[9/16] rounded-lg bg-muted ring-1 ring-border transition group-hover:ring-foreground/30" />
        <div className="mt-2 pr-8">
          <p className="truncate text-sm font-medium" title={title}>
            {title}
          </p>
          <p className="text-xs text-muted-foreground">
            {duplicating ? 'Duplicating…' : editedLabel}
          </p>
        </div>
      </Link>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      <div className="absolute right-0 bottom-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${title}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialog('rename')}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={duplicate} disabled={duplicating}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDialog('delete')}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RenameDialog
        id={id}
        title={title}
        open={dialog === 'rename'}
        onOpenChange={(open) => setDialog(open ? 'rename' : null)}
      />
      <DeleteProjectDialog
        id={id}
        title={title}
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
      />
    </div>
  );
}
