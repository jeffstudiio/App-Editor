#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────
# ساخت ۹ لوپ موزیک اورجینال با سینتی‌سایزر — مالکیت: پروژهٔ کاربر
# خروجی: public/bank-media/music/*.m4a  (لایسنس آزاد، بدون کپی‌رایت خارجی)
# ─────────────────────────────────────────────────────────────
import numpy as np, subprocess, os, wave, shutil

SR = 44100
OUT = "/home/z/my-project/public/bank-media/music"
os.makedirs(OUT, exist_ok=True)

def env_exp(n, decay):
    return np.exp(-np.arange(n) / (SR * decay))

def kick(dur=0.32, f0=120, f1=44, amp=1.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    freq = f1 + (f0 - f1) * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return amp * np.sin(phase) * env_exp(n, 0.12)

def hat(dur=0.06, amp=0.4):
    n = int(SR * dur)
    x = np.random.randn(n)
    x = np.diff(x, prepend=0)  # highpass
    return amp * x * env_exp(n, 0.02)

def clap(dur=0.18, amp=0.5):
    n = int(SR * dur)
    x = np.random.randn(n) * env_exp(n, 0.045)
    return amp * x

def bass(f, dur, amp=0.55):
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = np.sin(2*np.pi*f*t) + 0.35*np.sin(4*np.pi*f*t)
    x = np.tanh(x * 1.6)
    e = np.minimum(1, t*80) * env_exp(n, dur*0.9)
    return amp * x * e

_pluck_cache = {}
def pluck(f, dur=2.2, bright=0.5, amp=0.5):
    """Karplus-Strong — پلاک زخیدهٔ واقعی (سانتور/پیانو/گیتار حس می‌دهد)"""
    key = (round(f, 2), bright)
    if key in _pluck_cache: return _pluck_cache[key]
    N = max(2, int(SR / f))
    buf = (np.random.rand(N) * 2 - 1) * (1 - bright*0.3)
    outlen = int(SR * dur)
    out = np.empty(outlen)
    idx = 0
    damp = 0.996 - bright * 0.02
    for i in range(outlen):
        nxt = (idx + 1) % N
        buf[idx] = damp * 0.5 * (buf[idx] + buf[nxt])
        out[i] = buf[idx]
        idx = nxt
    out *= np.minimum(1, np.arange(outlen)/(SR*0.004))
    m = np.abs(out).max() or 1
    out = out / m * amp
    _pluck_cache[key] = out
    return out

def pad_chord(freqs, dur, amp=0.16):
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for k, w in [(1, 1.0), (2, 0.4), (3, 0.18)]:
            x += w * np.sin(2*np.pi*f*k*t + np.random.rand()*6.28)
            x += w * 0.5 * np.sin(2*np.pi*f*1.003*k*t)  # detune
    e = np.minimum(1, t/ (dur*0.35)) * np.minimum(1, (dur - t)/(dur*0.35))
    return amp * x * e

def crackle(dur, amp=0.05):
    n = int(SR * dur)
    x = np.zeros(n)
    spots = np.random.rand(n) < 0.0004
    x[spots] = np.random.randn(spots.sum()) * amp
    x = np.convolve(x, np.ones(24)/24, mode="same")
    return x

def place(mix, snd, t0):
    i = int(t0 * SR)
    j = min(len(mix), i + len(snd))
    if j > i: mix[i:j] += snd[:j-i]

def normalize(mix, peak=0.88):
    m = np.abs(mix).max() or 1
    return mix / m * peak

def render(name, bpm, bars, build_fn):
    bar = 60 / bpm * 4
    dur = bars * bar
    mix = np.zeros(int(SR * (dur + 0.4)))
    build_fn(mix, bpm, bars, bar)
    mix = normalize(mix)
    n = int(SR * dur)
    fade = int(SR * 0.03)
    mix[:fade] *= np.linspace(0, 1, fade); mix[n-fade:n] *= np.linspace(1, 0, fade)
    mix = mix[:n]
    wav = f"/tmp/bank-music-{name}.wav"
    with wave.open(wav, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
                    "-c:a", "aac", "-b:a", "96k", f"{OUT}/{name}.m4a"], check=True)
    os.remove(wav)
    print(f"  ♪ {name}.m4a  ({dur:.1f}s @ {bpm}bpm)")

# نت‌ها (فرکانس)
N = {}
names = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"]
for octv in range(1, 7):
    for i, nm in enumerate(names):
        N[f"{nm}{octv}"] = 440 * 2 ** ((i - 9) / 12 + (octv - 4))

chord = lambda root, tones: [N[f"{r}{o}"] for r, o in zip(root, tones)]

# ── ۱) لو‌فای ──
def lofi(mix, bpm, bars, bar):
    prog = [chord(["F","A","C","E"], [3,3,3,4]), chord(["E","G","B","D"], [3,3,3,4]),
            chord(["D","F","A","C"], [3,3,3,4]), chord(["C","E","G","B"], [3,3,3,4])]
    roots = [N["F2"], N["E2"], N["D2"], N["C2"]]
    for b in range(bars):
        t0 = b * bar
        place(mix, pad_chord(prog[b % 4], bar, 0.13), t0)
        place(mix, bass(roots[b % 4], bar*0.9, 0.4), t0)
        place(mix, kick(), t0); place(mix, kick(), t0 + bar*0.5)
        for e in range(8):
            place(mix, hat(amp=0.14), t0 + e*bar/8 + (bar/16 if e % 2 else 0))
        place(mix, pluck(N["A4"], 1.2, 0.3, 0.12), t0 + bar*0.25)
        place(mix, pluck(N["C5"], 1.2, 0.3, 0.10), t0 + bar*0.75)
    mix += crackle(len(mix) / SR, 0.035)

# ── ۲) سینمایی حماسی ──
def epic(mix, bpm, bars, bar):
    prog = [chord(["A","C","E"], [2,3,3]), chord(["F","A","C"], [2,3,3]),
            chord(["C","E","G"], [3,3,3]), chord(["G","B","D"], [2,3,3])]
    for b in range(bars):
        t0 = b * bar
        place(mix, pad_chord(prog[b % 4], bar*1.05, 0.2), t0)
        place(mix, kick(0.5, 90, 38, 0.9), t0)
        place(mix, kick(0.4, 90, 38, 0.6), t0 + bar*0.75)
        place(mix, bass(N[f"{'AFCG'[b%4]}1"], bar*0.95, 0.5), t0)
        place(mix, clap(0.25, 0.28), t0 + bar*0.5)
        for e in range(4):
            place(mix, hat(0.08, 0.1), t0 + bar*e/4)
    # اوج آخر
    place(mix, pad_chord(chord(["A","C","E"], [3,4,4]), bar, 0.22), bars*bar - bar)

# ── ۳) الکترو پالس ──
def electro(mix, bpm, bars, bar):
    arp = [N["A3"], N["C4"], N["E4"], N["A4"], N["E4"], N["C4"]]
    for b in range(bars):
        t0 = b * bar
        for beat in range(4):
            place(mix, kick(0.25, 130, 48, 0.95), t0 + beat*bar/4)
            place(mix, hat(0.05, 0.3), t0 + beat*bar/4 + bar/8)
        place(mix, bass(N["A1"], bar/4*0.9, 0.5), t0)
        place(mix, bass(N["A1"], bar/4*0.9, 0.45), t0 + bar/2)
        for s in range(16):
            place(mix, pluck(arp[s % 6], 0.3, 0.75, 0.14), t0 + s*bar/16)
        place(mix, clap(0.2, 0.4), t0 + bar*0.25); place(mix, clap(0.2, 0.4), t0 + bar*0.75)

# ── ۴) تله/درایو ──
def trap(mix, bpm, bars, bar):
    for b in range(bars):
        t0 = b * bar
        place(mix, kick(0.4, 140, 42, 1.0), t0)
        place(mix, kick(0.35, 140, 42, 0.8), t0 + bar*0.625)
        # ۸۰۸ گلیو
        n808 = int(SR * bar*0.3)
        t = np.arange(n808)/SR
        f = N["F1"] * np.exp(-t*1.2) + N["F1"]*0.3
        x = np.tanh(np.sin(2*np.pi*np.cumsum(f)/SR)*1.8) * env_exp(n808, 0.3) * 0.6
        place(mix, x, t0 + bar*0.25); place(mix, x*0.8, t0 + bar*0.7)
        for s in range(12):
            place(mix, hat(0.04, 0.26 if s % 3 else 0.4), t0 + s*bar/12)
        place(mix, pluck(N["D4"], 0.5, 0.2, 0.3), t0)
        place(mix, pluck(N["Bb3"], 0.5, 0.2, 0.25), t0 + bar*0.5)

# ── ۵) پیانوی نرم ──
def piano(mix, bpm, bars, bar):
    mel = [("A3",0),("C4",0.5),("E4",1),("C4",2),("A3",3),("F3",3.5),
           ("A3",4),("C4",4.5),("E4",5),("G4",6),("E4",7),("C4",7.5),
           ("F3",8),("A3",8.5),("C4",9),("E4",10),("C4",11),
           ("G3",12),("B3",12.5),("D4",13),("G4",14),("B3",15)]
    for note, beat in mel:
        place(mix, pluck(N[note], 2.4, 0.25, 0.4), beat*bar/4)
    for b in range(0, bars, 2):
        place(mix, pad_chord(chord(["A","C","E"],[2,3,3]) if b%4==0 else chord(["F","A","C"],[2,3,3]), bar*2, 0.07), b*bar)

# ── ۶) کورپوریت پلاک ──
def corporate(mix, bpm, bars, bar):
    prog = [["C3","E3","G3"],["G2","B2","D3"],["A2","C3","E3"],["F2","A2","C2"]]
    for b in range(bars):
        t0 = b*bar
        for i, nm in enumerate(prog[b%4]):
            place(mix, pluck(N[nm], 0.8, 0.6, 0.3), t0 + i*bar/8)
            place(mix, pluck(N[nm]*2, 0.6, 0.6, 0.14), t0 + (i+4)*bar/8)
        place(mix, kick(0.22, 120, 50, 0.5), t0); place(mix, kick(0.22,120,50,0.4), t0+bar/2)
        place(mix, clap(0.15, 0.22), t0 + bar*0.25); place(mix, clap(0.15, 0.22), t0+bar*0.75)
        place(mix, bass(N[prog[b%4][0].replace("2","1").replace("3","1")], bar*0.5, 0.35), t0)

# ── ۷) ایرانی گرم (حجاز) ──
def persian(mix, bpm, bars, bar):
    scale = ["D3","Eb3","F#3","G3","A3","Bb3","C4","D4","C4","Bb3","A3","G3","F#3","Eb3","D3"]
    melody = [("D4",0,1.5),("Eb4",1.5,.5),("F#4",2,1),("G4",3,.5),("F#4",3.5,.5),("Eb4",4,1),
              ("D4",5,1),("C4",6,.5),("Bb3",6.5,.5),("A3",7,1),("G3",8,.5),("F#3",8.5,.5),
              ("G3",9,1),("A3",10,1.5),("Bb3",11.5,.5),("A3",12,.5),("G3",12.5,.5),("F#3",13,1),
              ("Eb3",14,.5),("D3",14.5,.5),("D3",15,1)]
    for note, beat, d in melody:
        place(mix, pluck(N[note], d*bar/4 + 0.6, 0.15, 0.42), beat*bar/4)
    place(mix, pad_chord([N["D2"], N["A2"], N["D3"]], bars*bar, 0.1), 0)
    for b in range(bars):
        t0 = b*bar
        place(mix, kick(0.3, 100, 55, 0.55), t0); place(mix, kick(0.2, 100, 55, 0.3), t0 + bar*0.5)
        place(mix, clap(0.1, 0.16), t0 + bar*0.75)

# ── ۸) پد رمانتیک ──
def romantic(mix, bpm, bars, bar):
    prog = [chord(["F","A","C"],[3,3,4]), chord(["G","B","D"],[3,3,4]),
            chord(["E","G","B"],[3,3,4]), chord(["A","C","E"],[3,3,4])]
    bells = ["A5","E5","C5","G5"]
    for b in range(bars):
        t0 = b*bar
        place(mix, pad_chord(prog[b%4], bar*1.1, 0.22), t0)
        place(mix, pluck(N[bells[b%4]], 1.6, 0.85, 0.1), t0 + bar*0.5)
        if b % 2 == 0:
            place(mix, bass(N["F1" if b%4==0 else "G1"], bar*0.9, 0.3), t0)

# ── ۹) امبینت تاریک ──
def dark(mix, bpm, bars, bar):
    place(mix, pad_chord([N["D1"], N["A1"], N["D2"], N["F2"]], bars*bar*1.02, 0.2), 0)
    for b in range(bars):
        t0 = b*bar
        place(mix, kick(0.6, 70, 34, 0.85), t0)
        place(mix, hat(0.1, 0.08), t0 + bar*0.5)
        if b % 2:
            place(mix, pluck(N["D4"], 0.7, 0.1, 0.2), t0 + bar*0.375)
            place(mix, pluck(N["C4"], 0.7, 0.1, 0.16), t0 + bar*0.625)

print("تولید موزیک...")
render("lofi-chill", 76, 4, lofi)
render("epic-cine", 88, 4, epic)
render("electro-pulse", 124, 4, electro)
render("trap-drive", 140, 4, trap)
render("soft-piano", 72, 8, piano)
render("corporate-pluck", 112, 4, corporate)
render("persian-warm", 66, 4, persian)
render("romantic-pads", 70, 4, romantic)
render("ambient-dark", 60, 4, dark)
total = sum(os.path.getsize(f"{OUT}/{f}") for f in os.listdir(OUT))
print(f"✅ {len(os.listdir(OUT))} فایل، مجموع {total/1024:.0f}KB")
