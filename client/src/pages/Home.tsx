import { useState, useCallback } from "react";
import { usePools } from "@/hooks/use-pools";
import { PoolCard } from "@/components/PoolCard";
import { PoolFilters } from "@/components/PoolFilters";
import { Button } from "@/components/ui/button";
import { Loader2, LayoutGrid, Atom } from "lucide-react";
import { Link } from "wouter";
import type { Pool } from "@shared/schema";
import { DevnetReadiness } from "@/components/DevnetReadiness";

export default function Home() {
  const { data: pools, isLoading, error } = usePools();
  const [filteredPools, setFilteredPools] = useState<Pool[]>([]);

  // Debugging pools data
  // console.log("[Home Debug] Pools Data:", pools);

  const handleFilteredPoolsChange = useCallback((filtered: Pool[]) => {
    // console.log("[Home Debug] Filtered Pools:", filtered);
    setFilteredPools(filtered);
  }, []);

  return (
    <div className="bg-grid-pattern">
      <main className="container mx-auto px-4 py-12">
        <DevnetReadiness />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
          <div>
            <h1 className="text-4xl md:text-6xl font-display font-black text-white mb-2 tracking-tight">
              POOL <span className="text-primary text-neon-cyan">TERMINAL</span>
            </h1>
            <p className="text-muted-foreground font-tech text-lg max-w-xl">
              View active black holes. Join the game. Winner takes all.
            </p>
          </div>
        </div>

        {!isLoading && !error && pools && pools.length > 0 && (
          <div className="mb-6">
            <PoolFilters 
              pools={pools} 
              onFilteredPoolsChange={handleFilteredPoolsChange} 
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 border border-destructive/50 bg-destructive/10 rounded-lg text-center">
            <LayoutGrid className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-bold text-destructive mb-2">SYSTEM ERROR</h3>
            <p className="text-muted-foreground">{(error as Error).message}</p>
          </div>
        ) : pools?.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-lg">
            <Atom className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-muted-foreground mb-4">NO ACTIVE BLACK HOLES</h3>
            <p className="text-muted-foreground mb-8">The void is empty. Initialize a new black hole from the menu.</p>
            <Link href="/initialize">
              <Button variant="outline" data-testid="link-initialize-empty">
                <Atom className="w-4 h-4 mr-2" />
                Initialize Black Hole
              </Button>
            </Link>
          </div>
        ) : filteredPools.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-lg">
            <LayoutGrid className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-muted-foreground mb-4">NO MATCHING POOLS</h3>
            <p className="text-muted-foreground mb-8">Try adjusting your filters to see more results.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPools.map((pool) => (
              <PoolCard key={pool.id} pool={pool} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
