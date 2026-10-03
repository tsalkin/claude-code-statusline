import math, sys
from PIL import Image, ImageDraw

N = 1024; K = 4; W = N * K           # draw 4x, downscale for smooth edges
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

BG = (26, 27, 38, 255)
d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.22), fill=BG)

cx, cy = W / 2, W * 0.56
R = W * 0.33; T = W * 0.085           # arc radius and thickness
start, end = 150, 390                 # 240-degree gauge, opening at the bottom
GREEN, YELLOW, RED = (80, 200, 120), (240, 196, 64), (232, 84, 84)
segs = [(0.00, 0.58, GREEN), (0.60, 0.80, YELLOW), (0.82, 1.00, RED)]
box = [cx - R, cy - R, cx + R, cy + R]
for a, b, col in segs:
    d.arc(box, start + (end - start) * a, start + (end - start) * b, fill=col, width=int(T))

# round caps at both ends of the arc
for frac, col in ((0.0, GREEN), (1.0, RED)):
    ang = math.radians(start + (end - start) * frac)
    r = R - T / 2
    x, y = cx + r * math.cos(ang), cy + r * math.sin(ang)
    d.ellipse([x - T / 2, y - T / 2, x + T / 2, y + T / 2], fill=col)

# needle at 72 % — in the yellow: "ahead of pace"
frac = 0.72
ang = math.radians(start + (end - start) * frac)
L = R * 0.78
tip = (cx + L * math.cos(ang), cy + L * math.sin(ang))
perp = ang + math.pi / 2; hw = W * 0.022
base1 = (cx + hw * math.cos(perp), cy + hw * math.sin(perp))
base2 = (cx - hw * math.cos(perp), cy - hw * math.sin(perp))
NEEDLE = (236, 238, 245)
d.polygon([tip, base1, base2], fill=NEEDLE)
h = W * 0.055
d.ellipse([cx - h, cy - h, cx + h, cy + h], fill=NEEDLE)
d.ellipse([cx - h * 0.45, cy - h * 0.45, cx + h * 0.45, cy + h * 0.45], fill=BG)

# two status-line rows under the gauge
y1 = W * 0.80; bh = W * 0.035; x0 = W * 0.24; x1 = W * 0.76
DIM = (60, 63, 84)
d.rounded_rectangle([x0, y1, x1, y1 + bh], radius=bh / 2, fill=DIM)
d.rounded_rectangle([x0, y1, x0 + (x1 - x0) * 0.42, y1 + bh], radius=bh / 2, fill=GREEN)
y2 = y1 + bh * 1.9
d.rounded_rectangle([x0, y2, x0 + (x1 - x0) * 0.68, y2 + bh], radius=bh / 2, fill=DIM)

img = img.resize((N, N), Image.LANCZOS)
img.save(sys.argv[1])
small = img.resize((64, 64), Image.LANCZOS); small.save(sys.argv[1].replace('.png', '-64.png'))
