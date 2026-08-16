import type { ImageDescriptor } from '../lib/schema';

function readableSource(image: ImageDescriptor): string {
  if (image.alt.trim()) return image.alt.trim();
  try {
    const parsed = new URL(image.url);
    return parsed.protocol === 'data:' ? 'Embedded image' : parsed.hostname || 'Image';
  } catch {
    return 'Image';
  }
}

export function ImagePicker({
  images,
  selected,
  onToggle,
  onAnalyzeOne,
  disabled = false,
}: {
  images: ImageDescriptor[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAnalyzeOne: (image: ImageDescriptor) => void;
  disabled?: boolean;
}) {
  return (
    <div className="image-list" aria-label="Visible page images">
      {images.map((image) => (
        <div className="image-row" key={image.id}>
          <label>
            <input
              type="checkbox"
              checked={selected.has(image.id)}
              onChange={() => onToggle(image.id)}
            />
            <span className="image-row__copy">
              <strong>{readableSource(image)}</strong>
              <small>
                {image.kind === 'background'
                  ? 'CSS background'
                  : image.kind === 'context-menu'
                    ? 'Selected image'
                    : 'Page image'}
                {image.width > 0 && image.height > 0 ? ` · ${image.width}×${image.height}` : ''}
              </small>
            </span>
          </label>
          <button
            className="icon-button"
            type="button"
            disabled={disabled}
            onClick={() => onAnalyzeOne(image)}
            aria-label={`Analyze ${readableSource(image)}`}
          >
            Analyze
          </button>
        </div>
      ))}
    </div>
  );
}
