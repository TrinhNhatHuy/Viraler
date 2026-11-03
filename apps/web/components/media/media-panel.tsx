'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LibraryGrid } from './library-grid';
import { StockSearch } from './stock-search';

/** The editor's Media tab: your library and Pexels stock search. */
export function MediaPanel() {
  // Bumped when a stock item is saved, so the library shows it.
  const [libraryVersion, setLibraryVersion] = useState(0);
  return (
    <Tabs defaultValue="library" className="gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="library">Library</TabsTrigger>
        <TabsTrigger value="stock">Stock</TabsTrigger>
      </TabsList>
      {/* keepMounted: uploads in progress and search results survive switching tabs */}
      <TabsContent value="library" keepMounted>
        <LibraryGrid refreshKey={libraryVersion} />
      </TabsContent>
      <TabsContent value="stock" keepMounted>
        <StockSearch onSaved={() => setLibraryVersion((v) => v + 1)} />
      </TabsContent>
    </Tabs>
  );
}
