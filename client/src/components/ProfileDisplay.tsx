import { useProfile, generateDicebearUrl, shortenWallet } from "@/hooks/use-profile";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfileDisplayProps {
  walletAddress: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

const textSizes = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function ProfileDisplay({ 
  walletAddress, 
  size = "md", 
  showName = true,
  className = ""
}: ProfileDisplayProps) {
  const { data: profile, isLoading } = useProfile(walletAddress);
  
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Skeleton className={`rounded-full ${sizeClasses[size]}`} />
        {showName && <Skeleton className="h-4 w-20" />}
      </div>
    );
  }
  
  const displayName = profile?.displayName || shortenWallet(walletAddress);
  const displayAvatar = profile?.displayAvatar || generateDicebearUrl(walletAddress);
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={displayAvatar} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {showName && (
        <span className={`font-medium text-white truncate max-w-[120px] ${textSizes[size]}`}>
          {displayName}
        </span>
      )}
    </div>
  );
}

export function ProfileAvatar({ 
  walletAddress, 
  size = "md",
  className = ""
}: Omit<ProfileDisplayProps, "showName">) {
  return <ProfileDisplay walletAddress={walletAddress} size={size} showName={false} className={className} />;
}
