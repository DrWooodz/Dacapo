"""
Build DaCapo's built-in music library from Mutopia Project LilyPond sources.

    git clone --filter=blob:none --no-checkout https://github.com/MutopiaProject/MutopiaProject
    (sparse-checkout the folders listed in PIECES), then:
    python3 tools/build_library.py /path/to/MutopiaProject/ftp

Writes src/data/library.json (compact note data) and prints a validation report.
Every piece must pass: zero bar-check errors, all notes inside the piano
range, every hand's notes inside a playable span, and consistent staff ends.
"""
import base64
import collections
import json
import math
import os
import re
import sys
from fractions import Fraction as F

sys.path.insert(0, os.path.dirname(__file__))
import lily  # noqa: E402

# key: (title, composer, year/opus, level 1-5, target quarter-note bpm, file, score index, hand rules, extra)
# level: 1 early intermediate ... 5 advanced
PIECES = [
    # ---------------- Satie
    dict(id='satie-enf-1', t='Petit prélude à la journée', sub='Enfantillages pittoresques I', c='satie', y=1913, lvl=1, bpm=104,
         f='SatieE/enfantillages_pittoresques/enfantillages_pittoresques-lys/enfantillages_pittoresques.ly', sc=0,
         tip='A short, cheerful children\'s piece: a perfect first piece to read. Keep the left hand light and even.'),
    dict(id='satie-enf-2', t='Berceuse', sub='Enfantillages pittoresques II', c='satie', y=1913, lvl=1, bpm=72,
         f='SatieE/enfantillages_pittoresques/enfantillages_pittoresques-lys/enfantillages_pittoresques.ly', sc=1,
         tip='A lullaby: rock gently in the left hand and let the melody float.'),
    dict(id='satie-enf-3', t='Marche du grand escalier', sub='Enfantillages pittoresques III', c='satie', y=1913, lvl=1, bpm=100,
         f='SatieE/enfantillages_pittoresques/enfantillages_pittoresques-lys/enfantillages_pittoresques.ly', sc=2,
         tip='A march up the grand staircase. Steady tempo, crisp rhythm.'),
    dict(id='satie-gym-1', t='Gymnopédie No. 1', c='satie', y=1888, lvl=2, bpm=66,
         f='SatieE/gymnopedie_1/gymnopedie_1.ly', sc=0, hands=[('var:middle', 'L'), ('var:bottom', 'L'), ('var:top', 'R')],
         tip='Three layers at once: bass, chord and melody. The left hand leaps from bass to chord on every bar; learn it alone until the leap is automatic.'),
    dict(id='satie-gym-2', t='Gymnopédie No. 2', c='satie', y=1888, lvl=2, bpm=66,
         f='SatieE/gymnopedie_2/gymnopedie_2.ly', sc=0, hands=[('var:middle', 'L'), ('var:bottom', 'L'), ('var:top', 'R')],
         tip='The same layered texture as No. 1 in a warmer color. Keep the left hand gentle and the melody singing.'),
    dict(id='satie-gym-3', t='Gymnopédie No. 3', c='satie', y=1888, lvl=2, bpm=60,
         f='SatieE/gymnopedie_3/gymnopedie_3.ly', sc=0, hands=[('var:bottom', 'L'), ('staff:bass', 'L'), ('var:top', 'R'), ('staff:treble', 'L')],
         tip='Darker and slower. The left hand carries bass and chords; the right hand has only the melody.'),
    dict(id='satie-gno-1', t='Gnossienne No. 1', c='satie', y=1890, lvl=2, bpm=60,
         f='SatieE/Gnossienne/no_1/no_1.ly', sc=0, hands=[('var:highVoice', 'R'), ('var:upperMiddle', 'L'), ('var:lowerMiddle', 'L'), ('var:lowVoice', 'L')],
         tip='Written without bar lines in the original. The left hand is a steady bass-and-chord pattern; keep the grace notes in the melody loose and late.'),
    dict(id='satie-gno-2', t='Gnossienne No. 2', c='satie', y=1890, lvl=2, bpm=56,
         f='SatieE/Gnossienne/no_2/no_2.ly', sc=0, hands=[('var:high_voice', 'R'), ('var:mid_treblestaff_voice', 'L'), ('var:mid_bassstaff_voice', 'L'), ('var:low_voice', 'L')],
         tip='A question without an answer: let each phrase hang. The left hand alternates bass and chord.'),
    dict(id='satie-gno-3', t='Gnossienne No. 3', c='satie', y=1890, lvl=2, bpm=60,
         f='SatieE/Gnossienne/no_3/no_3.ly', sc=0, hands=[('var:highVoice', 'R'), ('var:midTrebleStaffVoice', 'L'), ('var:midBassStaffVoice', 'L'), ('var:lowVoice', 'L')],
         tip='Hypnotic left-hand chords under a winding melody. Count steadily even where the music seems to float.'),
    # ---------------- Chopin
    dict(id='chopin-p7', t='Prelude in A major', sub='Op. 28 No. 7', c='chopin', y=1839, lvl=1, bpm=80,
         f='ChopinFF/O28/Chop-28-7/Chop-28-7-lys/chopin_prelude_op28_no7.ly', sc=0,
         tip='Eight short phrases in a mazurka rhythm. Shape each one as a single breath.'),
    dict(id='chopin-p4', t='Prelude in E minor', sub='Op. 28 No. 4', c='chopin', y=1839, lvl=2, bpm=56,
         f='ChopinFF/O28/Chop-28-4/Chop-28-4.ly', sc=0, hands=[('var:playRH', 'R'), ('var:playLH', 'L')],
         tip='The left-hand chords change one note at a time. Learn them alone, notice which note moves, and keep them soft and even under the melody.'),
    dict(id='chopin-p6', t='Prelude in B minor', sub='Op. 28 No. 6', c='chopin', y=1839, lvl=2, bpm=60,
         f='ChopinFF/O28/Chop-28-6/Chop-28-6-lys/chopin_prelude_op28_no6.ly', sc=0,
         tip='The melody is in the left hand. Make it sing; the right-hand repeated chords stay light.'),
    dict(id='chopin-p20', t='Prelude in C minor', sub='Op. 28 No. 20', c='chopin', y=1839, lvl=2, bpm=42,
         f='ChopinFF/O28/Chop-28-20/Chop-28-20.ly', sc=0,
         tip='A chorale of heavy chords. Voice the top line and keep the pulse broad and steady.'),
    dict(id='chopin-p2', t='Prelude in A minor', sub='Op. 28 No. 2', c='chopin', y=1839, lvl=3, bpm=56,
         f='ChopinFF/O28/Chop-28-2/Chop-28-2.ly', sc=0,
         tip='A strange, bleak prelude: a slow melody over a creeping left-hand pattern of intervals.'),
    dict(id='chopin-p9', t='Prelude in E major', sub='Op. 28 No. 9', c='chopin', y=1839, lvl=3, bpm=48,
         f='ChopinFF/O28/Chop-28-9/Chop-28-9.ly', sc=0,
         hands=[('varpre:rightHand','R'),('varpre:leftHand','L')],
         tip='Grand and solemn. Count the dotted rhythms precisely against the triplets.'),
    dict(id='chopin-p15', t='Prelude in D-flat major "Raindrop"', sub='Op. 28 No. 15', c='chopin', y=1839, lvl=3, bpm=60,
         f='ChopinFF/O28/Chop-28-15/Chop-28-15-lys/chopin_prelude_op28_no15.ly', sc=0,
         hands=[('varpre:sIrh','R'),('varpre:sIIrh','R'),('varpre:sIIIrh','R'),('varpre:sIlh','L'),('varpre:sIIlh','L'),('varpre:sIIIlh','L')],
         tip='The repeated A-flat is the rain. Keep it soft and even while the melody sings above it.'),
    dict(id='chopin-n72', t='Nocturne in E minor', sub='Op. 72 No. 1', c='chopin', y=1827, lvl=3, bpm=60,
         f='ChopinFF/O72/nocturne_in_e_minor/nocturne_in_e_minor.ly', sc=0,
         hands=[('var:rightNotes','R'),('var:leftNotes','L')],
         tip='Wide left-hand arpeggios almost throughout: ideal preparation for the later nocturnes.'),
    dict(id='chopin-w69-2', t='Waltz in B minor', sub='Op. 69 No. 2', c='chopin', y=1829, lvl=3, bpm=132,
         f='ChopinFF/O69/w10-h-moll-cfi/w10-h-moll-cfi.ly', sc=0,
         hands=[('var:rechts','R'),('var:links','L')],
         tip='Melancholy and flexible. Bass on beat 1, lighter chords on 2 and 3, so the melody can lean.'),
    dict(id='chopin-n9-2', t='Nocturne in E-flat major', sub='Op. 9 No. 2', c='chopin', y=1832, lvl=4, bpm=66,
         f='ChopinFF/O9/chopin_nocturne_op9_n2/chopin_nocturne_op9_n2.ly', sc=0,
         hands=[('var:upper','R'),('var:lower','L')],
         tip='Practice every ornament slowly and in rhythm before fitting it in. Left hand steady, right hand free.'),
    dict(id='chopin-w64-1', t='Waltz in D-flat major "Minute"', sub='Op. 64 No. 1', c='chopin', y=1847, lvl=4, bpm=184,
         f='ChopinFF/O64/chopin_valse_op64_no1/chopin_valse_op64_no1-lys/chopin_valse_op64_no1.ly', sc=0,
         hands=[('varsuf:RHnotes','R'),('varsuf:LHnotes','L')],
         tip='Light and quick. Build speed with short bursts; the running right hand must stay relaxed.'),
    dict(id='chopin-fi', t='Fantaisie-Impromptu', sub='Op. 66', c='chopin', y=1834, lvl=5, bpm=168,
         f='ChopinFF/O66/chopin_fantaisie-impromptu/chopin_fantaisie-impromptu.ly', sc=0,
         tempos=[(1, 168), (41, 60), (43, 90), (83, 168)],
         hands=[('varsuf:right','R'),('varsuf:left','L'),('varpre:multiple','L'),('var:lower','L'),('var:upper','R')],
         tip='Four against three throughout. Learn each hand alone, then put them together very slowly; speed comes last.'),
    # ---------------- Debussy
    dict(id='debussy-delphes', t='Danseuses de Delphes', sub='Préludes I, No. 1', c='debussy', y=1910, lvl=3, bpm=44,
         f='DebussyC/L117/debussy-L117-prels/debussy-L117-prels-lys/debussy-L117-prels.ly', sc=0,
         tip='Slow and grave, like a frieze. Balance the chords so the top line is always heard.'),
    dict(id='debussy-arab-1', t='Arabesque No. 1', c='debussy', y=1891, lvl=4, bpm=72,
         f='DebussyC/L66/debussy_Arabesque_1/debussy_Arabesque_1.ly', sc=0,
         hands=[('varpre:rh','R'),('varpre:lh','L')],
         tip='Flowing triplets and two-against-three. Practice those spots hands separately, counting, then together very slowly.'),
    dict(id='debussy-arab-2', t='Arabesque No. 2', c='debussy', y=1891, lvl=4, bpm=108,
         f='DebussyC/L66/debussy_Arabesque_2/debussy_Arabesque_2.ly', sc=0,
         hands=[('var:upper','R'),('var:lower','L')],
         tip='Playful and light. Keep the triplet figures crisp and the hands relaxed.'),
    dict(id='debussy-clair', t='Clair de lune', sub='Suite bergamasque', c='debussy', y=1905, lvl=4, bpm=54,
         f='DebussyC/L75/debussy_Ste_Bergamesq_Clair/debussy_Ste_Bergamesq_Clair.ly', sc=0,
         hands=[('var:rhUpRed', 'R'), ('var:rhDownGreen', 'R'), ('var:lhUpBlue', 'L'), ('var:lhDownGrey', 'L')],
         tip='Count the 9/8 carefully in the opening; the rhythm is subtler than it sounds. In the flowing middle, move the arm with the arpeggios instead of stretching.'),
    dict(id='debussy-voiles', t='Voiles', sub='Préludes I, No. 2', c='debussy', y=1910, lvl=4, bpm=88,
         f='DebussyC/L117/debussy-L117-prels/debussy-L117-prels-lys/debussy-L117-prels.ly', sc=1,
         tip='Built on the whole-tone scale. Keep the low B-flat pedal point soft and let the textures blur gently.'),
    # ---------------- Rachmaninoff
    dict(id='rach-op3-2', t='Prelude in C-sharp minor', sub='Op. 3 No. 2', c='rachmaninoff', y=1892, lvl=4, bpm=52,
         f='RachmaninoffS/O3/rach-prelude-op3-no2/rach-prelude-op3-no2.ly', sc=0,
         hands=[('staff:upA', 'R'), ('staff:upB', 'R'), ('staff:downA', 'L'), ('staff:downB', 'L')],
         tempos=[(1, 52), (15, 132), (44, 52)],
         tip='Learn the quiet outer sections first. For the climax, use arm weight and release; never push.'),
    dict(id='rach-op23-4', t='Prelude in D major', sub='Op. 23 No. 4', c='rachmaninoff', y=1903, lvl=5, bpm=56,
         f='RachmaninoffS/O23/rach-prelude23-04/rach-prelude23-04.ly', sc=0,
         hands=[('var:RH','R'),('var:LH','L')],
         tip='Three layers: bass, rippling middle and melody. Practice each layer alone, then in pairs.'),
    dict(id='rach-op23-5', t='Prelude in G minor', sub='Op. 23 No. 5', c='rachmaninoff', y=1901, lvl=5, bpm=100,
         f='RachmaninoffS/O23/rach-prelude23-05/rach-prelude23-05.ly', sc=0,
         hands=[('varpre:RH','R'),('varpre:LH','L')],
         tip='A march in repeated chords. Practice wrist staccato slowly and keep the forearm relaxed.'),
]


# ---------------------------------------------------------------- helpers
def varint(n, out):
    while True:
        b = n & 0x7f
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def zz(n):
    return (n << 1) ^ (n >> 31) if n >= 0 else ((-n) << 1) - 1


def b64(bs):
    return base64.b64encode(bytes(bs)).decode('ascii')


def meta_of(path):
    txt = ''
    base = os.path.dirname(path)
    seen = set()

    def grab(p):
        if p in seen or not os.path.exists(p):
            return
        seen.add(p)
        nonlocal txt
        s = open(p, encoding='utf-8', errors='replace').read()
        txt += s
        for inc in re.findall(r'\\include\s+"([^"]+)"', s):
            grab(os.path.join(os.path.dirname(p), inc))
    grab(path)
    g = lambda k: (re.search(k + r'\s*=\s*"([^"]*)"', txt) or [None, None])[1]
    lic = g('license') or ''
    if not lic:  # older Mutopia files keep the license in the copyright field
        c = g('copyright') or ''
        if c and ('Public Domain' in c or 'Creative Commons' in c):
            lic = c
    return dict(license=lic, maintainer=g('maintainer') or g('enteredby') or '', footer=g('footer') or '', source=g('source') or '')


ACC = {'bb': 0, 'b': 1, '': 2, '#': 3, '##': 4}
LETTERS = 'CDEFGAB'


def acc_of(sp):
    m = re.match(r'([A-G])(bb|b|##|#)?(-?\d+)', sp)
    return ACC[m.group(2) or '']


def hand_of(n, rules, staves):
    for key, h in rules:
        kind, _, val = key.partition(':')
        if kind == 'var' and val in n['vars']:
            return h
        if kind == 'varpre' and any(v.startswith(val) for v in n['vars']):
            return h
        if kind == 'varsuf' and any(v.endswith(val) for v in n['vars']):
            return h
        if kind == 'staff' and n['staff'] == val:
            return h
    k = staves.index(n['staff']) if n['staff'] in staves else 0
    return 'R' if k < max(1, len(staves) // 2) else 'L'


def build(root, p):
    path = os.path.join(root, p['f'])
    P, ev, bars, times, errs = lily.parse_file(path, p['sc'])
    meta = meta_of(path)
    problems = []
    if not meta['license']:
        problems.append('no license found in the source')
    rp = [w for w in P.warn if 'duration without pitch' in w]
    if rp and not p.get('allow_repeat_pitch'):
        problems.append('duration-only notes: ' + ', '.join(rp[:3]))
    stray = [w for w in P.warn if 'stray word' in w]
    if stray:
        print("   note:", p["id"], stray[:4], file=sys.stderr)
    if errs:
        problems.append(f'{len(errs)} bar-check errors (first at {errs[0][1]})')
    staves = ev.staff_names
    rules = p.get('hands', [])
    notes = []
    for n in ev.notes:
        h = hand_of(n, rules, staves)
        st = staves.index(n['staff']) if n['staff'] in staves else 0
        disp = 0 if st < max(1, len(staves) // 2) else 1
        if len(staves) == 3:  # e.g. Voiles: the extra staff is a low pedal staff
            disp = 0 if st == 0 else 1
        notes.append(dict(t=n['t'] * 4, d=n['dur'] * 4, m=n['m'], acc=acc_of(n['sp']), h=0 if h == 'R' else 1, s=disp,
                          f=(n['fingers'] or [0])[0] if n['fingers'] else 0))
    # dedupe: same hand, onset and pitch (notational doublings); keep the longest
    best = {}
    for n in notes:
        k = (n['h'], n['t'], n['m'])
        if k not in best or n['d'] > best[k]['d']:
            best[k] = n
    dups = len(notes) - len(best)
    notes = sorted(best.values(), key=lambda n: (n['t'], n['h'], n['m']))
    # same pitch struck by both hands at once: keep it in the hand whose staff it is on
    seen = {}
    final = []
    for n in notes:
        k = (n['t'], n['m'])
        if k in seen:
            o = seen[k]
            keep = n if (n['s'] == n['h']) and not (o['s'] == o['h']) else o
            if keep is n:
                final[final.index(o)] = n
                seen[k] = n
            continue
        seen[k] = n
        final.append(n)
    cross = len(notes) - len(final)
    notes = final
    if not notes:
        problems.append('no notes')
        return None, problems
    lo, hi = min(n['m'] for n in notes), max(n['m'] for n in notes)
    if lo < 21 or hi > 108:
        problems.append(f'notes outside the piano: {lo}..{hi}')
    # playable span per hand at each onset (one hand rarely spans more than a tenth)
    wide = 0
    by = collections.defaultdict(list)
    for n in notes:
        by[(n['h'], n['t'])].append(n['m'])
    for (h, t), ms in by.items():
        if max(ms) - min(ms) > 16:
            wide += 1
    # the music ends with its last note: drop bar lines after it (some sources carry empty bars at the end)
    last_end = max(n['t'] + n['d'] for n in notes)
    keep = next((k for k, b in enumerate(bars) if k and b * 4 >= last_end), len(bars) - 1)
    if keep < len(bars) - 1:
        print("   note:", p["id"], f"{len(bars) - 1 - keep} empty bars after the last note dropped", file=sys.stderr)
        bars = bars[:keep + 1]
    # ticks per quarter
    dens = [x.denominator for n in notes for x in (n['t'], n['d'])] + [(b * 4).denominator for b in bars]
    tpq = 1
    for d in dens:
        tpq = tpq * d // math.gcd(tpq, d)
    if tpq > 2000000:
        problems.append(f'ticks per quarter too large: {tpq}')
    # grace notes sit 1/16 quarter before their main note; make sure onsets are >= 0
    shift = F(0)
    mn = min(n['t'] for n in notes)
    if mn < 0:
        shift = -mn
    toi = lambda x: int((x + shift) * tpq)
    # encode notes
    buf = []
    fing = []
    prev_t = 0
    prev_m = [60, 48]
    for idx, n in enumerate(notes):
        t = toi(n['t'])
        varint(t - prev_t, buf)
        prev_t = t
        varint(int(n['d'] * tpq), buf)
        varint(zz(n['m'] - prev_m[n['h']]), buf)
        prev_m[n['h']] = n['m']
        buf.append(n['acc'] + 5 * n['h'] + 10 * n['s'])
        if n['f']:
            fing.extend([idx, n['f']])
    fb = []
    pi = 0
    for i in range(0, len(fing), 2):
        varint(fing[i] - pi, fb)
        pi = fing[i]
        varint(fing[i + 1], fb)
    # bars (ticks)
    bt = [toi(b * 4) for b in bars]
    bb = []
    pv = 0
    for b in bt:
        varint(b - pv, bb)
        pv = b
    nbars = len(bars) - 1
    # sections: about four bars, fewer when dense
    counts = [0] * nbars
    import bisect
    for n in notes:
        k = min(nbars - 1, max(0, bisect.bisect_right(bars, n['t'] / 4) - 1))
        counts[k] += 1
    first_full = 1 if ev.partial else 0
    secs = []
    i = 0
    # a pickup bar joins the first section
    while i < nbars:
        size = 4
        dens_ = sum(counts[i + first_full if i == 0 else i:i + 4 + (first_full if i == 0 else 0)]) / 4
        if dens_ > 40:
            size = 1
        elif dens_ > 22:
            size = 2
        j = min(nbars, i + size + (first_full if i == 0 else 0))
        secs.append([i, j])
        i = j
    if len(secs) > 1 and secs[-1][1] - secs[-1][0] == 1 and (secs[-2][1] - secs[-2][0]) <= 2:
        secs[-2][1] = secs[-1][1]
        secs.pop()
    # a section in which no note starts (a held chord, a long rest) cannot be practiced on its own: it joins
    # the section before it (or, at the very start, the one after it)
    starts = lambda a, z: any(bars[a] * 4 <= n['t'] < bars[z] * 4 for n in notes)
    merged = []
    for a, z in secs:
        if merged and not starts(a, z):
            merged[-1][1] = z
        else:
            merged.append([a, z])
    if len(merged) > 1 and not starts(*merged[0]):
        merged[1][0] = merged[0][0]
        merged.pop(0)
    secs = merged
    # identical sections (repeats) share progress
    sig = []
    for a, z in secs:
        s0, s1 = bars[a] * 4, bars[z] * 4
        sg = tuple((n['t'] - s0, n['d'], n['m'], n['h']) for n in notes if s0 <= n['t'] < s1)
        sig.append(sg)
    for k in range(len(secs)):
        same = -1
        for j in range(k):
            if sig[j] == sig[k] and sig[k]:
                same = j
                break
        secs[k].append(same)
    # time signatures and keys as (bar index, ...)
    def bar_of(t):
        return max(0, bisect.bisect_right(bars, t) - 1)
    ts = sorted({(bar_of(t), n, d) for (t, n, d) in times if n != 'partial'})
    ks = sorted({(bar_of(t), f) for (t, f) in ev.keys})
    ks2 = []
    for b, f in ks:
        if ks2 and ks2[-1][0] == b:
            ks2[-1] = [b, f]
        elif not ks2 or ks2[-1][1] != f:
            ks2.append([b, f])
    # clefs per display staff, as (bar, staff 0/1, 't'|'b'); only treble and bass matter here
    cl = []
    for (t, stn, name) in sorted(ev.clefs, key=lambda x: x[0]):
        nm = str(name).strip('"')
        kind = 't' if nm.startswith('treble') or nm.startswith('G') or nm == 'violin' else 'b' if nm.startswith('bass') or nm.startswith('F') else None
        if kind is None or stn not in staves:
            continue
        si = staves.index(stn)
        disp = 0 if si < max(1, len(staves) // 2) else 1
        if len(staves) == 3:
            disp = 0 if si == 0 else 1
        cl.append([bar_of(t), disp, kind])
    cl2 = []
    for c in cl:
        prev = [x for x in cl2 if x[1] == c[1]]
        if prev and prev[-1][2] == c[2]:
            continue
        if prev and prev[-1][0] == c[0]:
            cl2.remove(prev[-1])
        cl2.append(c)
    out = dict(id=p['id'], t=p['t'], sub=p.get('sub', ''), c=p['c'], y=p['y'], lvl=p['lvl'], bpm=p['bpm'], tip=p['tip'],
               tempos=p.get('tempos', []), tpq=tpq, shift=float(shift), pickup=bool(ev.partial), nb=nbars,
               ts=[list(x) for x in ts], keys=ks2, clefs=cl2, bars=b64(bb), notes=b64(buf), fing=b64(fb), n=len(notes),
               secs=secs, lic=meta['license'], by=meta['maintainer'], mut=meta['footer'],
               src=meta['source'])
    stats = dict(notes=len(notes), dups=dups, cross=cross, wide=wide, tpq=tpq, bars=nbars, secs=len(secs), same=sum(1 for s in secs if s[2] >= 0), bytes=len(out['notes']))
    return (out, stats, notes, bars, ev), problems


def first_bars(notes, bars, k=2):
    lines = []
    end = bars[min(len(bars) - 1, k)] * 4
    for h in (0, 1):
        g = collections.OrderedDict()
        for n in notes:
            if n['h'] == h and n['t'] < end:
                g.setdefault(n['t'], []).append(n)
        lines.append(('RH' if h == 0 else 'LH') + ': ' + '  '.join(
            '+'.join(LETTERS[0] if False else name(x) for x in sorted(v, key=lambda x: x['m'])) + f'/{float(v[0]["d"]):g}' for t, v in g.items()))
    return lines


NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def name(n):
    # reconstruct the spelled name from midi + accidental
    alt = n['acc'] - 2
    pc = (n['m'] - alt) % 12
    letter = {0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B'}.get(pc, '?')
    o = (n['m'] - alt) // 12 - 1
    return f"{letter}{['bb', 'b', '', '#', '##'][n['acc']]}{o}"


if __name__ == '__main__':
    root = sys.argv[1]
    outp = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'library.json')
    lib = []
    bad = 0
    total = 0
    for p in PIECES:
        try:
            res, problems = build(root, p)
        except Exception as e:
            print(f'FAIL {p["id"]}: {type(e).__name__}: {e}')
            bad += 1
            continue
        if res is None or problems:
            print(f'FAIL {p["id"]}: {"; ".join(problems)}')
            bad += 1
            continue
        out, stats, notes, bars, ev = res
        total += len(out['notes'])
        print(f'ok   {p["id"]:16s} {stats}')
        if '-v' in sys.argv:
            for l in first_bars(notes, bars, 2):
                print('       ' + l[:220])
        lib.append(out)
    json.dump(lib, open(outp, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(f'{len(lib)} pieces, {bad} failed, note data {total / 1024:.0f} KB, file {os.path.getsize(outp) / 1024:.0f} KB')
