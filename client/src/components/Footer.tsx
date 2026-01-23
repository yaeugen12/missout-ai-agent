import { Twitter } from "lucide-react";

// Medium icon (custom SVG since lucide doesn't have it)
const MediumIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
  </svg>
);

interface SocialLinkProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

function SocialLink({ href, icon: Icon, label }: SocialLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 px-4 py-2 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 transition-all duration-200"
      aria-label={label}
    >
      <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
      <span className="text-sm font-tech text-muted-foreground group-hover:text-white transition-colors">
        {label}
      </span>
    </a>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/50 backdrop-blur-sm mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo and tagline */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-primary blur opacity-50" />
              <div className="relative h-8 w-8 bg-black border border-primary flex items-center justify-center">
                <div className="w-2 h-2 bg-primary rounded-full" />
              </div>
            </div>
            <div>
              <div className="text-xl font-display font-bold text-white tracking-widest">
                MISSOUT
              </div>
              <div className="text-xs text-muted-foreground font-tech">
                Turn volatility into victory
              </div>
            </div>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-3">
            <SocialLink
              href="/socials"
              icon={Twitter}
              label="X / Twitter"
            />
            <SocialLink
              href="/blog"
              icon={MediumIcon}
              label="Medium"
            />
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-muted-foreground font-mono">
            © {new Date().getFullYear()} MissOut. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
