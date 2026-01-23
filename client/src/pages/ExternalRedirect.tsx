import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ExternalRedirectProps {
  url: string;
  name: string;
}

export default function ExternalRedirect({ url, name }: ExternalRedirectProps) {
  useEffect(() => {
    // Redirect immediately
    window.location.href = url;
  }, [url]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
      <p className="text-muted-foreground font-tech">
        Redirecting to {name}...
      </p>
    </div>
  );
}
