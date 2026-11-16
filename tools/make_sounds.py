"""Generates original synthesized sound effects (no copyrighted audio). Run: python3 tools/make_sounds.py"""
import wave, struct, math, random, os
R = 22050
def seg(f0, f1, d, shape="sine", v=.5, noise=0.0, vib=0.0):
    n = int(R * d); out = []; ph = 0.0; lp = 0.0
    for i in range(n):
        t = i / n; f = f0 + (f1 - f0) * t + vib * math.sin(60 * t); ph += 2 * math.pi * f / R
        if shape == "sine": s = math.sin(ph)
        elif shape == "square": s = 1.0 if math.sin(ph) > 0 else -1.0
        elif shape == "saw": s = 2 * ((ph / (2 * math.pi)) % 1) - 1
        else: s = (2 / math.pi) * math.asin(math.sin(ph))
        if noise: lp += .2 * (random.uniform(-1, 1) - lp); s = s * (1 - noise) + lp * 3 * noise
        out.append(s * v * min(1, i / (R * .004)) * (1 - t) ** 1.3)
    return out
def mix(*ps):
    m = max(len(p) for p in ps); return [sum(p[i] for p in ps if i < len(p)) for i in range(m)]
def gap(d): return [0.0] * int(R * d)
def save(name, *parts):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "sounds", name + ".wav")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = [x for p in parts for x in p]
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(R)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 30000)) for x in data))
C5, E5, G5, C6 = 523, 659, 784, 1047
save("ui/click", seg(900, 600, .05, "square", .3))
save("ui/transition", seg(300, 800, .3, "tri", .45))
save("story/dialogue", seg(440, 440, .05, "square", .25), gap(.03), seg(520, 520, .05, "square", .25), gap(.03), seg(480, 480, .07, "square", .25))
save("story/secret-door", mix(seg(80, 50, 1.0, "saw", .35), seg(0, 0, 1.0, "sine", .5, 1.0)))
save("story/portal", mix(seg(200, 1200, .8, "sine", .35, vib=80), seg(400, 2400, .8, "tri", .15)))
save("story/clue", seg(880, 880, .12, "sine", .4), seg(1320, 1320, .22, "sine", .4))
save("rewards/reward", seg(C5, C5, .1, "tri", .4), seg(E5, E5, .1, "tri", .4), seg(G5, G5, .1, "tri", .4), seg(C6, C6, .35, "tri", .45))
alarm = seg(500, 500, .15, "square", .3) + seg(700, 700, .15, "square", .3)
save("boss/boss-intro", mix(alarm * 3, seg(60, 40, .9, "saw", .4)))
save("boss/boss-charge", mix(seg(100, 700, .9, "saw", .3), seg(0, 0, .9, "sine", .25, 1.0)))
save("boss/boss-hit", mix(seg(0, 0, .25, "sine", .6, 1.0), seg(180, 50, .25, "sine", .7)))
save("boss/boss-error", seg(220, 110, .35, "square", .35))
save("boss/boss-victory", seg(C5, C5, .12, "tri", .45), seg(C5, C5, .12, "tri", .45), seg(C5, C5, .12, "tri", .45), seg(G5, G5, .3, "tri", .5), seg(C6, C6, .6, "tri", .5))
save("boss/game-over", seg(392, 392, .25, "square", .3), seg(349, 349, .25, "square", .3), seg(311, 311, .25, "square", .3), seg(262, 262, .7, "square", .3))
mel = [440,523,659,523, 587,659,784,659, 523,587,659,587, 440,523,587,523] * 2
bass = [110, 87, 98, 82]
save("music/ambient", mix(sum((seg(f, f, .25, "tri", .18) for f in mel), []), sum((seg(b, b, 2.0, "sine", .3) for b in bass), [])))
print("done")
