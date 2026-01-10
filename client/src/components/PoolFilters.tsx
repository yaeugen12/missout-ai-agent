import { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { 
  Filter, 
  Search, 
  X, 
  ArrowUpDown,
  RotateCcw
} from "lucide-react";
import type { Pool } from "@/types/shared";

export type SortOption = "newest" | "largest" | "almost_full" | "lowest_entry" | "highest_entry";

export interface PoolFilterState {
  search: string;
  entryMin: string;
  entryMax: string;
  poolSizeMin: string;
  poolSizeMax: string;
  participantsMin: string;
  participantsMax: string;
  fillPercentage: number[];
  statusOpen: boolean;
  statusLocked: boolean;
  statusEnded: boolean;
  statusRefundable: boolean;
  sortBy: SortOption;
}

const defaultFilters: PoolFilterState = {
  search: "",
  entryMin: "",
  entryMax: "",
  poolSizeMin: "",
  poolSizeMax: "",
  participantsMin: "",
  participantsMax: "",
  fillPercentage: [0, 100],
  statusOpen: true,
  statusLocked: true,
  statusEnded: false,
  statusRefundable: false,
  sortBy: "newest"
};

interface PoolFiltersProps {
  pools: Pool[];
  onFilteredPoolsChange: (pools: Pool[]) => void;
}

export function PoolFilters({ pools, onFilteredPoolsChange }: PoolFiltersProps) {
  const [filters, setFilters] = useState<PoolFilterState>(defaultFilters);
  const [tempFilters, setTempFilters] = useState<PoolFilterState>(defaultFilters);
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.entryMin || filters.entryMax) count++;
    if (filters.poolSizeMin || filters.poolSizeMax) count++;
    if (filters.participantsMin || filters.participantsMax) count++;
    if (filters.fillPercentage[0] !== 0 || filters.fillPercentage[1] !== 100) count++;
    if (!filters.statusOpen || !filters.statusLocked || filters.statusEnded || filters.statusRefundable) count++;
    if (filters.sortBy !== "newest") count++;
    return count;
  }, [filters]);

  const applyFiltersAndSort = useCallback((filtersToApply: PoolFilterState, poolsToFilter: Pool[]) => {
    let result = [...poolsToFilter];

    if (filtersToApply.search) {
      const query = filtersToApply.search.toLowerCase();
      result = result.filter(p => 
        p.id.toString().includes(query) ||
        p.tokenSymbol.toLowerCase().includes(query) ||
        p.tokenName.toLowerCase().includes(query)
      );
    }

    if (filtersToApply.entryMin) {
      const min = parseFloat(filtersToApply.entryMin);
      if (!isNaN(min)) result = result.filter(p => p.entryAmount >= min);
    }
    if (filtersToApply.entryMax) {
      const max = parseFloat(filtersToApply.entryMax);
      if (!isNaN(max)) result = result.filter(p => p.entryAmount <= max);
    }

    if (filtersToApply.poolSizeMin) {
      const min = parseFloat(filtersToApply.poolSizeMin);
      if (!isNaN(min)) result = result.filter(p => (p.totalPot || 0) >= min);
    }
    if (filtersToApply.poolSizeMax) {
      const max = parseFloat(filtersToApply.poolSizeMax);
      if (!isNaN(max)) result = result.filter(p => (p.totalPot || 0) <= max);
    }

    if (filtersToApply.participantsMin) {
      const min = parseInt(filtersToApply.participantsMin);
      if (!isNaN(min)) result = result.filter(p => (p.participantsCount || 0) >= min);
    }
    if (filtersToApply.participantsMax) {
      const max = parseInt(filtersToApply.participantsMax);
      if (!isNaN(max)) result = result.filter(p => (p.participantsCount || 0) <= max);
    }

    const [minFill, maxFill] = filtersToApply.fillPercentage;
    if (minFill > 0 || maxFill < 100) {
      result = result.filter(p => {
        const fill = ((p.participantsCount || 0) / p.maxParticipants) * 100;
        return fill >= minFill && fill <= maxFill;
      });
    }

    const allowedStatuses: string[] = [];
    if (filtersToApply.statusOpen) allowedStatuses.push("open");
    if (filtersToApply.statusLocked) allowedStatuses.push("locked", "unlocking", "randomness_committed", "randomness_revealed");
    if (filtersToApply.statusEnded) allowedStatuses.push("winner_selected", "ended");
    if (filtersToApply.statusRefundable) allowedStatuses.push("cancelled");
    
    if (allowedStatuses.length > 0) {
      result = result.filter(p => allowedStatuses.includes(p.status));
    }

    switch (filtersToApply.sortBy) {
      case "newest":
        result.sort((a, b) => b.id - a.id);
        break;
      case "largest":
        result.sort((a, b) => (b.totalPot || 0) - (a.totalPot || 0));
        break;
      case "almost_full":
        result.sort((a, b) => {
          const fillA = ((a.participantsCount || 0) / a.maxParticipants) * 100;
          const fillB = ((b.participantsCount || 0) / b.maxParticipants) * 100;
          return fillB - fillA;
        });
        break;
      case "lowest_entry":
        result.sort((a, b) => a.entryAmount - b.entryAmount);
        break;
      case "highest_entry":
        result.sort((a, b) => b.entryAmount - a.entryAmount);
        break;
    }

    return result;
  }, []);

  useEffect(() => {
    const filtered = applyFiltersAndSort(filters, pools);
    onFilteredPoolsChange(filtered);
  }, [filters, pools, applyFiltersAndSort, onFilteredPoolsChange]);

  const handleApply = () => {
    setFilters(tempFilters);
    setIsOpen(false);
  };

  const handleReset = () => {
    setTempFilters(defaultFilters);
    setFilters(defaultFilters);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setTempFilters(filters);
    }
    setIsOpen(open);
  };

  const updateTempFilter = <K extends keyof PoolFilterState>(key: K, value: PoolFilterState[K]) => {
    setTempFilters(prev => ({ ...prev, [key]: value }));
  };

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "newest", label: "Newest First" },
    { value: "largest", label: "Largest Pool Size" },
    { value: "almost_full", label: "Almost Full" },
    { value: "lowest_entry", label: "Lowest Entry" },
    { value: "highest_entry", label: "Highest Entry" },
  ];

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search pools..."
          value={filters.search}
          onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          className="pl-9 bg-black/40 border-white/10 font-mono text-sm"
          data-testid="input-pool-search"
        />
      </div>

      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button 
            variant="outline" 
            className="gap-2 font-mono"
            data-testid="button-open-filters"
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] bg-black/95 border-white/10">
          <SheetHeader>
            <SheetTitle className="font-display text-white flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              Filter & Sort Pools
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
            <div className="space-y-3">
              <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <ArrowUpDown className="w-3 h-3" />
                Sort By
              </Label>
              <Select 
                value={tempFilters.sortBy} 
                onValueChange={(v) => updateTempFilter("sortBy", v as SortOption)}
              >
                <SelectTrigger className="bg-black/40 border-white/10" data-testid="select-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} data-testid={`sort-option-${opt.value}`}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-white/10" />

            <div className="space-y-3">
              <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Pool Status
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={tempFilters.statusOpen}
                    onCheckedChange={(c) => updateTempFilter("statusOpen", !!c)}
                    data-testid="checkbox-status-open"
                  />
                  <span className="text-sm text-white">Open</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={tempFilters.statusLocked}
                    onCheckedChange={(c) => updateTempFilter("statusLocked", !!c)}
                    data-testid="checkbox-status-locked"
                  />
                  <span className="text-sm text-white">Locked / Full</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={tempFilters.statusEnded}
                    onCheckedChange={(c) => updateTempFilter("statusEnded", !!c)}
                    data-testid="checkbox-status-ended"
                  />
                  <span className="text-sm text-white">Finished</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={tempFilters.statusRefundable}
                    onCheckedChange={(c) => updateTempFilter("statusRefundable", !!c)}
                    data-testid="checkbox-status-refundable"
                  />
                  <span className="text-sm text-white">Refundable</span>
                </label>
              </div>
            </div>

            <Separator className="bg-white/10" />

            <div className="space-y-3">
              <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Entry Amount
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={tempFilters.entryMin}
                    onChange={(e) => updateTempFilter("entryMin", e.target.value)}
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    data-testid="input-entry-min"
                  />
                </div>
                <span className="text-muted-foreground self-center">-</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Max"
                    value={tempFilters.entryMax}
                    onChange={(e) => updateTempFilter("entryMax", e.target.value)}
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    data-testid="input-entry-max"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Total Pool Size
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={tempFilters.poolSizeMin}
                    onChange={(e) => updateTempFilter("poolSizeMin", e.target.value)}
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    data-testid="input-poolsize-min"
                  />
                </div>
                <span className="text-muted-foreground self-center">-</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Max"
                    value={tempFilters.poolSizeMax}
                    onChange={(e) => updateTempFilter("poolSizeMax", e.target.value)}
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    data-testid="input-poolsize-max"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Participants Joined
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={tempFilters.participantsMin}
                    onChange={(e) => updateTempFilter("participantsMin", e.target.value)}
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    data-testid="input-participants-min"
                  />
                </div>
                <span className="text-muted-foreground self-center">-</span>
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="Max"
                    value={tempFilters.participantsMax}
                    onChange={(e) => updateTempFilter("participantsMax", e.target.value)}
                    className="bg-black/40 border-white/10 font-mono text-sm"
                    data-testid="input-participants-max"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Fill Percentage
                </Label>
                <span className="text-xs font-mono text-primary">
                  {tempFilters.fillPercentage[0]}% - {tempFilters.fillPercentage[1]}%
                </span>
              </div>
              <Slider
                value={tempFilters.fillPercentage}
                onValueChange={(v) => updateTempFilter("fillPercentage", v as number[])}
                min={0}
                max={100}
                step={5}
                className="py-2"
                data-testid="slider-fill-percentage"
              />
            </div>
          </div>

          <SheetFooter className="mt-6 flex gap-2">
            <Button 
              variant="ghost" 
              onClick={handleReset}
              className="flex-1 gap-2"
              data-testid="button-reset-filters"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
            <Button 
              onClick={handleApply}
              className="flex-1 gap-2"
              data-testid="button-apply-filters"
            >
              Apply Filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {activeFilterCount > 0 && (
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleReset}
          className="text-muted-foreground"
          data-testid="button-clear-filters"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
