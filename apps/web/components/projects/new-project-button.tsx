'use client';

import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { createProjectRequest } from '@/lib/projects/client';

export function NewProjectButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [navigating, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setCreating(true);
    setError(null);
    const res = await createProjectRequest();
    setCreating(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    startTransition(() => router.push(`/projects/${res.value.id}`));
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={onClick} disabled={creating || navigating}>
        <PlusIcon />
        {creating || navigating ? 'Creating…' : 'New project'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
