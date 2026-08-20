#!/usr/bin/env python3
"""
로고 마크를 PNG와 파비콘으로 굽는다.

그림의 출처는 `services/web/src/components/brand/Logo.tsx` **하나다**. 아래
GEOMETRY는 그 SVG를 좌표 그대로 옮긴 것이고, 색도 화면 정의서가 정한 두 짝
(밝은 지면 · 어두운 지면)을 그대로 쓴다. 여기서 새 좌표나 새 색을 만들지
않는다 — 만들면 화면의 로고와 탭의 로고가 조용히 달라진다.

굽는 이유는 SVG를 못 쓰는 자리가 있어서다. 파비콘 .ico, iOS 홈 화면 아이콘,
메일·오픈그래프처럼 래스터만 받는 곳.

    python3 scripts/build-brand-assets.py

PNG는 `assets/brand/`에, 파비콘 세 개는 `services/web/src/app/`에 놓는다.
뒤쪽은 Next App Router가 파일 이름만 보고 <link>를 붙이는 자리다.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BRAND_DIR = ROOT / "assets" / "brand"
APP_DIR = ROOT / "services" / "web" / "src" / "app"

# Logo.tsx의 viewBox. 좌표는 전부 이 단위다.
VIEWBOX = 108.0

# 화면 정의서의 두 짝. light는 05 사이드바, dark는 10 · 10b 좌측 패널.
TONES = {
    "light": {"cup": "#9A4030", "handle": "#E0B486"},
    "dark": {"cup": "#E0B486", "handle": "#A9793F"},
}

# 타일 지면 — 10 · 10b 좌측 패널이 시작하는 색(--ex-ink-900). 어두운 지면이라
# 타일 위의 마크는 dark 짝을 쓴다.
TILE_GROUND = "#16223A"

# 마크의 잉크가 실제로 차지하는 칸. 원과 획 두께에서 나온 값이라 손으로 정한
# 것이 아니다 — 컵은 (44,54) 반지름 36에 획 10이라 41까지, 손잡이는 (78.2,54)
# 반지름 19.8에 획 8.5라 102.25까지 간다.
INK_BOX = (3.0, 13.0, 102.25, 95.0)

# 픽셀 하나를 8×8로 재서 가장자리를 만든다. BOX 축소는 그 64칸의 평균이라
# 덮인 넓이가 그대로 알파가 된다.
SUPERSAMPLE = 8


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


class Canvas:
    """viewBox 좌표로 그리고, 마지막에 한 번 줄여 가장자리를 만든다."""

    def __init__(self, size: int, scale: float, ox: float, oy: float):
        self.size = size
        self.ss = size * SUPERSAMPLE
        self.scale = scale * SUPERSAMPLE
        self.ox = ox * SUPERSAMPLE
        self.oy = oy * SUPERSAMPLE

    def _x(self, u: float) -> float:
        return self.ox + u * self.scale

    def _y(self, v: float) -> float:
        return self.oy + v * self.scale

    def _blank(self) -> Image.Image:
        return Image.new("L", (self.ss, self.ss), 0)

    def disc(self, cx: float, cy: float, r: float) -> Image.Image:
        m = self._blank()
        ImageDraw.Draw(m).ellipse(
            [self._x(cx - r), self._y(cy - r), self._x(cx + r), self._y(cy + r)],
            fill=255,
        )
        return m

    def ring(self, cx: float, cy: float, r: float, width: float) -> Image.Image:
        """SVG의 stroke — 획은 반지름을 가운데 두고 양쪽으로 절반씩 퍼진다."""
        return ImageChops.subtract(
            self.disc(cx, cy, r + width / 2), self.disc(cx, cy, r - width / 2)
        )

    def rect(self, x: float, y: float, w: float, h: float) -> Image.Image:
        m = self._blank()
        ImageDraw.Draw(m).rectangle(
            [self._x(x), self._y(y), self._x(x + w), self._y(y + h)], fill=255
        )
        return m

    def flatten(self, mask: Image.Image) -> Image.Image:
        return mask.resize((self.size, self.size), Image.BOX)


def _layer(size: int, color: str, mask: Image.Image) -> Image.Image:
    """색을 화면 전체에 깔고 알파만 마스크로 준다.

    알파가 0인 곳까지 색을 채워 두는 이유가 있다. 반투명 가장자리의 RGB가
    투명한 바닥(검정)과 섞이면 축소·합성 뒤에 검은 테가 남는다.
    """
    layer = Image.new("RGBA", (size, size), _rgb(color) + (0,))
    layer.putalpha(mask)
    return layer


def draw_mark(canvas: Canvas, tone: str) -> Image.Image:
    """Logo.tsx의 세 도형을 같은 순서로 얹는다."""
    color = TONES[tone]
    img = Image.new("RGBA", (canvas.size, canvas.size), (0, 0, 0, 0))

    # 손잡이 — 컵 반지름 46.5 안쪽은 마스크로 지운다. 컵 뒤로 들어가는 부분이다.
    handle = ImageChops.subtract(
        canvas.ring(78.2, 54, 19.8, 8.5), canvas.disc(44, 54, 46.5)
    )
    # 담긴 커피 — 58.96 아래를 컵 원으로 잘라 낸다.
    brew = ImageChops.multiply(canvas.rect(0, 58.96, 108, 49.04), canvas.disc(44, 54, 36))
    cup = canvas.ring(44, 54, 36, 10)

    for mask, key in ((handle, "handle"), (brew, "cup"), (cup, "cup")):
        img = Image.alpha_composite(img, _layer(canvas.size, color[key], canvas.flatten(mask)))
    return img


def mark_png(size: int, tone: str) -> Image.Image:
    """viewBox를 그대로 1:1로 뜬다. 화면에서 쓰는 비율이 그대로 남는다."""
    return draw_mark(Canvas(size, size / VIEWBOX, 0, 0), tone)


def tile_png(size: int, radius_ratio: float = 0.2237) -> Image.Image:
    """어두운 타일 위의 마크.

    잉크의 경계 상자를 타일 폭의 88%에 맞춰 가운데 세운다. 여백을 더 두면
    16px에서 획이 한 픽셀 밑으로 내려가 컵의 테가 뭉갠다 — 굽고 확대해 보고
    정한 값이다. 모서리 0.2237은 iOS가 홈 화면 아이콘을 깎는 비율이다.
    """
    x0, y0, x1, y1 = INK_BOX
    scale = (size * 0.88) / (x1 - x0)
    ox = (size - (x1 - x0) * scale) / 2 - x0 * scale
    oy = (size - (y1 - y0) * scale) / 2 - y0 * scale

    ground = Image.new("RGBA", (size, size), _rgb(TILE_GROUND) + (255,))
    corner = Canvas(size, 1.0, 0, 0)
    m = Image.new("L", (corner.ss, corner.ss), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, corner.ss - 1, corner.ss - 1], radius=size * radius_ratio * SUPERSAMPLE, fill=255
    )
    ground.putalpha(corner.flatten(m))

    return Image.alpha_composite(ground, draw_mark(Canvas(size, scale, ox, oy), "dark"))


def main() -> None:
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    written = []

    for tone in TONES:
        for size in (64, 128, 256, 512, 1024):
            path = BRAND_DIR / f"expresso-mark-{tone}-{size}.png"
            mark_png(size, tone).save(path)
            written.append(path)

    for size in (256, 512, 1024):
        path = BRAND_DIR / f"expresso-tile-{size}.png"
        tile_png(size).save(path)
        written.append(path)

    # 파비콘 — Next App Router가 이름으로 집어 간다.
    # .ico는 16·32·48을 한 파일에 넣는다. 브라우저마다 집어 가는 크기가 다르다.
    icon = tile_png(512)
    ico_path = APP_DIR / "favicon.ico"
    icon.save(ico_path, sizes=[(16, 16), (32, 32), (48, 48)])
    written.append(ico_path)

    for name, size in (("icon.png", 512), ("apple-icon.png", 180)):
        path = APP_DIR / name
        tile_png(size).save(path)
        written.append(path)

    for path in written:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
