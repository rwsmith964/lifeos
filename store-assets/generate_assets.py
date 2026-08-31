"""Generate Play Store hi-res icon and feature graphic from the real LifeOS brand mark."""
from PIL import Image, ImageDraw, ImageFont
import os

BRAND_BLACK = (10, 10, 10)
WHITE = (255, 255, 255)
SRC_ICON = "/home/user/workspace/lifeos/public/icon-512.png"
OUT_DIR = "/home/user/workspace/lifeos/store-assets"

ROBOTO_BOLD = "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Bold.ttf"
ROBOTO_MEDIUM = "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Medium.ttf"
ROBOTO_REGULAR = "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf"


def hi_res_icon():
    """512x512, 32-bit PNG, flattened onto brand black (matches iOS treatment)."""
    src = Image.open(SRC_ICON).convert("RGBA")
    bg = Image.new("RGBA", src.size, BRAND_BLACK + (255,))
    bg.alpha_composite(src)
    out = bg.convert("RGB")
    path = os.path.join(OUT_DIR, "play-hi-res-icon-512.png")
    out.save(path, "PNG")
    print("wrote", path, out.size, out.mode)


def feature_graphic():
    """1024x500 Play Store feature graphic: brand black bg, logo mark + wordmark + tagline."""
    W, H = 1024, 500
    canvas = Image.new("RGB", (W, H), BRAND_BLACK)
    draw = ImageDraw.Draw(canvas)

    # Logo mark: reuse the real icon's triangle-in-circle, scaled down, left side.
    mark_size = 220
    mark = Image.open(SRC_ICON).convert("RGBA").resize((mark_size, mark_size), Image.LANCZOS)
    mark_x, mark_y = 90, (H - mark_size) // 2
    canvas.paste(mark, (mark_x, mark_y), mark)

    # Wordmark + tagline, right of the mark.
    text_x = mark_x + mark_size + 56
    wordmark_font = ImageFont.truetype(ROBOTO_BOLD, 92)
    tagline_font = ImageFont.truetype(ROBOTO_REGULAR, 34)

    wordmark = "LifeOS"
    bbox = draw.textbbox((0, 0), wordmark, font=wordmark_font)
    wordmark_h = bbox[3] - bbox[1]
    tagline = "Your family, organized."
    tbbox = draw.textbbox((0, 0), tagline, font=tagline_font)
    tagline_h = tbbox[3] - tbbox[1]

    gap = 22
    block_h = wordmark_h + gap + tagline_h
    start_y = (H - block_h) // 2 - bbox[1]

    draw.text((text_x, start_y), wordmark, font=wordmark_font, fill=WHITE)
    tagline_y = start_y + wordmark_h + gap - tbbox[1]
    draw.text((text_x, tagline_y), tagline, font=tagline_font, fill=(190, 190, 190))

    path = os.path.join(OUT_DIR, "play-feature-graphic-1024x500.png")
    canvas.save(path, "PNG")
    print("wrote", path, canvas.size, canvas.mode)


if __name__ == "__main__":
    hi_res_icon()
    feature_graphic()
