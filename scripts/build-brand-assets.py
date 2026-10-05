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
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BRAND_DIR = ROOT / "assets" / "brand"
APP_DIR = ROOT / "services" / "web" / "src" / "app"
DOCS_BRAND_DIR = ROOT / "docs" / "assets" / "brand"

# Logo.tsx의 viewBox. 좌표는 전부 이 단위다.
VIEWBOX = 108.0

# Logo.tsx의 세 도형. 마크(PNG)와 구성 그리드(SVG)가 같은 값을 쓴다.
CUP = (44.0, 54.0, 36.0, 10.0)        # 컵 — 중심 x · y, 반지름, 획 두께
HANDLE = (78.2, 54.0, 19.8, 8.5)      # 손잡이 — 중심 x · y, 반지름, 획 두께
HANDLE_MASK_R = 46.5                  # 손잡이를 지우는 컵 중심의 원
BREW_TOP = 58.96                      # 담긴 커피의 윗면

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
    cx, cy, cr, cw = CUP
    hx, hy, hr, hw = HANDLE
    handle = ImageChops.subtract(
        canvas.ring(hx, hy, hr, hw), canvas.disc(cx, cy, HANDLE_MASK_R)
    )
    # 담긴 커피 — BREW_TOP 아래를 컵 원으로 잘라 낸다.
    brew = ImageChops.multiply(
        canvas.rect(0, BREW_TOP, VIEWBOX, VIEWBOX - BREW_TOP), canvas.disc(cx, cy, cr)
    )
    cup = canvas.ring(cx, cy, cr, cw)

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


# 구성도 색 — 브랜드 색만 쓴다. tokens.css의 espresso · crema · bean-50 · bean-100과
# Logo.tsx의 손잡이 색 짝(#A9793F)이다. 컵은 espresso 계열, 손잡이는 crema 계열로
# 마크의 색 짝을 그대로 따르고, 보조선은 crema, 점선은 그보다 짙은 #A9793F로 나눈다.
# 어두운 지면에서는 같은 역할을 crema와 그 투명도로 낸다.
CONSTRUCTION = {
    "light": {"fill": "#F6E2D3", "outline": "#9A4030", "guide": "#E0B486",
              "mark": "#A9793F", "mark_fill": "#FFFFFF"},
    "dark": {"fill": "rgba(224,180,134,.14)", "outline": "#E0B486", "guide": "rgba(224,180,134,.3)",
             "mark": "rgba(224,180,134,.7)", "mark_fill": "#16223A"},
}


def _num(v: float) -> str:
    return f"{v:.3f}".rstrip("0").rstrip(".")


def grid_svg(tone: str) -> str:
    """로고 구성도. 마크를 한 가지 면과 윤곽선으로 그리고, 모양을 만드는 원과 기준선을 겹친다.

    그리는 순서는 면 → 기준선 → 원 · 윤곽선 → 표식이다. 원이 면 위로 지나가야 보인다.

    - 면: 컵 고리 · 담긴 커피 · 손잡이 초승달을 한 색으로
    - 윤곽: 면의 가장자리
    - 원(윤곽과 같은 색, 가는 선): 손잡이를 이루는 바깥 · 안쪽 원 전체
    - 기준선: 잉크 경계 상자(INK_BOX)의 네 변, 커피 면의 높이, 손잡이를 지우는 마스크 원
    - 표식: 상자 모서리(네모), 마크가 상자에 닿는 네 점과 커피 면의 양 끝(빈 원), 두 중심(점)
    """
    cx, cy, cr, cw = CUP
    hx, hy, hr, hw = HANDLE
    outer, inner = cr + cw / 2, cr - cw / 2
    c = CONSTRUCTION[tone]
    n = _num
    R = HANDLE_MASK_R

    chord = math.sqrt(inner**2 - (BREW_TOP - cy) ** 2)

    def meet(r: float) -> tuple[float, float]:
        d = hx - cx
        a = (d * d + R**2 - r * r) / (2 * d)
        return cx + a, math.sqrt(R**2 - a * a)

    ho, hi = hr + hw / 2, hr - hw / 2
    (ox, oh), (ix, ih) = meet(ho), meet(hi)
    x0, y0, x1, y1 = INK_BOX
    ext = 10.0

    cup = (f"M {n(cx - outer)} {n(cy)} A {n(outer)} {n(outer)} 0 1 1 {n(cx + outer)} {n(cy)} "
           f"A {n(outer)} {n(outer)} 0 1 1 {n(cx - outer)} {n(cy)} Z "
           f"M {n(cx - chord)} {n(BREW_TOP)} A {n(inner)} {n(inner)} 0 1 1 {n(cx + chord)} {n(BREW_TOP)} Z")
    handle = (f"M {n(ox)} {n(hy - oh)} A {n(ho)} {n(ho)} 0 0 1 {n(ox)} {n(hy + oh)} "
              f"A {n(R)} {n(R)} 0 0 0 {n(ix)} {n(hy + ih)} "
              f"A {n(hi)} {n(hi)} 0 0 0 {n(ix)} {n(hy - ih)} "
              f"A {n(R)} {n(R)} 0 0 0 {n(ox)} {n(hy - oh)} Z")

    corners = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
    touches = [(cx, y0), (cx, y1), (x0, cy), (x1, cy), (cx - chord, BREW_TOP), (cx + chord, BREW_TOP)]

    # 상자 네 변을 ext 만큼 늘인 선까지 들어가는 정사각 viewBox
    side = max(x1 - x0, y1 - y0) + 2 * ext + 4
    vx, vy = (x0 + x1 - side) / 2, (y0 + y1 - side) / 2

    sq, dot = 1.6, 0.85
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{n(vx)} {n(vy)} {n(side)} {n(side)}" fill="none">
  <!-- scripts/build-brand-assets.py 가 Logo.tsx 의 좌표로 생성한다. 손으로 고치지 않는다. -->
  <g fill="{c['fill']}" stroke="none">
    <path fill-rule="evenodd" d="{cup}"/>
    <path d="{handle}"/>
  </g>
  <g stroke="{c['guide']}" stroke-width="0.3">
    <line x1="{n(x0)}" y1="{n(y0 - ext)}" x2="{n(x0)}" y2="{n(y1 + ext)}"/>
    <line x1="{n(x1)}" y1="{n(y0 - ext)}" x2="{n(x1)}" y2="{n(y1 + ext)}"/>
    <line x1="{n(x0 - ext)}" y1="{n(y0)}" x2="{n(x1 + ext)}" y2="{n(y0)}"/>
    <line x1="{n(x0 - ext)}" y1="{n(y1)}" x2="{n(x1 + ext)}" y2="{n(y1)}"/>
    <line x1="{n(x0 - ext)}" y1="{n(BREW_TOP)}" x2="{n(x1 + ext)}" y2="{n(BREW_TOP)}"/>
    <circle cx="{n(cx)}" cy="{n(cy)}" r="{n(R)}"/>
  </g>
  <g stroke="{c['outline']}" stroke-width="0.3">
    <circle cx="{n(hx)}" cy="{n(hy)}" r="{n(ho)}"/>
    <circle cx="{n(hx)}" cy="{n(hy)}" r="{n(hi)}"/>
  </g>
  <g stroke="{c['outline']}" stroke-width="0.45" stroke-linejoin="round">
    <path fill-rule="evenodd" d="{cup}"/>
    <path d="{handle}"/>
  </g>
  <g fill="{c['mark_fill']}" stroke="{c['mark']}" stroke-width="0.25">
{chr(10).join(f'    <rect x="{n(x - sq / 2)}" y="{n(y - sq / 2)}" width="{n(sq)}" height="{n(sq)}"/>' for x, y in corners)}
{chr(10).join(f'    <circle cx="{n(x)}" cy="{n(y)}" r="{n(dot)}"/>' for x, y in touches)}
  </g>
  <g fill="{c['outline']}">
    <circle cx="{n(cx)}" cy="{n(cy)}" r="0.4"/>
    <circle cx="{n(hx)}" cy="{n(hy)}" r="0.4"/>
  </g>
</svg>
"""


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

    # 구성 그리드 — 벡터 그대로 둔다. 개발 포털은 docs/만 발행하므로 문서용
    # 사본을 docs/assets/brand/에도 쓴다.
    DOCS_BRAND_DIR.mkdir(parents=True, exist_ok=True)
    for tone in TONES:
        svg = grid_svg(tone)
        for folder in (BRAND_DIR, DOCS_BRAND_DIR):
            path = folder / f"expresso-logo-grid-{tone}.svg"
            path.write_text(svg, encoding="utf-8")
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
