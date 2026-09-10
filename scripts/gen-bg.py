#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────
# ساخت ۱۰ ویدئوی پس‌زمینهٔ اورجینال (لوپ ۶ ثانیه‌ای ۹:۱۶)
# خروجی: public/bank-media/bg/*.mp4 — کاملاً تولیدی، بدون محتوای خارجی
# ─────────────────────────────────────────────────────────────
import numpy as np, subprocess, os

H, W, FPS, DUR = 1280, 720, 24, 6.0
N = int(FPS * DUR)
OUT = "/home/z/my-project/public/bank-media/bg"
os.makedirs(OUT, exist_ok=True)

def hx(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i+2], 16) for i in (0, 2, 4)], float)

def base_gradient(top, bottom):
    t = hx(top); b = hx(bottom)
    g = np.linspace(0, 1, H)[:, None, None]
    return (t * (1 - g) + b * g)  # H,1,3

def sprite(radius, color, soft=2.2):
    d = 2 * radius + 1
    y, x = np.mgrid[0:d, 0:d] - radius
    r = np.sqrt(x*x + y*y) / radius
    a = np.clip(1 - r, 0, 1) ** soft
    return a[..., None] * hx(color)[None, None, :]

def paste(frame, spr, cx, cy, gain=1.0):
    h, w = spr.shape[:2]
    x0, y0 = int(cx - w/2), int(cy - h/2)
    x1, y1 = x0 + w, y0 + h
    sx0, sy0 = max(0, -x0), max(0, -y0)
    x0c, y0c = max(0, x0), max(0, y0)
    x1c, y1c = min(W, x1), min(H, y1)
    if x1c <= x0c or y1c <= y0c: return
    s = spr[sy0:sy0+(y1c-y0c), sx0:sx0+(x1c-x0c)] * gain
    frame[y0c:y1c, x0c:x1c] += s

def vignette(frame, k=0.45):
    y, x = np.mgrid[0:H, 0:W]
    r = np.sqrt(((x - W/2)/(W/2))**2 + ((y - H/2)/(H/2))**2) / np.sqrt(2)
    frame *= (1 - k * r**2)[..., None]

def render(name, frame_fn):
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{OUT}/{name}.mp4"],
        stdin=subprocess.PIPE)
    rng = np.random.default_rng(42)
    for i in range(N):
        f = frame_fn(i / N, rng)
        vignette(f)
        proc.stdin.write(np.clip(f, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close(); proc.wait()
    print(f"  ▶ {name}.mp4")

# ── ۱) بوکهٔ گرم ──
bokeh = [sprite(r, c, s) for r, c, s in [
    (90, "c16a52", 1.6), (70, "e0a78f", 1.8), (120, "9c453d", 1.5), (55, "e8c39e", 2.0),
    (150, "6f2f2a", 1.4), (80, "d98c6b", 1.7), (60, "f1e9e4", 2.4), (110, "b8563f", 1.5)]]
def warm_bokeh(t, rng):
    f = base_gradient("#241a16", "#0d0b0e") * np.ones((H, W, 1))
    for i, s in enumerate(bokeh):
        px = (i * 173 + np.sin(t*6.28*0.3 + i) * 90) % (W + 300) - 150
        py = H * (1.1 - ((t * (0.25 + i*0.05) + i*0.13) % 1.25))
        paste(f, s, px, py, 0.5 + 0.3*np.sin(t*6.28 + i*2))
    return f

# ── ۲) کاغذ کرم ──
grains = [np.random.default_rng(s).normal(0, 3.2, (H, W, 1)) for s in range(4)]
def cream_paper(t, rng):
    f = base_gradient("#e7d6c6", "#c6a68e") * np.ones((H, W, 1))
    band_x = (t * 1.4 - 0.4) * W
    y, x = np.mgrid[0:H, 0:W]
    f += 10 * np.exp(-((x - band_x)**2) / (2*180**2))[..., None]
    f += grains[int(t*FPS) % 4]
    return f

# ── ۳) دود تاریک ──
smoke = [sprite(r, c, s) for r, c, s in [
    (260, "2b2422", 1.1), (300, "241d1c", 1.2), (220, "332a26", 1.0), (340, "1d1716", 1.3)]]
def dark_smoke(t, rng):
    f = base_gradient("#141110", "#08070a") * np.ones((H, W, 1))
    for i, s in enumerate(smoke):
        px = W*(0.5 + 0.42*np.sin(t*6.28*(0.12+i*0.03) + i*2.1))
        py = H*(0.4 + 0.3*np.cos(t*6.28*(0.09+i*0.04) + i))
        paste(f, s, px, py, 0.9)
    return f

# ── ۴) گرید نئون ──
def neon_grid(t, rng):
    f = base_gradient("#120d12", "#07060a") * np.ones((H, W, 1))
    horizons = 14
    for i in range(horizons):
        p = ((i + t) % horizons) / horizons
        y = int(H*0.35 + p**1.7 * H*0.75)
        if 0 <= y < H:
            f[y:y+2, :] += np.array([120, 50, 35], float) * (1 - p*0.6)
    for j in range(9):
        xg = int((j/8) * W)
        w_line = 1 + int(3 * (1 - abs(j/8 - 0.5)*2))
        f[:, max(0,xg-w_line):xg+w_line] += np.array([35, 14, 20], float)
    glow_y = int(H * ((t*0.8) % 1))
    f[max(0,glow_y-40):glow_y+40, :] += np.array([70, 28, 18], float)
    return f

# ── ۵) ذرات طلایی ──
gold = [sprite(r, c, s) for r, c, s in [(14, "e8c39e", 1.2), (10, "e0a78f", 1.4), (18, "c9974f", 1.1), (7, "f7e2c0", 1.6)]]
def gold_lux(t, rng):
    f = base_gradient("#191012", "#0a0708") * np.ones((H, W, 1))
    big = sprite(200, "4a2c1c", 1.4)
    paste(f, big, W*0.5 + 60*np.sin(t*6.28*0.25), H*0.45, 0.9)
    for i, s in enumerate(gold):
        px = (i * 137 + np.sin(t*6.28*(0.2+i*0.07)+i) * 40) % W
        py = H * ((t * (0.35 + (i % 4)*0.1) + i*0.11) % 1.05)
        paste(f, s, px, py, 0.8 + 0.5*np.sin(t*6.28*3 + i))
    return f

# ── ۶) طبیعت نرم ──
nature = [sprite(r, c, s) for r, c, s in [
    (240, "ffffff", 1.6), (200, "e8efd8", 1.4), (260, "c9d8bd", 1.3), (170, "f7f4ea", 1.7)]]
def soft_nature(t, rng):
    f = base_gradient("#e9efdc", "#aebfa4") * np.ones((H, W, 1))
    for i, s in enumerate(nature):
        px = W*(0.2 + 0.6*((i*0.29 + t*0.1) % 1))
        py = H*(0.25 + 0.5*np.sin(t*6.28*0.15 + i*1.8))
        paste(f, s, px, py, 0.55)
    return f

# ── ۷) آمبر آشپزخانه ──
amber = [sprite(r, c, s) for r, c, s in [
    (100, "d98c3f", 1.5), (70, "e8b04b", 1.7), (130, "a8552a", 1.4), (50, "f2d59a", 2.0), (160, "7a3d1e", 1.3)]]
def warm_kitchen(t, rng):
    f = base_gradient("#2a1810", "#120a06") * np.ones((H, W, 1))
    for i, s in enumerate(amber):
        px = (i*211 + 40*np.sin(t*6.28*0.2+i)) % (W+200) - 100
        py = (i*317) % H
        paste(f, s, px, py, 0.6 + 0.15*np.sin(t*6.28*2.3 + i*1.3))
    return f

# ── ۸) استیل اسپرت ──
def steel_motion(t, rng):
    f = base_gradient("#202024", "#0c0c10") * np.ones((H, W, 1))
    y, x = np.mgrid[0:H, 0:W]
    streak = (x*0.5 + y*1.1) / (H+W)
    for i in range(8):
        p = (streak + t*0.55 + i*0.125) % 1
        w_line = 0.004 + 0.02*np.sin(i*2.7)**2
        m = np.exp(-((p - 0.5)**2) / (2*w_line**2))
        col = np.array([95, 95, 110], float) if i % 3 else np.array([190, 70, 50], float)
        f += (m * 0.5)[..., None] * col[None, None, :]
    return f

# ── ۹) پاستل رمانتیک ──
pastel = [sprite(r, c, s) for r, c, s in [
    (240, "f6d8ce", 1.4), (210, "eabfb4", 1.5), (260, "f9ece4", 1.6), (180, "dfb2a8", 1.4)]]
def pastel_drift(t, rng):
    f = base_gradient("#eccabc", "#cf9a88") * np.ones((H, W, 1))
    for i, s in enumerate(pastel):
        px = W*(0.3 + 0.4*np.sin(t*6.28*(0.13+i*0.02) + i*2))
        py = H*((0.2 + i*0.22 + t*0.06) % 1.1 - 0.05)
        paste(f, s, px, py, 0.6)
    return f

# ── ۱۰) کانفتی جشن ──
conf = []
for c in ["e0574a", "e0a78f", "f2d59a", "c16a52", "8fbf9f"]:
    for ang in range(0, 6):
        rr = sprite(16, c, 0.6)
        conf.append((rr, np.roll(rr, ang*5, axis=1)))
def confetti(t, rng):
    f = base_gradient("#33211a", "#160e0a") * np.ones((H, W, 1))
    warm = sprite(240, "5a3020", 1.3)
    paste(f, warm, W*0.5, H*0.35, 0.8)
    for i in range(46):
        sp, spr = conf[i % len(conf)]
        px = (i*97 + np.sin(t*6.28*0.5 + i)*60) % W
        py = H * ((t*(0.5 + (i % 5)*0.14) + i*0.061) % 1.08)
        paste(f, spr if (int(t*FPS)+i) % 12 < 6 else sp, px, py, 0.9)
    return f

print("تولید ویدئوهای پس‌زمینه...")
render("warm-bokeh", warm_bokeh)
render("cream-paper", cream_paper)
render("dark-smoke", dark_smoke)
render("neon-grid", neon_grid)
render("gold-lux", gold_lux)
render("soft-nature", soft_nature)
render("warm-kitchen", warm_kitchen)
render("steel-motion", steel_motion)
render("pastel-drift", pastel_drift)
render("confetti", confetti)
total = sum(os.path.getsize(f"{OUT}/{f}") for f in os.listdir(OUT))
print(f"✅ {len(os.listdir(OUT))} فایل، مجموع {total/1024/1024:.1f}MB")
