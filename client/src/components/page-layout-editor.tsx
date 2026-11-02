import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PAGE_SECTION_IDS, type PageConfig } from "@shared/page-config";

const SECTION_LABELS: Record<(typeof PAGE_SECTION_IDS)[number], string> = {
  work: "The work (reels)",
  filmography: "Filmography",
};

const MAX_LINKS = 10;

// Controlled editor for the public-page layout. It only produces a PageConfig;
// the parent decides when to save, so edits ride along with the profile Save.
export function PageLayoutEditor({ value, onChange }: { value: PageConfig; onChange: (next: PageConfig) => void }) {
  const move = (index: number, delta: number) => {
    const sections = [...value.sections];
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ ...value, sections });
  };
  const toggle = (index: number, visible: boolean) =>
    onChange({ ...value, sections: value.sections.map((s, i) => (i === index ? { ...s, visible } : s)) });
  const setLink = (index: number, patch: Partial<{ label: string; url: string }>) =>
    onChange({ ...value, customLinks: value.customLinks.map((l, i) => (i === index ? { ...l, ...patch } : l)) });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="page-headline">Headline</Label>
        <Input
          id="page-headline"
          value={value.headline ?? ""}
          maxLength={140}
          placeholder="One line above your bio"
          onChange={(e) => onChange({ ...value, headline: e.target.value || null })}
          data-testid="input-page-headline"
        />
      </div>

      <div className="space-y-2">
        <Label>Sections</Label>
        <ul className="space-y-2">
          {value.sections.map((section, i) => (
            <li key={section.id} className="flex items-center gap-2 rounded-md border border-border p-2" data-testid={`page-section-${section.id}`}>
              <span className="flex-1 text-sm">{SECTION_LABELS[section.id]}</span>
              <Button type="button" size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}
                aria-label={`Move ${SECTION_LABELS[section.id]} up`} data-testid={`button-section-up-${section.id}`}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" disabled={i === value.sections.length - 1} onClick={() => move(i, 1)}
                aria-label={`Move ${SECTION_LABELS[section.id]} down`} data-testid={`button-section-down-${section.id}`}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Switch checked={section.visible} onCheckedChange={(v) => toggle(i, v)}
                aria-label={`Show ${SECTION_LABELS[section.id]}`} data-testid={`switch-section-${section.id}`} />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <Label>Custom links</Label>
        {value.customLinks.map((link, i) => (
          <div key={i} className="flex gap-2" data-testid={`page-link-${i}`}>
            <Input value={link.label} maxLength={40} placeholder="Label" className="w-1/3"
              onChange={(e) => setLink(i, { label: e.target.value })} data-testid={`input-link-label-${i}`} />
            <Input value={link.url} maxLength={500} placeholder="https://" className="flex-1"
              onChange={(e) => setLink(i, { url: e.target.value })} data-testid={`input-link-url-${i}`} />
            <Button type="button" size="icon" variant="ghost" aria-label="Remove link"
              onClick={() => onChange({ ...value, customLinks: value.customLinks.filter((_, j) => j !== i) })}
              data-testid={`button-link-remove-${i}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {value.customLinks.length < MAX_LINKS && (
          <Button type="button" size="sm" variant="outline"
            onClick={() => onChange({ ...value, customLinks: [...value.customLinks, { label: "", url: "https://" }] })}
            data-testid="button-link-add">
            <Plus className="h-4 w-4 mr-1" /> Add link
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Links must start with https://.</p>
      </div>
    </div>
  );
}
