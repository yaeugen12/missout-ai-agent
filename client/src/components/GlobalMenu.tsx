import { useState } from "react";
import { Link } from "wouter";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Menu,
  Atom,
  Terminal,
  LayoutGrid,
  Wallet,
  Gift,
  Trophy,
  Heart,
  HelpCircle,
  ChevronRight,
  ArrowUpFromLine
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MenuItemProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  onClose: () => void;
}

function MenuItem({ href, icon: Icon, label, description, onClose }: MenuItemProps) {
  const testId = `menu-link-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <Link href={href} onClick={onClose} data-testid={testId}>
      <div className="group flex items-center gap-3 px-3 py-2.5 rounded-md hover-elevate cursor-pointer">
        <div className="p-2 rounded-md bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-tech font-bold text-sm text-foreground group-hover:text-primary transition-colors">
            {label}
          </div>
          {description && (
            <div className="text-xs text-muted-foreground truncate">
              {description}
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

interface MenuSectionProps {
  title: string;
  children: React.ReactNode;
}

function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <div className="space-y-1">
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export function GlobalMenu() {
  const [open, setOpen] = useState(false);
  
  const handleClose = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="mr-2"
          data-testid="button-global-menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 bg-background/95 backdrop-blur-xl border-r border-white/10">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-primary blur opacity-50" />
              <div className="relative h-6 w-6 bg-black border border-primary flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-primary rounded-full" />
              </div>
            </div>
            <span className="text-lg font-display font-bold text-white tracking-widest">
              MISSOUT
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-4">
          <MenuSection title="Core">
            <MenuItem 
              href="/initialize" 
              icon={Atom} 
              label="Initialize Black Hole"
              description="Create a new lottery pool"
              onClose={handleClose}
            />
            <MenuItem 
              href="/discovery" 
              icon={Terminal} 
              label="Token Discovery (V2-soon)"
              description="Find new tokens to play"
              onClose={handleClose}
            />
            <MenuItem 
              href="/terminal" 
              icon={LayoutGrid} 
              label="Pool Terminal"
              description="View and join active pools"
              onClose={handleClose}
            />
          </MenuSection>

          <Separator className="bg-white/10" />

          <MenuSection title="User / Wallet">
            <MenuItem 
              href="/claims" 
              icon={ArrowUpFromLine} 
              label="Claim Center"
              description="Refunds and rent recovery"
              onClose={handleClose}
            />
            <MenuItem 
              href="/referrals" 
              icon={Gift} 
              label="Referral Rewards"
              description="Earnings and invited users"
              onClose={handleClose}
            />
            <MenuItem 
              href="/rewards" 
              icon={Trophy} 
              label="Hall of Fame"
              description="Top winners and stats"
              onClose={handleClose}
            />
          </MenuSection>

          <Separator className="bg-white/10" />

          <MenuSection title="Social">
            <MenuItem 
              href="/leaderboard" 
              icon={LayoutGrid} 
              label="Leaderboard"
              description="Top winners and referrers"
              onClose={handleClose}
            />
          </MenuSection>

          <Separator className="bg-white/10" />

          <MenuSection title="Help">
            <MenuItem 
              href="/how-it-works" 
              icon={HelpCircle} 
              label="How It Works"
              description="Learn about MissOut"
              onClose={handleClose}
            />
          </MenuSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
