import { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useMyProfile, useUpdateProfile, AVATAR_STYLES, generateDicebearUrl, type AvatarStyle } from "@/hooks/use-profile";
import { Loader2, Check, Upload, Trash2 } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditModal({ open, onOpenChange }: ProfileEditModalProps) {
  const { publicKey } = useWallet();
  const { data: profile } = useMyProfile();
  const updateProfile = useUpdateProfile();
  
  const [nickname, setNickname] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>("bottts");
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || "");
      setSelectedStyle((profile.avatarStyle as AvatarStyle) || "bottts");
      setCustomAvatarUrl(profile.avatarUrl || null);
    }
  }, [profile]);
  
  const validateNickname = (value: string) => {
    if (!value) {
      setNicknameError(null);
      return true;
    }
    if (value.length < 3) {
      setNicknameError("Nickname must be at least 3 characters");
      return false;
    }
    if (value.length > 20) {
      setNicknameError("Nickname must be 20 characters or less");
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setNicknameError("Only letters, numbers, and underscores allowed");
      return false;
    }
    setNicknameError(null);
    return true;
  };
  
  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNickname(value);
    validateNickname(value);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic validation
    if (!file.type.startsWith('image/')) {
      return;
    }
    if (file.size > 2 * 1024 * 1024) { // 2MB limit
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) throw new Error('Upload failed');
      
      const { url } = await res.json();
      setCustomAvatarUrl(url);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleSave = async () => {
    if (nickname && !validateNickname(nickname)) return;
    
    try {
      await updateProfile.mutateAsync({
        nickname: nickname || undefined,
        avatarStyle: selectedStyle,
        avatarUrl: customAvatarUrl || null,
      });
      onOpenChange(false);
    } catch (e) {
      console.error("Update profile failed:", e);
    }
  };
  
  const walletAddress = publicKey?.toBase58() || "";
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border-primary/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-tech text-primary">Edit Profile</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Customize how you appear to other players. Changes are saved instantly to your profile.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="nickname" className="text-sm text-muted-foreground">
              Nickname (optional)
            </Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={handleNicknameChange}
              placeholder="Enter a nickname..."
              className="bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
              maxLength={20}
            />
            {nicknameError && (
              <p className="text-xs text-red-400">{nicknameError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              3-20 characters. Letters, numbers, and underscores only. You can change your nickname twice instantly, then once every 48 hours.
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Avatar Selection</Label>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleFileUpload}
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] border-primary/30 hover:border-primary"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                Upload Logo
              </Button>
            </div>

            {customAvatarUrl ? (
              <div className="flex items-center gap-4 p-3 rounded-lg border-2 border-primary bg-primary/10">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={customAvatarUrl} className="object-cover" />
                  <AvatarFallback className="bg-white/5"><Upload className="w-6 h-6 text-muted-foreground" /></AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-xs font-tech text-primary uppercase">Custom Logo Active</p>
                  <p className="text-[10px] text-muted-foreground">Your uploaded image is being used</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-red-400"
                  onClick={() => setCustomAvatarUrl(null)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {AVATAR_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setSelectedStyle(style.id)}
                    className={clsx(
                      "relative p-1 rounded-lg border-2 transition-all",
                      selectedStyle === style.id
                        ? "border-primary bg-primary/10"
                        : "border-white/10 hover:border-white/30"
                    )}
                  >
                    <Avatar className="h-12 w-12 mx-auto">
                      <AvatarImage 
                        src={generateDicebearUrl(walletAddress, style.id)} 
                        alt={style.label}
                      />
                    </Avatar>
                    {selectedStyle === style.id && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-black" />
                      </div>
                    )}
                    <p className="text-[10px] text-center mt-1 text-muted-foreground">{style.label}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-muted-foreground mb-3">
              Preview:
            </p>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
              <Avatar className="h-10 w-10">
                <AvatarImage 
                  src={customAvatarUrl || generateDicebearUrl(walletAddress, selectedStyle)} 
                  className="object-cover"
                />
              </Avatar>
              <span className="font-medium">
                {nickname || `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending || !!nicknameError || isUploading}
            className="flex-1 bg-primary text-black hover:bg-primary/80"
          >
            {updateProfile.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
