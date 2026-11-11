"""Synthesises the 50s soundtrack (ambient pad + piano + ocean) with numpy only.
usage: python3 audio.py out.wav"""
import sys, wave
import numpy as np

SR, DUR = 44100, 50.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
LOW = np.zeros(N)  # bass bus, kept out of the reverb

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def add(sigL, sigR, start, low=False):
    i = max(int(start * SR), 0); n = min(len(sigL), N - i)
    if n <= 0: return
    if low: LOW[i:i + n] += sigL[:n]
    else: L[i:i + n] += sigL[:n]; R[i:i + n] += sigR[:n]

def env(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    e[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    e[-nr:] *= np.cos(np.linspace(0, np.pi / 2, nr)) ** 2
    return e

def pad(m, start, dur, amp):
    n = int((dur + 2.0) * SR); tt = np.arange(n) / SR; f = hz(m)
    def voice(det):
        s = np.zeros(n)
        for k in range(1, 7):
            s += np.sin(2 * np.pi * f * det * k * tt + rng.uniform(0, 6.28)) / k ** 1.7
        return s
    e = env(n, 1.6, 2.4) * amp * (1 + 0.12 * np.sin(2 * np.pi * 0.21 * tt + m))
    add((voice(1.0) + voice(1.004)) * e, (voice(0.997) + voice(1.0015)) * e, start)

def piano(m, start, amp, pan=0.5):
    n = int(3.5 * SR); tt = np.arange(n) / SR; f = hz(m); s = np.zeros(n)
    for k, a in enumerate([1, 0.45, 0.22, 0.1, 0.05], 1):
        s += a * np.sin(2 * np.pi * f * k * (1 + 0.0004 * k * k) * tt) * np.exp(-tt * (1.1 + 0.7 * k))
    s *= np.minimum(1, tt / 0.006) * amp
    add(s * (1 - pan), s * pan, start)

def boom(start, amp):
    n = int(2.5 * SR); tt = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(38 + 45 * np.exp(-tt * 6)) / SR
    s = np.sin(ph) * np.exp(-tt * 1.6) * amp
    add(s, s, start, True)

def shaped_noise(n, lo, hi, tilt):
    spec = np.fft.rfft(rng.standard_normal(n)); fr = np.fft.rfftfreq(n, 1 / SR)
    g = np.where((fr > lo) & (fr < hi), 1.0 / np.maximum(fr, 20) ** tilt, 0.0)
    s = np.fft.irfft(spec * g, n); return s / np.abs(s).max()

def whoosh(end, amp, length=2.2):
    n = int(length * SR); tt = np.linspace(0, 1, n)
    a, b = shaped_noise(n, 300, 9000, 0.4), shaped_noise(n, 300, 9000, 0.4)
    e = tt ** 3 * amp
    add(a * e, b * e, end - length)

# harmony: one chord per 4s bar
chords = [  # (bass, pad notes, arpeggio notes)
    (45, [57, 60, 64, 71], [69, 72, 76, 79, 76, 72, 71, 72]),   # Am9
    (41, [53, 57, 60, 64], [69, 72, 76, 77, 76, 72, 69, 72]),   # Fmaj7
    (48, [55, 60, 64, 67], [67, 72, 76, 79, 76, 72, 67, 72]),   # C
    (43, [55, 59, 62, 69], [67, 71, 74, 79, 74, 71, 69, 71]),   # G(add9)
    (45, [57, 60, 64, 71], [69, 72, 76, 81, 76, 72, 71, 72]),
    (41, [53, 57, 60, 64], [69, 72, 77, 81, 77, 72, 69, 72]),
    (48, [55, 60, 64, 67], [72, 76, 79, 84, 79, 76, 72, 76]),
    (43, [55, 59, 62, 69], [71, 74, 79, 83, 79, 74, 71, 74]),
    (50, [57, 60, 65, 69], [69, 72, 77, 81, 77, 72, 69, 72]),   # Dm7
    (41, [53, 57, 60, 67], [69, 72, 76, 79, 76, 72, 69, 67]),   # Fmaj9
    (48, [55, 60, 64, 71], [67, 72, 76, 83, 79, 76, 72, 67]),   # Cmaj7
    (48, [55, 60, 64, 71], [72, 79, 76, 84]),
    (48, [55, 60, 64, 74], []),
]
for i, (b, pn, arp) in enumerate(chords):
    st = i * 4.0; last = i >= 11
    for m in pn: pad(m, st, 4.0 if not last else 6.0, 0.04)
    if i >= 4: pad(pn[1] + 12, st, 4.0, 0.022); pad(pn[-1] + 12, st, 4.0, 0.016)
    if i >= 2:
        n = int(5.5 * SR); tt = np.arange(n) / SR; f = hz(b - 12)
        s = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * env(n, 0.15, 2.0) * 0.085
        add(s, s, st, True)
    for k, m in enumerate(arp):
        if i == 0 and k < 2: continue
        step = 0.5 if len(arp) == 8 else 1.0
        vel = (0.19 if i >= 2 else 0.14) * (1.0 if k % 4 == 0 else 0.72) * (1.15 if 6 <= i <= 9 else 1.0)
        piano(m, st + k * step + rng.uniform(-0.008, 0.008), vel, 0.35 + 0.3 * ((k * 37) % 7) / 6)
        if i >= 6 and k % 2 == 0 and i < 11: piano(m + 12, st + k * step + 0.25, vel * 0.35, 0.7)
# pulse from the third shot
for bt in np.arange(16, 44, 1.0):
    n = int(0.4 * SR); tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(46 + 60 * np.exp(-tt * 30)) / SR) * np.exp(-tt * 9) * (0.07 if bt % 2 == 0 else 0.04)
    add(s, s, bt, True)
for c in [8, 16, 24, 32, 40]: boom(c, 0.2); whoosh(c, 0.10)
whoosh(0.9, 0.05, 0.9)

# reverb
def reverb(x, seed):
    r = np.random.default_rng(seed); n = int(3.2 * SR); tt = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-tt * 2.1); ir[: int(0.012 * SR)] = 0
    m = len(x) + n - 1; y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
    return y / np.sqrt((ir ** 2).sum())
wetL, wetR = reverb(L, 1), reverb(R, 2)
L = L + 0.55 * wetL + LOW; R = R + 0.55 * wetR + LOW

# ocean: swelling surf, strongest over the sea shots
def surf(seed):
    global rng
    rng = np.random.default_rng(seed)
    s = shaped_noise(N, 80, 7000, 0.55)
    sw = 0.5 + 0.5 * np.sin(2 * np.pi * t / 6.7 + seed) * np.sin(2 * np.pi * t / 11.3 + 1.0)
    return s * (0.35 + 0.65 * sw ** 2)
lvl = np.interp(t, [0, 3, 8, 16, 20, 24, 28, 32, 40, 46, 50], [0.30, 0.26, 0.12, 0.07, 0.14, 0.10, 0.20, 0.07, 0.10, 0.16, 0.14])
L += surf(11) * lvl; R += surf(12) * lvl

master = np.minimum(1, t / 1.0) * np.interp(t, [0, DUR - 2.8, DUR - 0.15, DUR], [1, 1, 0, 0])
st = np.stack([L, R], 1) * master[:, None]
st = np.tanh(st / np.abs(st).max() * 0.9) / np.tanh(0.9) * 0.89
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('ok', st.shape)
