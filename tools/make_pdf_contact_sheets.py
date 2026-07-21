from pathlib import Path
import sys
from PIL import Image, ImageOps, ImageDraw

src = Path(sys.argv[1] if len(sys.argv) > 1 else "tmp/pdfs/bulletin-backend")
files = sorted(src.glob("page-*.png"))
thumb_w = 300
gap = 18
cols, rows = 4, 2
for sheet_idx in range(0, len(files), cols * rows):
    group = files[sheet_idx:sheet_idx + cols * rows]
    thumbs = []
    for path in group:
        im = Image.open(path).convert("RGB")
        h = round(im.height * thumb_w / im.width)
        im = im.resize((thumb_w, h), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (thumb_w + 2, h + 28), "white")
        canvas.paste(im, (1, 1))
        ImageDraw.Draw(canvas).text((8, h + 7), path.stem, fill="#15191D")
        thumbs.append(canvas)
    cell_w = thumb_w + 2
    cell_h = max(t.height for t in thumbs)
    sheet = Image.new("RGB", (cols * cell_w + (cols + 1) * gap, rows * cell_h + (rows + 1) * gap), "#D8D4CB")
    for i, thumb in enumerate(thumbs):
        x = gap + (i % cols) * (cell_w + gap)
        y = gap + (i // cols) * (cell_h + gap)
        sheet.paste(thumb, (x, y))
    sheet.save(src / f"contact-{sheet_idx // (cols * rows) + 1}.png")
