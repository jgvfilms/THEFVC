import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, apiRequestJson, assetUrl, getAuthToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Save, Camera, Image, Youtube, Link as LinkIcon, Trash2, Palette, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Profile } from "@shared/schema";

const ROLES = [
  "Director", "Producer", "Director of Photography", "Camera Operator", "1st AC", "2nd AC",
  "Gaffer", "Best Boy", "Sound Mixer", "Boom Operator", "Production Designer", "Art Director",
  "Editor", "Colorist", "Script Supervisor", "Production Coordinator", "Line Producer",
  "Wardrobe", "Makeup Artist", "Stunt Coordinator", "Actor", "Filmmaker",
];

const AVAILABILITY = [
  { value: "available", label: "Available" },
  { value: "booked", label: "Booked" },
  { value: "unavailable", label: "Unavailable" },
];

const THEME_PRESETS = [
  { value: "cinema_gold", label: "Cinema Gold", color: "#e8b339", bg: "from-amber-950/40 to-stone-950" },
  { value: "warm_sepia", label: "Warm Sepia", color: "#c87f3e", bg: "from-orange-950/40 to-stone-950" },
  { value: "noir_blue", label: "Noir Blue", color: "#5b8def", bg: "from-blue-950/40 to-slate-950" },
  { value: "forest_green", label: "Forest Green", color: "#4ade80", bg: "from-green-950/40 to-stone-950" },
  { value: "festival_red", label: "Festival Red", color: "#ef4444", bg: "from-red-950/40 to-stone-950" },
  { value: "mono_white", label: "Mono White", color: "#e4e4e7", bg: "from-zinc-800/40 to-zinc-950" },
];

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourname" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourname" },
  { key: "vimeo", label: "Vimeo", placeholder: "https://vimeo.com/yourname" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourname" },
  { key: "twitter", label: "X / Twitter", placeholder: "https://x.com/yourname" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/yourname" },
];

interface VideoLink {
  provider: string;
  url: string;
  title: string;
}

// PRD-006: Profile edit validation helpers
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// PRD-006: Profile completeness calculation
function getProfileCompleteness(current: Partial<Profile>, skills: string[]): { score: number; total: number; missing: string[] } {
  const checks = [
    { key: "displayName", label: "Display name", value: current.displayName },
    { key: "role", label: "Primary role", value: current.role },
    { key: "city", label: "Location", value: current.city },
    { key: "bio", label: "Bio", value: current.bio },
    { key: "dayRate", label: "Day rate", value: current.dayRate },
    { key: "skills", label: "Skills", value: skills.length > 0 ? skills : undefined },
    { key: "avatarUrl", label: "Profile photo", value: current.avatarUrl },
    { key: "availability", label: "Availability", value: current.availability },
  ];
  const completed = checks.filter((c) => c.value !== undefined && c.value !== null && c.value !== "");
  const missing = checks.filter((c) => !c.value).map((c) => c.label);
  return { score: completed.length, total: checks.length, missing };
}

export function ProfileEdit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSkill, setNewSkill] = useState("");
  const [form, setForm] = useState<Partial<Profile>>({});
  const [skills, setSkills] = useState<string[]>([]);
  const [videoLinks, setVideoLinks] = useState<VideoLink[]>([]);
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [newVideo, setNewVideo] = useState({ url: "", title: "" });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/profile"],
    queryFn: () => apiRequestJson<Profile>("GET", "/api/profile"),
  });

  const current = { ...profile, ...form };
  const allSkills = skills.length > 0 ? skills : (current.skills ? JSON.parse(current.skills as string) : []);
  const allVideos = videoLinks.length > 0 ? videoLinks : (current.videoLinks ? JSON.parse(current.videoLinks as string) : []);
  const allSocials = Object.keys(socialLinks).length > 0 ? socialLinks : (current.socialLinks ? JSON.parse(current.socialLinks as string) : {});
  const set = (key: keyof Profile, value: string | number | null) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const uploadMutation = useMutation({
    mutationFn: async ({ type, file }: { type: "avatar" | "cover"; file: File }) => {
      const formData = new FormData();
      formData.append(type, file);
      const API_BASE_LOCAL = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_LOCAL}/api/profile/${type}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Photo uploaded" });
    },
    onError: () => {
      toast({ title: "Upload failed", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Profile>) =>
      apiRequestJson<Profile>("PATCH", "/api/profile", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Profile updated" });
      setForm({});
      setSkills([]);
      setVideoLinks([]);
      setSocialLinks({});
    },
    onError: () => {
      toast({ title: "Update failed", variant: "destructive" });
    },
  });

  const handleSave = () => {
    // PRD-006: Profile edit validation
    const errors: string[] = [];

    if (!current.displayName || current.displayName.trim().length < 2) {
      errors.push("Display name must be at least 2 characters");
    }
    if (!current.role) {
      errors.push("Primary role is required");
    }
    if (current.bio && current.bio.length > 500) {
      errors.push("Bio must be 500 characters or fewer");
    }
    if (current.dayRate !== null && current.dayRate !== undefined) {
      if (current.dayRate < 0) {
        errors.push("Day rate cannot be negative");
      }
      if (current.dayRate > 100000) {
        errors.push("Day rate seems unusually high — please verify");
      }
    }
    if (current.reelUrl && !isValidUrl(current.reelUrl)) {
      errors.push("Reel URL is not a valid URL");
    }
    if (current.imdbUrl && !isValidUrl(current.imdbUrl)) {
      errors.push("IMDb URL is not a valid URL");
    }
    if (current.websiteUrl && !isValidUrl(current.websiteUrl)) {
      errors.push("Website URL is not a valid URL");
    }
    // Validate social links
    for (const [platform, url] of Object.entries(allSocials)) {
      if (url && !isValidUrl(url as string)) {
        errors.push(`Invalid ${platform} URL`);
      }
    }
    // Validate video links
    for (const video of allVideos) {
      if (!isValidUrl(video.url)) {
        errors.push(`Invalid video URL: ${video.title || video.url}`);
      }
    }

    if (errors.length > 0) {
      toast({
        title: "Validation errors",
        description: errors.join("; "),
        variant: "destructive",
      });
      return;
    }

    const data: Record<string, unknown> = { ...form };
    if (skills.length > 0) data.skills = JSON.stringify(skills);
    if (videoLinks.length > 0) data.videoLinks = JSON.stringify(videoLinks);
    if (Object.keys(socialLinks).length > 0) data.socialLinks = JSON.stringify(socialLinks);
    updateMutation.mutate(data as Partial<Profile>);
  };

  const addSkill = () => {
    const skill = newSkill.trim();
    if (skill && !skills.includes(skill)) {
      setSkills([...skills, skill]);
      setNewSkill("");
    }
  };

  const removeSkill = (skill: string) => {
    if (skills.includes(skill)) {
      setSkills(skills.filter((s) => s !== skill));
    } else {
      const existing = current.skills ? JSON.parse(current.skills as string) : [];
      setSkills(existing.filter((s: string) => s !== skill));
    }
  };

  const addVideo = () => {
    if (!newVideo.url.trim()) return;
    let provider = "youtube";
    const url = newVideo.url.toLowerCase();
    if (url.includes("vimeo.com")) provider = "vimeo";
    else if (url.includes("youtu.be") || url.includes("youtube.com")) provider = "youtube";
    else provider = "link";
    setVideoLinks([...videoLinks, { ...newVideo, provider }]);
    setNewVideo({ url: "", title: "" });
  };

  const removeVideo = (idx: number) => {
    if (videoLinks.length > 0) {
      setVideoLinks(videoLinks.filter((_, i) => i !== idx));
    } else {
      const existing = current.videoLinks ? JSON.parse(current.videoLinks as string) : [];
      setVideoLinks(existing.filter((_: VideoLink, i: number) => i !== idx));
    }
  };

  const setSocial = (key: string, value: string) => {
    setSocialLinks({ ...socialLinks, [key]: value });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-xl font-semibold">Edit Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your profile is live at thefvc.is/@{user?.handle}
        </p>
      </div>

      {/* PRD-006: Profile completeness nudge */}
      {(() => {
        const { score, total, missing } = getProfileCompleteness(current, allSkills);
        const pct = Math.round((score / total) * 100);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Profile Completeness</span>
                <Badge variant={pct === 100 ? "default" : "secondary"} data-testid="badge-completeness">
                  {score}/{total} ({pct}%)
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {missing.length > 0 && pct < 100 && (
                  <div className="flex flex-wrap gap-1">
                    {missing.map((m) => (
                      <Badge key={m} variant="outline" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
                {pct === 100 && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Your profile is complete!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Photos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cover photo */}
          <div className="space-y-2">
            <Label>Cover / Banner Photo</Label>
            <div
              className="relative h-32 rounded-lg overflow-hidden border border-border bg-muted/30 cursor-pointer group"
              onClick={() => coverInputRef.current?.click()}
              data-testid="upload-cover"
            >
              {current.coverUrl ? (
                <img src={assetUrl(current.coverUrl)} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Image className="h-6 w-6 mr-2" />
                  <span className="text-sm">Click to upload cover photo</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-sm flex items-center gap-1">
                  <Camera className="h-4 w-4" /> Change
                </span>
              </div>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate({ type: "cover", file });
              }}
              data-testid="input-cover-file"
            />
          </div>

          {/* Avatar photo */}
          <div className="space-y-2">
            <Label>Profile Photo</Label>
            <div className="flex items-center gap-4">
              <div
                className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-border bg-muted/30 cursor-pointer group flex-shrink-0"
                onClick={() => avatarInputRef.current?.click()}
                data-testid="upload-avatar"
              >
                {current.avatarUrl ? (
                  <img src={assetUrl(current.avatarUrl)} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Camera className="h-6 w-6" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="h-4 w-4 text-white" />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => avatarInputRef.current?.click()}
                data-testid="button-upload-avatar"
              >
                <Camera className="h-3 w-3 mr-1" /> Upload Photo
              </Button>
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate({ type: "avatar", file });
              }}
              data-testid="input-avatar-file"
            />
          </div>
        </CardContent>
      </Card>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={current.displayName || ""}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder="Your name"
              data-testid="input-display-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Primary Role</Label>
            <Select value={current.role || ""} onValueChange={(v) => set("role", v)}>
              <SelectTrigger data-testid="select-role">
                <SelectValue placeholder="Select your role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={current.city || ""}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Brooklyn"
                data-testid="input-city"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={current.state || ""}
                onChange={(e) => set("state", e.target.value)}
                placeholder="NY"
                data-testid="input-state"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={current.bio || ""}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Tell productions about yourself..."
              rows={4}
              data-testid="input-bio"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="availability">Availability</Label>
            <Select value={current.availability || "available"} onValueChange={(v) => set("availability", v)}>
              <SelectTrigger data-testid="select-availability">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABILITY.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Theme Customization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" /> Profile Theme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose a color theme for your public profile page.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => set("themePreset", preset.value)}
                className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
                  (current.themePreset || "cinema_gold") === preset.value
                    ? "border-primary"
                    : "border-border hover:border-muted-foreground/40"
                }`}
                data-testid={`theme-${preset.value}`}
              >
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: preset.color }}
                />
                <span className="text-xs">{preset.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skills & Equipment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
              placeholder="e.g. RED Komodo, Steadicam, DaVinci Resolve"
              data-testid="input-skill"
            />
            <Button onClick={addSkill} size="icon" data-testid="button-add-skill">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {allSkills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allSkills.map((skill: string) => (
                <Badge key={skill} variant="secondary" className="gap-1">
                  {skill}
                  <button
                    onClick={() => removeSkill(skill)}
                    className="ml-1 hover:text-destructive"
                    data-testid={`button-remove-skill-${skill}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Youtube className="h-4 w-4" /> Video Reels & Clips
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add links to your work on YouTube or Vimeo. They'll be embedded on your profile.
          </p>
          {/* Existing videos */}
          {allVideos.length > 0 && (
            <div className="space-y-2">
              {allVideos.map((video: VideoLink, idx: number) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  <Badge variant="outline" className="capitalize text-xs">{video.provider}</Badge>
                  <span className="text-sm flex-1 truncate">{video.title || video.url}</span>
                  <button
                    onClick={() => removeVideo(idx)}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`button-remove-video-${idx}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add new video */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={newVideo.title}
              onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
              placeholder="Title (e.g. Director Reel 2025)"
              data-testid="input-video-title"
            />
            <Input
              value={newVideo.url}
              onChange={(e) => setNewVideo({ ...newVideo, url: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addVideo())}
              placeholder="https://youtube.com/watch?v=..."
              data-testid="input-video-url"
            />
            <Button onClick={addVideo} size="icon" data-testid="button-add-video">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LinkIcon className="h-4 w-4" /> Social Media
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Link your social profiles. These appear as clickable badges on your public page.
          </p>
          {SOCIAL_PLATFORMS.map((platform) => (
            <div key={platform.key} className="flex items-center gap-2">
              <Label className="w-20 text-xs flex-shrink-0 capitalize">{platform.label}</Label>
              <Input
                value={allSocials[platform.key] || ""}
                onChange={(e) => setSocial(platform.key, e.target.value)}
                placeholder={platform.placeholder}
                data-testid={`input-social-${platform.key}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Links & Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links & Rate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reelUrl">Reel URL</Label>
            <Input
              id="reelUrl"
              value={current.reelUrl || ""}
              onChange={(e) => set("reelUrl", e.target.value)}
              placeholder="https://vimeo.com/yourreel"
              data-testid="input-reel-url"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imdbUrl">IMDb URL</Label>
            <Input
              id="imdbUrl"
              value={current.imdbUrl || ""}
              onChange={(e) => set("imdbUrl", e.target.value)}
              placeholder="https://imdb.com/name/..."
              data-testid="input-imdb-url"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website</Label>
            <Input
              id="websiteUrl"
              value={current.websiteUrl || ""}
              onChange={(e) => set("websiteUrl", e.target.value)}
              placeholder="https://yourwebsite.com"
              data-testid="input-website-url"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dayRate">Day Rate (USD)</Label>
            <Input
              id="dayRate"
              type="number"
              value={current.dayRate ?? ""}
              onChange={(e) => set("dayRate", e.target.value ? parseInt(e.target.value) : null)}
              placeholder="850"
              data-testid="input-day-rate"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-4">
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          data-testid="button-save-profile"
        >
          <Save className="h-4 w-4 mr-1" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
