import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { validateImage } from "@/utils/image";
import type { ReportImage } from "@/types";

interface Props { files: File[]; onFiles: (f: File[]) => void; existing?: ReportImage[]; onRemoveExisting?: (id: string) => void; max?: number }

export function ImageUpload({ files, onFiles, existing = [], onRemoveExisting, max = 3 }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const total = files.length + existing.length;
  function pick(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const err = validateImage(f);
      if (err) { setError(`${f.name}: ${err}`); continue; }
      if (existing.length + next.length >= max) { setError(`You can add up to ${max} images.`); break; }
      setError(null);
      next.push(f);
    }
    onFiles(next);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <span className="label">Reference photo</span>
      <div className="flex flex-wrap gap-3">
        {existing.map((img) => (
          <div key={img.id} className="relative h-24 w-24 overflow-hidden rounded-md border border-stone-300">
            <img src={img.url} alt="Uploaded item" className="h-full w-full object-cover" />
            {onRemoveExisting && <button type="button" aria-label="Remove image" onClick={() => onRemoveExisting(img.id)} className="absolute right-1 top-1 rounded bg-white/90 p-1"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
        {previews.map((src, i) => (
          <div key={src} className="relative h-24 w-24 overflow-hidden rounded-md border border-stone-300" data-testid="image-preview">
            <img src={src} alt={`Preview ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" aria-label="Remove image" onClick={() => onFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded bg-white/90 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {total < max && (
          <Button type="button" variant="secondary" className="h-24 w-24 flex-col gap-1 border-dashed" onClick={() => input.current?.click()}>
            <ImagePlus className="h-5 w-5" aria-hidden /><span className="text-xs">Add photo</span>
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="Upload item photo" data-testid="image-input" onChange={(e) => pick(e.target.files)} />
      <p className="hint">JPG, PNG or WebP, up to 5 MB. Location data in photos is removed automatically.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
