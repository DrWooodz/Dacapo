"""
A LilyPond-subset reader for piano scores from the Mutopia Project.

It reads the notes (pitch, onset, duration, staff, voice) out of hand-typeset
LilyPond files without running LilyPond itself. It understands the constructs
Mutopia piano scores use: variables, relative and absolute pitch, chords and
chord repetition, ties, tuplets, grace notes, repeats (unfolded), voices,
staff changes, partial bars, time and key signatures, English and Dutch note
names, and it skips layout commands, markup and Scheme.

Every bar check ("|") in the source is verified against the time signature,
so parsing mistakes show up as bar-check errors instead of wrong notes.
"""
import copy
import os
import re
from fractions import Fraction as F

# ---------------------------------------------------------------- tokens
SYMS = ['<<', '>>', '\\\\', '{', '}', '<', '>', '(', ')', '[', ']', '~', '|', '=', "'", ',', '.', '!', '?', '-', '^', '_', '*', '/', ':', '+', '@']


class Tok:
    __slots__ = ('k', 'v', 'ws', 'pos', 'src')

    def __init__(self, k, v, ws, pos, src):
        self.k, self.v, self.ws, self.pos, self.src = k, v, ws, pos, src

    def __repr__(self):
        return f'{self.k}:{self.v!r}'


def read_scheme(s, i):
    """s[i] == '#' or '$'. Returns end index of the Scheme datum."""
    n = len(s)
    i += 1
    if i < n and s[i] == '#':  # ##t ##f ##x01C0
        i += 1
        while i < n and not s[i].isspace() and s[i] not in '{}()<>[]"':
            i += 1
        return i
    if i < n and s[i] == '{':  # #{ lilypond #}
        j = s.find('#}', i)
        return j + 2 if j >= 0 else n
    while i < n and s[i] in "'`,":
        i += 1
    if i < n and s[i] == ' ' and s[i - 1] in "'`":
        while i < n and s[i] == ' ':
            i += 1
    if i < n and s[i] == '(':
        depth = 0
        while i < n:
            c = s[i]
            if c == '"':
                i += 1
                while i < n and s[i] != '"':
                    i += 2 if s[i] == '\\' else 1
            elif c == ';':
                while i < n and s[i] != '\n':
                    i += 1
                continue
            elif c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    return i + 1
            i += 1
        return n
    if i < n and s[i] == '"':
        i += 1
        while i < n and s[i] != '"':
            i += 2 if s[i] == '\\' else 1
        return i + 1
    if i < n and s[i] == '#':
        return read_scheme(s, i)
    while i < n and not s[i].isspace() and s[i] not in '{}()<>[]"':
        i += 1
    return i


def tokenize(s, src='?'):
    out = []
    i, n = 0, len(s)
    ws = True
    while i < n:
        c = s[i]
        if c.isspace():
            ws = True
            i += 1
            continue
        if s.startswith('%{', i):
            j = s.find('%}', i + 2)
            i = n if j < 0 else j + 2
            ws = True
            continue
        if c == '%':
            j = s.find('\n', i)
            i = n if j < 0 else j + 1
            ws = True
            continue
        if c == '"':
            j = i + 1
            buf = []
            while j < n and s[j] != '"':
                if s[j] == '\\' and j + 1 < n:
                    buf.append(s[j + 1])
                    j += 2
                else:
                    buf.append(s[j])
                    j += 1
            out.append(Tok('str', ''.join(buf), ws, i, src))
            i = j + 1
            ws = False
            continue
        if c in '#$':
            j = read_scheme(s, i)
            out.append(Tok('scm', s[i:j], ws, i, src))
            i = j
            ws = False
            continue
        if c == '\\':
            if i + 1 < n and s[i + 1] == '\\':
                out.append(Tok('sym', '\\\\', ws, i, src))
                i += 2
                ws = False
                continue
            m = re.compile(r'[A-Za-z]([A-Za-z_-]*[A-Za-z])?').match(s, i + 1)
            if m:
                out.append(Tok('cmd', m.group(0), ws, i, src))
                i = m.end()
            else:  # \( \) \[ \] \< \> \! \~ \= etc
                out.append(Tok('cmd', s[i + 1], ws, i, src))
                i += 2
            ws = False
            continue
        if '0' <= c <= '9':
            m = re.compile(r'\d+').match(s, i)
            out.append(Tok('num', m.group(0), ws, i, src))
            i = m.end()
            ws = False
            continue
        if ('a' <= c <= 'z') or ('A' <= c <= 'Z'):
            m = re.compile(r'[A-Za-z]+').match(s, i)
            out.append(Tok('word', m.group(0), ws, i, src))
            i = m.end()
            ws = False
            continue
        for sy in SYMS:
            if s.startswith(sy, i):
                out.append(Tok('sym', sy, ws, i, src))
                i += len(sy)
                break
        else:
            i += 1  # unknown char: skip
        ws = False
    return out


# ---------------------------------------------------------------- note names
STEP = {'c': 0, 'd': 1, 'e': 2, 'f': 3, 'g': 4, 'a': 5, 'b': 6}
SEMI = [0, 2, 4, 5, 7, 9, 11]


def build_names(lang):
    names = {}
    if lang == 'english':
        for l, st in STEP.items():
            names[l] = (st, 0)
            names[l + 's'] = (st, 1); names[l + 'sharp'] = (st, 1)
            names[l + 'f'] = (st, -1); names[l + 'flat'] = (st, -1)
            names[l + 'ss'] = (st, 2); names[l + 'x'] = (st, 2); names[l + 'sharpsharp'] = (st, 2)
            names[l + 'ff'] = (st, -2); names[l + 'flatflat'] = (st, -2)
    else:  # nederlands (default)
        for l, st in STEP.items():
            names[l] = (st, 0)
            names[l + 'is'] = (st, 1); names[l + 'isis'] = (st, 2)
            names[l + 'es'] = (st, -1); names[l + 'eses'] = (st, -2)
        names['as'] = (5, -1); names['ases'] = (5, -2); names['aes'] = (5, -1); names['aeses'] = (5, -2)
        names['es'] = (2, -1); names['eses'] = (2, -2); names['ees'] = (2, -1); names['eeses'] = (2, -2)
        if lang == 'deutsch':
            for k in [k for k in names if k.startswith('b')]:
                del names[k]
            names.update({'h': (6, 0), 'his': (6, 1), 'hisis': (6, 2), 'b': (6, -1), 'heses': (6, -2), 'hes': (6, -1)})
    return names


# ---------------------------------------------------------------- AST
class N:  # generic node
    def __init__(self, t, **kw):
        self.t = t
        self.__dict__.update(kw)

    def __repr__(self):
        return f'N({self.t})'


ZERO_ARG_SKIP = set()  # everything unknown is treated as zero-arg


class ParseError(Exception):
    pass


class Parser:
    def __init__(self, path, lang='nederlands'):
        self.base = os.path.dirname(path)
        self.lang = lang
        self.names = build_names(lang)
        self.vars = {}
        self.scores = []
        self.warn = []
        self.last_dur = F(1, 4)
        self.allow_ws_dur = True
        self.toks = self.load(path)
        self.i = 0

    # ---- includes are inlined at token level
    def load(self, path, depth=0):
        with open(path, encoding='utf-8', errors='replace') as f:
            s = f.read()
        toks = tokenize(s, os.path.basename(path))
        out = []
        k = 0
        while k < len(toks):
            t = toks[k]
            if t.k == 'cmd' and t.v == 'include' and k + 1 < len(toks) and toks[k + 1].k == 'str':
                fn = toks[k + 1].v
                if fn in ('english.ly', 'nederlands.ly', 'deutsch.ly'):
                    out.append(Tok('lang', fn[:-3], True, t.pos, t.src))
                elif fn in ('italiano.ly', 'espanol.ly', 'catalan.ly', 'portugues.ly', 'suomi.ly', 'svenska.ly', 'vlaams.ly', 'norsk.ly'):
                    raise ParseError('unsupported language ' + fn)
                else:
                    p = os.path.join(os.path.dirname(path), fn)
                    if os.path.exists(p) and depth < 5:
                        out.extend(self.load(p, depth + 1))
                    else:
                        self.warn.append('include not found (ignored): ' + fn)
                k += 2
                continue
            if t.k == 'cmd' and t.v == 'language' and k + 1 < len(toks) and toks[k + 1].k == 'str':
                lg = toks[k + 1].v
                if lg not in ('english', 'nederlands', 'deutsch'):
                    raise ParseError('unsupported language ' + lg)
                out.append(Tok('lang', lg, True, t.pos, t.src))
                k += 2
                continue
            out.append(t)
            k += 1
        return out

    # ---- token helpers
    def peek(self, o=0):
        j = self.i + o
        return self.toks[j] if j < len(self.toks) else None

    def next(self):
        t = self.peek()
        self.i += 1
        return t

    def at(self, k, v=None, o=0):
        t = self.peek(o)
        return t is not None and t.k == k and (v is None or t.v == v)

    def expect(self, k, v=None):
        t = self.next()
        if t is None or t.k != k or (v is not None and t.v != v):
            raise ParseError(f'expected {k} {v!r}, got {t!r} at {self.where(t)}')
        return t

    def where(self, t=None):
        t = t or self.peek()
        return f'{t.src}@{t.pos}' if t else 'EOF'

    def skip_block(self):
        """skip a balanced {...} block"""
        if not self.at('sym', '{'):
            return
        depth = 0
        while self.peek() is not None:
            t = self.next()
            if t.k == 'sym' and t.v == '{':
                depth += 1
            elif t.k == 'sym' and t.v == '}':
                depth -= 1
                if depth == 0:
                    return

    def skip_markup(self):
        # \markup already consumed: markup functions with scheme args, then one {...}, string or word
        while True:
            t = self.peek()
            if t is None:
                return
            if t.k == 'sym' and t.v == '{':
                self.skip_block()
                return
            if t.k in ('str', 'word', 'num'):
                self.next()
                return
            if t.k == 'cmd' and t.v not in self.vars:
                self.next()
                continue
            if t.k == 'cmd':
                self.next()
                return
            if t.k == 'scm':
                self.next()
                continue
            return

    def skip_path(self):
        """Context.Grob.property or #'prop sequences without whitespace; returns the text"""
        first = True
        txt = ''
        while True:
            t = self.peek()
            if t is None:
                return txt
            if not first and t.ws:
                return txt
            if t.k in ('word', 'num') or (t.k == 'sym' and t.v in ('.', '-', '_')) or t.k == 'scm':
                self.next()
                txt += t.v
                first = False
                continue
            return txt

    def skip_number(self):
        if self.at('sym', '-') or self.at('sym', '+'):
            self.next()
        if self.at('num'):
            self.next()
            if self.at('sym', '.') and self.at('num', None, 1) and not self.peek(1).ws:
                self.next(); self.next()
            return True
        if self.at('sym', '.') and self.at('num', None, 1):
            self.next(); self.next()
            return True
        return False

    def skip_value(self):
        t = self.peek()
        if t is None:
            return
        if (t.k == 'sym' and t.v in ('-', '+') and self.at('num', None, 1)) or t.k == 'num':
            self.skip_number()
            while self.at('sym', ',') and self.at('num', None, 1):  # lists like 1,1 or 2,2,3
                self.next()
                self.skip_number()
            return
        if t.k == 'cmd' and t.v == 'markup':
            self.next()
            self.skip_markup()
        elif t.k == 'sym' and t.v == '{':
            self.skip_block()
        elif t.k == 'sym' and t.v == '-':
            self.next()
            self.next()
        else:
            self.next()

    # ---- durations
    def parse_duration(self, required=False):
        t = self.peek()
        d = None
        if t is not None and t.k == 'num' and (not t.ws or self.allow_ws_dur):
            v = int(t.v)
            if v not in (1, 2, 4, 8, 16, 32, 64, 128):
                raise ParseError(f'bad duration {v} at {self.where(t)}')
            self.next()
            d = F(1, v)
        elif t is not None and t.k == 'cmd' and t.v in ('breve', 'longa') and not t.ws:
            self.next()
            d = F(2) if t.v == 'breve' else F(4)
        elif required and t is not None and t.k == 'num':
            v = int(t.v)
            self.next()
            d = F(1, v)
        if d is None:
            return None
        base = d
        while self.at('sym', '.') and not self.peek().ws:
            self.next()
            base = base / 2
            d += base
        while self.at('sym', '*'):
            self.next()
            a = int(self.expect('num').v)
            b = 1
            if self.at('sym', '/'):
                self.next()
                b = int(self.expect('num').v)
            d = d * F(a, b)
        return d

    def dur_or_last(self):
        d = self.parse_duration()
        if d is None:
            d = self.last_dur
        else:
            self.last_dur = d
        return d

    # ---- pitches
    def is_pitch_word(self, t):
        return t is not None and t.k == 'word' and t.v in self.names

    def read_tags(self, ordered=False):
        t = self.next()
        names = re.findall(r'[A-Za-z][A-Za-z0-9_-]*', t.v) if t.k in ('scm', 'str', 'word') else []
        return names if ordered else set(names)

    def parse_pitch(self):
        t = self.next()
        st, alt = self.names[t.v]
        oct_ = 0
        while self.at('sym') and self.peek().v in ("'", ','):
            oct_ += 1 if self.next().v == "'" else -1
        force = False
        while self.at('sym') and self.peek().v in ('!', '?') and not self.peek().ws:
            self.next()
            force = True
        check = None
        if self.at('sym', '=') and not self.peek().ws:
            self.next()
            c = 0
            while self.at('sym') and self.peek().v in ("'", ',') and not self.peek().ws:
                c += 1 if self.next().v == "'" else -1
            check = c
        return {'step': st, 'alt': alt, 'oct': oct_, 'check': check, 'name': t.v}

    # ---- post events after a note, chord or rest
    def parse_post(self, item):
        while True:
            t = self.peek()
            if t is None:
                return
            if t.k == 'sym' and t.v == '~':
                self.next()
                item['tie'] = True
                continue
            if t.k == 'sym' and t.v in ('(', ')', '[', ']'):
                self.next()
                continue
            if t.k == 'sym' and t.v == ':' and not t.ws:
                self.next()
                if self.at('num'):
                    self.next()
                continue
            if t.k == 'sym' and t.v in ('-', '^', '_'):
                nx = self.peek(1)
                if nx is None:
                    self.next()
                    return
                if nx.k == 'num':
                    self.next(); self.next()
                    if t.v == '-' or True:
                        item.setdefault('fingers', []).append(int(nx.v))
                    continue
                if nx.k == 'sym' and nx.v in ('.', '>', '^', '+', '_', '!', '-', '|', '~'):
                    if nx.v == '~':
                        item['tie'] = True
                    self.next(); self.next()
                    continue
                if nx.k == 'str':
                    self.next(); self.next()
                    continue
                if nx.k == 'cmd':
                    self.next()
                    self.parse_post_cmd()
                    continue
                if nx.k == 'sym' and nx.v in ('(', ')', '[', ']'):
                    self.next(); self.next()
                    continue
                return
            if t.k == 'cmd' and t.v == 'rest':
                self.next()
                item['rest'] = True
                continue
            if t.k == 'cmd' and t.v in POST_CMDS:
                self.parse_post_cmd()
                continue
            if t.k == 'cmd' and t.v in ('(', ')', '[', ']', '<', '>', '!', '~'):
                self.next()
                if t.v == '~':
                    item['tie'] = True
                continue
            if t.k == 'cmd' and t.v == '=':
                self.next()
                if self.at('num'):
                    self.next()
                continue
            if t.k == 'cmd' and t.v == 'tweak':
                self.parse_post_cmd()
                continue
            if t.k == 'cmd' and t.v in self.vars and self.vars[t.v].t == 'post':
                self.next()
                continue
            return

    def parse_post_cmd(self):
        t = self.next()
        v = t.v
        if v == 'markup':
            self.skip_markup()
        elif v == 'tweak':
            self.skip_path()
            self.skip_value()
            nx = self.peek()
            if nx is not None and nx.k == 'cmd' and (nx.v in POST_CMDS or nx.v in ('(', ')', '[', ']', '<', '>', '!', 'markup', 'tweak') or (nx.v in self.vars and self.vars[nx.v].t == 'post')):
                self.parse_post_cmd()
            elif nx is not None and nx.k == 'sym' and nx.v in ('(', ')', '[', ']', '~', '-', '^', '_'):
                if nx.v in ('-', '^', '_'):
                    tmp = {}
                    self.parse_post(tmp)
                else:
                    self.next()
        elif v == 'finger':
            self.skip_value()
        elif v in ('footnote',):
            self.skip_value(); self.skip_value()
        # all others: zero-arg

    # ---- music expressions
    def parse_seq_body(self, close='}'):
        items = []
        while True:
            t = self.peek()
            if t is None:
                raise ParseError('unterminated block')
            if t.k == 'sym' and t.v == close:
                self.next()
                return items
            e = self.parse_expr()
            if e is not None:
                items.append(e)

    def parse_sim(self):
        # after <<
        voices = [[]]
        while True:
            t = self.peek()
            if t is None:
                raise ParseError('unterminated <<')
            if t.k == 'sym' and t.v == '>>':
                self.next()
                break
            if t.k == 'sym' and t.v == '\\\\':
                self.next()
                voices.append([])
                continue
            e = self.parse_expr()
            if e is not None:
                voices[-1].append(e)
        if len(voices) == 1:
            return N('sim', kids=voices[0], split=False)
        return N('sim', kids=[N('seq', kids=v) for v in voices], split=True)

    def parse_chord(self):
        # after <
        notes = []
        while True:
            t = self.peek()
            if t is None:
                raise ParseError('unterminated chord')
            if t.k == 'sym' and t.v == '>':
                self.next()
                break
            if self.is_pitch_word(t):
                p = self.parse_pitch()
                self.parse_post(p)
                notes.append(p)
                continue
            if t.k == 'cmd' and t.v == 'tweak':
                self.parse_post_cmd()
                continue
            if t.k == 'cmd' and t.v == '=':
                self.next()
                if self.at('num'):
                    self.next()
                continue
            if t.k == 'cmd' and t.v == 'tag':
                self.next()
                tags = self.read_tags()
                if self.is_pitch_word(self.peek()):
                    p = self.parse_pitch()
                    self.parse_post(p)
                    p['tags'] = tags
                    notes.append(p)
                continue
            if t.k == 'cmd' and t.v in ('single', 'once'):
                self.next()
                continue
            if t.k == 'cmd' and t.v in ('parenthesize', 'harmonic', 'xNote', 'deadNote'):
                self.next()
                continue
            if t.k == 'cmd' and t.v in ('footnote',):
                self.next(); self.skip_value(); self.skip_value()
                continue
            if t.k == 'cmd':
                self.next()
                continue
            if t.k == 'sym' and t.v in ('-', '^', '_'):
                tmp = {}
                self.parse_post(tmp)
                if notes and tmp.get('fingers'):
                    notes[-1].setdefault('fingers', []).extend(tmp['fingers'])
                if notes and tmp.get('tie'):
                    notes[-1]['tie'] = True
                continue
            if t.k == 'sym' and t.v == '~':
                self.next()
                if notes:
                    notes[-1]['tie'] = True
                continue
            raise ParseError(f'unexpected {t!r} in chord at {self.where(t)}')
        d = self.parse_duration()
        if not notes and d is None:
            # <> empty chord: attaches post events, no time
            item = {}
            self.parse_post(item)
            return None
        if d is None:
            d = self.last_dur
        else:
            self.last_dur = d
        item = {'tie': False}
        self.parse_post(item)
        return N('chord', notes=notes, dur=d, tie=item.get('tie', False), rest=item.get('rest', False), fingers=item.get('fingers'))

    def parse_expr(self):
        t = self.peek()
        if t is None:
            return None
        k, v = t.k, t.v
        if k == 'lang':
            self.next()
            self.lang = v
            self.names = build_names(v)
            return None
        if k == 'sym':
            if v == '{':
                self.next()
                return N('seq', kids=self.parse_seq_body())
            if v == '<<':
                self.next()
                return self.parse_sim()
            if v == '<':
                self.next()
                return self.parse_chord()
            if v == '|':
                self.next()
                return N('barcheck', where=self.where(t))
            if v == '~':
                self.next()
                return N('tie')
            if v in ('(', ')', '[', ']', '=', "'", ',', '.', '!', '?', '*', '/', ':', '+', '@', '>', '>>'):
                self.next()
                return None
            if v in ('-', '^', '_'):
                # stray post event (e.g. after a spacer); parse and drop, but keep fingerings/ties
                tmp = {}
                self.parse_post(tmp)
                if tmp.get('tie'):
                    return N('tie')
                if not tmp and self.peek() is t:
                    self.next()
                return None
            if v == '\\\\':
                raise ParseError('voice separator outside << >> at ' + self.where(t))
            self.next()
            return None
        if k == 'num':
            # duration-only note: repeat previous pitch
            d = self.parse_duration(required=True)
            self.last_dur = d
            item = {}
            self.parse_post(item)
            self.warn.append('duration without pitch at ' + self.where(t))
            return N('repeatpitch', dur=d, tie=item.get('tie', False))
        if k in ('str', 'scm'):
            self.next()
            return None
        if k == 'word':
            if v in self.names:
                p = self.parse_pitch()
                d = self.dur_or_last()
                item = {'tie': False}
                self.parse_post(item)
                if item.get('rest'):
                    return N('rest', dur=d, p=p)  # positioned rest: its pitch still counts for \\relative
                return N('note', p=p, dur=d, tie=item.get('tie'), fingers=item.get('fingers'))
            if v in ('r', 'R', 's'):
                self.next()
                d = self.dur_or_last()
                item = {}
                self.parse_post(item)
                return N('rest' if v != 's' else 'skip', dur=d, mm=(v == 'R'))
            if v == 'q':
                self.next()
                d = self.dur_or_last()
                item = {'tie': False}
                self.parse_post(item)
                return N('q', dur=d, tie=item.get('tie'))
            # bare words: context names in odd places, property values; skip
            self.next()
            self.warn.append(f'stray word {v!r} at {self.where(t)}')
            return None
        if k == 'cmd':
            return self.parse_cmd()
        self.next()
        return None

    def parse_music_arg(self):
        e = None
        while e is None:
            if self.peek() is None:
                raise ParseError('missing music argument')
            if self.at('sym', '}') or self.at('sym', '>>'):
                raise ParseError('missing music argument at ' + self.where())
            e = self.parse_expr()
        return e

    def parse_cmd(self):
        t = self.next()
        v = t.v
        if v in self.vars:
            node = self.vars[v]
            if node.t in ('post', 'ignore'):
                if node.t == 'ignore':
                    self.swallow_args()
                return None
            return N('ref', name=v, node=node)
        if v == 'relative':
            ref = None
            if self.is_pitch_word(self.peek()):
                ref = self.parse_pitch()
            body = self.parse_music_arg()
            return N('relative', ref=ref, body=body)
        if v == 'octaveCheck':
            return N('octcheck', p=self.parse_pitch())
        if v == 'transposition':
            self.parse_pitch()
            return None
        if v == 'fixed':
            ref = self.parse_pitch()
            body = self.parse_music_arg()
            return N('fixed', ref=ref, body=body)
        if v == 'absolute':
            return N('absolute', body=self.parse_music_arg())
        if v == 'transpose':
            a = self.parse_pitch(); b = self.parse_pitch()
            return N('transpose', a=a, b=b, body=self.parse_music_arg())
        if v == 'times':
            a = int(self.expect('num').v); self.expect('sym', '/'); b = int(self.expect('num').v)
            return N('scale', f=F(a, b), body=self.parse_music_arg())
        if v == 'tuplet':
            a = int(self.expect('num').v); self.expect('sym', '/'); b = int(self.expect('num').v)
            if self.at('num'):
                self.parse_duration(required=True)
            return N('scale', f=F(b, a), body=self.parse_music_arg())
        if v == 'scaleDurations':
            if self.at('scm'):
                s = self.next().v
                m = re.match(r"#'\((\d+)\s*\.\s*(\d+)\)", s)
                f = F(int(m.group(1)), int(m.group(2))) if m else F(1)
            else:
                a = int(self.expect('num').v); self.expect('sym', '/'); b = int(self.expect('num').v)
                f = F(a, b)
            return N('scale', f=f, body=self.parse_music_arg())
        if v in ('grace', 'acciaccatura', 'appoggiatura', 'slashedGrace'):
            return N('grace', body=self.parse_music_arg())
        if v == 'after':
            self.parse_duration(required=True)
            if self.at('cmd'):
                self.parse_post_cmd()
            elif self.at('sym') and self.peek().v in ('-', '^', '_'):
                tmp = {}
                self.parse_post(tmp)
            return self.parse_music_arg()
        if v == 'afterGrace':
            if self.at('scm') or self.at('num'):
                self.next()
            main = self.parse_music_arg()
            g = self.parse_music_arg()
            return N('aftergrace', main=main, g=g)
        if v == 'repeat':
            typ = self.expect('word').v
            cnt = int(self.expect('num').v)
            body = self.parse_music_arg()
            alts = []
            if self.at('cmd', 'alternative'):
                self.next()
                self.expect('sym', '{')
                while not self.at('sym', '}'):
                    e = self.parse_expr()
                    if e is not None:
                        alts.append(e)
                self.next()
            return N('repeat', typ=typ, n=cnt, body=body, alts=alts)
        if v in ('new', 'context'):
            ctype = self.expect('word').v
            name = None
            if self.at('sym', '='):
                self.next()
                nt = self.next()
                name = nt.v
            while self.at('cmd', 'with'):
                self.next()
                if self.at('sym', '{'):
                    self.skip_block()
                else:
                    self.next()
            if ctype in ('Lyrics', 'ChordNames', 'FiguredBass', 'Dynamics', 'NullVoice', 'RhythmicStaff', 'DrumStaff', 'TabStaff'):
                self.parse_music_arg()
                return None
            body = self.parse_music_arg()
            return N('ctx', ctype=ctype, name=name, body=body, new=(v == 'new'))
        if v == 'change':
            self.expect('word')  # Staff
            self.expect('sym', '=')
            nt = self.next()
            return N('change', name=nt.v)
        if v == 'undo':
            if self.at('cmd') and self.peek().v in ('omit', 'hide'):
                e = self.parse_cmd()
                if e is not None and e.t == 'hide':
                    return N('unhide')
            return None
        if v in ('crossStaff', 'unfoldRepeats', 'single', 'once', 'temporary', 'autoBeamOff', 'unHideNotes'):
            if v in ('crossStaff', 'unfoldRepeats'):
                return self.parse_music_arg()
            if v == 'once':
                if self.at('cmd', 'hideNotes'):
                    self.next()
                    return N('hide', once=True)
                if self.at('cmd') and self.peek().v in ('override', 'omit', 'hide'):
                    e = self.parse_cmd()
                    if e is not None and e.t == 'hide':
                        return N('hide', once=True)
                return None
            if v == 'unHideNotes':
                return N('unhide')
            return None
        if v == 'hideNotes':
            return N('hide', once=False)
        if v in ('tag', 'keepWithTag', 'removeWithTag'):
            tags = self.read_tags()
            body = self.parse_music_arg()
            return N({'tag': 'tagged', 'keepWithTag': 'keeptag', 'removeWithTag': 'removetag'}[v], tags=tags, body=body)
        if v == 'parallelMusic':
            names = self.read_tags(ordered=True)
            self.expect('sym', '{')
            segs = {nm: [] for nm in names}
            cur = []
            k = 0
            while True:
                t2 = self.peek()
                if t2 is None:
                    raise ParseError('unterminated parallelMusic')
                if t2.k == 'sym' and t2.v == '}':
                    self.next()
                    break
                e = self.parse_expr()
                if e is None:
                    continue
                cur.append(e)
                if e.t == 'barcheck':
                    segs[names[k % len(names)]].extend(cur)
                    cur = []
                    k += 1
            if cur:
                segs[names[k % len(names)]].extend(cur)
            for nm in names:
                self.vars[nm] = N('seq', kids=segs[nm])
            return None
        if v in ('override', 'set'):
            path = self.skip_path()
            if self.at('scm'):
                path += self.next().v
            if self.at('sym', '='):
                self.next()
            val = self.peek().v if self.peek() is not None else ''
            self.skip_value()
            # invisible note heads are layout tricks (doublings, spacing); they are not played as written
            if v == 'override' and (path.endswith('NoteHead.transparent') and val == '##t' or path.endswith('NoteHead.stencil') and val == '##f'):
                return N('hide', once=False)
            return None
        if v in ('revert', 'unset'):
            path = self.skip_path()
            if self.at('scm'):
                self.next()
            if v == 'revert' and (path.endswith('NoteHead.transparent') or path.endswith('NoteHead.stencil')):
                return N('unhide')
            return None
        if v in ('omit', 'hide'):
            path = self.skip_path()
            if path.endswith('NoteHead'):
                return N('hide', once=False)
            return None
        if v == 'tweak':
            self.skip_path()
            self.skip_value()
            return None
        if v == 'shape':
            self.skip_value()
            self.skip_path()
            return None
        if v == 'clef':
            nt = self.next()
            return N('clef', name=nt.v)
        if v == 'key':
            p = self.parse_pitch()
            mode = 'major'
            if self.at('cmd'):
                mode = self.next().v
            return N('key', p=p, mode=mode)
        if v == 'time':
            if self.at('scm'):
                self.next()
            a = int(self.expect('num').v)
            while self.at('sym', ','):
                self.next()
                a += int(self.expect('num').v)
            self.expect('sym', '/')
            b = int(self.expect('num').v)
            return N('time', n=a, d=b)
        if v == 'partial':
            d = self.parse_duration(required=True)
            return N('partial', dur=d)
        if v == 'skip':
            d = self.parse_duration(required=True)
            self.last_dur = d
            return N('skip', dur=d)
        if v == 'tempo':
            text = None
            if self.at('str'):
                text = self.next().v
            elif self.at('cmd', 'markup'):
                self.next(); self.skip_markup()
            bpm = None
            unit = None
            if self.at('num'):
                unit = self.parse_duration(required=True)
                self.expect('sym', '=')
                bpm = int(self.expect('num').v)
                if self.at('sym', '-') or self.at('sym', '~'):
                    self.next()
                    if self.at('num'):
                        self.next()
            return N('tempo', text=text, unit=unit, bpm=bpm)
        if v == 'mark':
            if self.at('cmd', 'default'):
                self.next()
            elif self.at('cmd', 'markup'):
                self.next(); self.skip_markup()
            else:
                self.skip_value()
            return None
        if v == 'bar':
            nt = self.next()
            return N('bar', s=nt.v)
        if v == 'markup':
            self.skip_markup()
            return None
        if v in ('barNumberCheck', 'ottava', 'set-octavation', 'tupletSpan', 'textSpannerDown', 'afterGraceFraction', 'magnifyMusic', 'compressMMRests', 'numericTimeSignature', 'defaultTimeSignature'):
            if v in ('tupletSpan',):
                self.parse_duration(required=True)
            elif v == 'magnifyMusic' or v == 'compressMMRests':
                if self.at('scm'):
                    self.next()
                return self.parse_music_arg()
            elif v in ('numericTimeSignature', 'defaultTimeSignature'):
                pass
            else:
                self.skip_value()
            return None
        if v in ('lyricmode', 'lyricsto', 'addlyrics', 'chordmode', 'figuremode', 'drummode', 'figures', 'chords', 'lyrics'):
            if v == 'lyricsto':
                self.skip_value()
            self.skip_block()
            return None
        if v in ('header', 'paper', 'layout', 'midi', 'with'):
            self.skip_block()
            return None
        if v == 'cadenzaOn':
            return N('cadenza', on=True)
        if v == 'cadenzaOff':
            return N('cadenza', on=False)
        if v == 'footnote':
            self.skip_value(); self.skip_value()
            return None
        if v == 'parallelMusic':
            raise ParseError('parallelMusic not supported')
        if v in ('rest',):
            return None
        if v in ('version', 'sourcefilename', 'sourcefileline', 'pointAndClickOff', 'pointAndClickOn'):
            if self.at('str') or self.at('num'):
                self.next()
            return None
        # zero-arg command (dynamics, articulations, layout switches, custom macros);
        # custom macros may take numbers, strings or Scheme values: swallow those
        self.swallow_args()
        return None

    def swallow_args(self):
        while True:
            nx = self.peek()
            if nx is None:
                break
            if nx.k == 'scm' or nx.k == 'str':
                self.next()
                continue
            if nx.k == 'num' or (nx.k == 'sym' and nx.v == '-' and self.at('num', None, 1)):
                self.skip_number()
                continue
            break
        return None

    # ---- top level
    def parse_top(self):
        while self.peek() is not None:
            t = self.peek()
            if t.k == 'lang':
                self.next()
                self.lang = t.v
                self.names = build_names(t.v)
                continue
            if t.k == 'word':
                # identifiers may contain _ or - between letters: join tokens without spaces
                j = 1
                name = t.v
                while True:
                    a, b = self.peek(j), self.peek(j + 1)
                    if a is not None and b is not None and a.k == 'sym' and a.v in ('_', '-') and not a.ws and b.k == 'word' and not b.ws:
                        name += a.v + b.v
                        j += 2
                    else:
                        break
                if self.at('sym', '=', j):
                    self.i += j + 1
                    self.vars[name] = self.parse_value()
                    continue
            if t.k == 'cmd' and t.v in ('header', 'paper', 'layout', 'midi'):
                self.next()
                self.skip_block()
                continue
            if t.k == 'cmd' and t.v in ('book', 'bookpart'):
                self.next()
                self.expect('sym', '{')
                continue
            if t.k == 'cmd' and t.v == 'score':
                self.next()
                self.expect('sym', '{')
                music = None
                while not self.at('sym', '}'):
                    if self.at('cmd') and self.peek().v in ('header', 'layout', 'midi', 'paper'):
                        self.next()
                        self.skip_block()
                        continue
                    e = self.parse_expr()
                    if e is not None and music is None:
                        music = e
                self.next()
                if music is not None:
                    self.scores.append(music)
                continue
            if t.k == 'sym' and t.v == '}':
                self.next()
                continue
            if t.k in ('scm', 'str'):
                self.next()
                continue
            if t.k == 'cmd' and t.v in ('version', 'pointAndClickOff'):
                self.next()
                if self.at('str'):
                    self.next()
                continue
            # bare music at top level = implicit score
            e = self.parse_expr()
            if e is not None and e.t in ('seq', 'sim', 'ctx', 'relative', 'ref'):
                self.scores.append(e)
        return self

    def parse_value(self):
        t = self.peek()
        if t.k == 'cmd' and t.v == 'markup':
            self.next()
            self.skip_markup()
            return N('ignore')
        if t.k in ('str', 'scm', 'num'):
            self.next()
            if t.k == 'num' and self.at('sym', '\\'):
                pass
            return N('ignore')
        if t.k == 'cmd' and t.v in ('tweak',):
            self.parse_post_cmd()
            return N('post')
        if t.k == 'cmd' and t.v in POST_CMDS:
            self.next()
            return N('post')
        if t.k == 'cmd' and t.v in ('layout', 'paper', 'header', 'midi'):
            self.next()
            self.skip_block()
            return N('ignore')
        start = self.i
        e = self.parse_expr()
        if e is None:
            return N('ignore')
        return e


POST_CMDS = set('''p pp ppp pppp f ff fff ffff mp mf sf sfz fp sp spp rfz fz sff cresc decresc dim endcresc enddecresc enddim
fermata shortfermata longfermata verylongfermata staccato staccatissimo accent marcato tenuto portato espressivo
trill prall mordent turn reverseturn prallprall prallmordent upprall downprall upmordent downmordent pralldown prallup lineprall
open stopped flageolet snappizzicato thumb segno coda varcoda upbow downbow lheel rheel ltoe rtoe halfopen
sustainOn sustainOff sostenutoOn sostenutoOff unaCorda treCorde arpeggio glissando startTrillSpan stopTrillSpan
startTextSpan stopTextSpan laissezVibrer repeatTie harmonic breathe noBeam startGroup stopGroup
'''.split())


# ---------------------------------------------------------------- evaluation
def pitch_midi(oct_, st, alt):
    return 48 + 12 * oct_ + SEMI[st] + alt


LETTER = 'CDEFGAB'


def spell(oct_, st, alt):
    acc = {0: '', 1: '#', -1: 'b', 2: '##', -2: 'bb'}.get(alt, '')
    return f'{LETTER[st]}{acc}{oct_ + 3}'


KEY_FIFTHS = {(0, 0): 0}


def key_sig(p, mode):
    # tonic pitch class to number of sharps/flats
    major_of = {'major': 0, 'ionian': 0, 'minor': -3, 'aeolian': -3, 'dorian': -2, 'phrygian': -4, 'lydian': 1, 'mixolydian': -1, 'locrian': -5}
    st, alt = p['step'], p['alt']
    fifths_of_step = [0, 2, 4, -1, 1, 3, 5]  # C D E F G A B
    f = fifths_of_step[st] + 7 * alt + major_of.get(mode, 0)
    return f



class Relativizer:
    """Pass 1: resolve every pitch to absolute, the way LilyPond does it.

    LilyPond converts \\relative music once, on the music as written (repeat
    bodies once, alternatives chained, simultaneous elements chained, chords
    chained with the first note as the next reference), and copies variables
    at each reference. Doing this before unfolding keeps repeated sections
    identical.
    """
    def __init__(self):
        self.last_chord = []

    def resolve(self, p, ref, fixed):
        if ref is not None:
            ro, rs = ref
            delta = (p['step'] - rs) % 7
            dia = ro * 7 + rs + (delta if delta <= 3 else delta - 7)
            dia += 7 * p['oct']
            o, s = divmod(dia, 7)
        else:
            o = p['oct'] + (fixed or 0)
            s = p['step']
        if p['check'] is not None:
            o = p['check']
        return (o, s, p['alt'])

    def run(self, node, ref=None, fixed=None, keep=None, remove=frozenset()):
        t = node.t
        if t in ('seq',):
            for k in node.kids:
                ref = self.run(k, ref, fixed, keep, remove)
            return ref
        if t == 'sim':
            for k in node.kids:
                ref = self.run(k, ref, fixed, keep, remove)
            return ref
        if t in ('ctx', 'scale', 'grace'):
            return self.run(node.body, ref, fixed, keep, remove)
        if t == 'tagged':
            if (keep is not None and not (node.tags & keep)) or (node.tags & remove):
                node.skip = True
                return ref
            return self.run(node.body, ref, fixed, keep, remove)
        if t == 'keeptag':
            return self.run(node.body, ref, fixed, set(node.tags), remove)
        if t == 'removetag':
            return self.run(node.body, ref, fixed, keep, frozenset(set(remove) | node.tags))
        if t == 'aftergrace':
            ref = self.run(node.main, ref, fixed, keep, remove)
            return self.run(node.g, ref, fixed, keep, remove)
        if t == 'repeat':
            ref = self.run(node.body, ref, fixed, keep, remove)
            for a in node.alts:
                ref = self.run(a, ref, fixed, keep, remove)
            return ref
        if t == 'relative':
            if node.ref is not None:
                p = node.ref
                start = (p['oct'] if p['check'] is None else p['check'], p['step'])
            else:
                start = (0, 3)  # f
            self.run(node.body, start, None, keep, remove)
            return ref
        if t == 'fixed':
            self.run(node.body, None, node.ref['oct'], keep, remove)
            return ref
        if t == 'absolute':
            self.run(node.body, None, None, keep, remove)
            return ref
        if t == 'transpose':
            return self.run(node.body, ref, fixed, keep, remove)
        if t == 'ref':
            node.node = copy.deepcopy(node.node)
            return self.run(node.node, ref, fixed, keep, remove)
        if t == 'note':
            a = self.resolve(node.p, ref, fixed)
            node.abs = a
            self.last_chord = [a]
            return (a[0], a[1]) if ref is not None else ref
        if t == 'chord':
            kept = [p for p in node.notes if not p.get('tags') or ((keep is None or (p['tags'] & keep)) and not (p['tags'] & remove))]
            node.kept = kept
            prev = None
            first = None
            for p in kept:
                a = self.resolve(p, prev if prev is not None else ref, fixed) if ref is not None else self.resolve(p, None, fixed)
                p['abs'] = a
                prev = (a[0], a[1])
                if first is None:
                    first = prev
            if kept and not node.rest:
                self.last_chord = [p['abs'] for p in kept]
            return first if (ref is not None and first is not None) else ref
        if t in ('q', 'repeatpitch'):
            node.abs = list(self.last_chord)
            return ref
        if t == 'octcheck':
            if ref is not None:
                return (node.p['oct'], node.p['step'])
            return ref
        if t == 'rest' and getattr(node, 'p', None) is not None:
            a = self.resolve(node.p, ref, fixed)
            return (a[0], a[1]) if ref is not None else ref
        return ref


class Evaluator:
    def __init__(self, parser):
        self.P = parser
        self.notes = []
        self.times = []   # (t, n, d)
        self.keys = []    # (t, fifths)
        self.tempos = []  # (t, text, unit, bpm)
        self.partial = None
        self.barchecks = []  # (t, where)
        self.bars_explicit = []
        self.cadenza = []
        self.clefs = []  # (t, staff, name)
        self.staff_names = []
        self.ties = {}  # (staff, midi) -> note index
        self.voice_counter = 0
        self.end = F(0)

    def staff_index(self, name):
        if name not in self.staff_names:
            self.staff_names.append(name)
        return self.staff_names.index(name)

    def run(self, node):
        Relativizer().run(node)
        st = {'t': F(0), 'rel': None, 'staff': None, 'voice': 'v0', 'scale': F(1), 'grace': 0, 'vars': (), 'tr': 0, 'hide': False, 'hide_once': False, 'last_chord': None, 'trd': 0, 'fixed': None}
        self.walk(node, st)
        return self

    def resolve(self, p, st, chord_ref=None):
        """returns (oct, step, alt) absolute and updates reference"""
        if st['rel'] is not None:
            ref = chord_ref if chord_ref is not None else st['rel']
            ro, rs = ref
            delta = (p['step'] - rs) % 7
            dia = ro * 7 + rs + (delta if delta <= 3 else delta - 7)
            dia += 7 * p['oct']
            o, s = divmod(dia, 7)
        else:
            o = p['oct'] + (st['fixed'] if st['fixed'] is not None else 0)
            s = p['step']
        if p['check'] is not None:
            o = p['check']
        return o, s, p['alt']

    def transpose(self, o, s, a, st):
        if not st['tr']:
            return o, s, a
        dsteps, dsemi = st['trd'], st['tr']
        dia = o * 7 + s + dsteps
        no, ns = divmod(dia, 7)
        semi_before = pitch_midi(o, s, a)
        na = semi_before + dsemi - pitch_midi(no, ns, 0)
        return no, ns, na

    def add(self, o, s, a, dur, st, tie, fingers=None, chord=False):
        o, s, a = self.transpose(o, s, a, st)
        m = pitch_midi(o, s, a)
        staff = st['staff'] or 'staff0'
        t = st['t']
        hidden = st['hide'] or st['hide_once']
        key = (staff, m)
        if key in self.ties and not st['grace']:
            idx = self.ties[key]
            n = self.notes[idx]
            if n['t'] + n['dur'] == t:
                n['dur'] += dur
                if not tie:
                    del self.ties[key]
                return
            del self.ties[key]
        if hidden:
            return
        n = {'t': t, 'dur': dur if not st['grace'] else F(0), 'm': m, 'sp': spell(o, s, a), 'staff': staff, 'voice': st['voice'], 'vars': st['vars'], 'grace': st['grace'], 'fingers': fingers}
        self.notes.append(n)
        if tie and not st['grace']:
            self.ties[key] = len(self.notes) - 1

    def walk(self, node, st):
        t = node.t
        if t == 'seq':
            for k in node.kids:
                self.walk(k, st)
            return
        if t == 'sim':
            # LilyPond chains relative pitch through simultaneous elements and
            # chord repetition follows input order, so both carry from kid to kid.
            start = st['t']
            ends = []
            rel = st['rel']
            for j, k in enumerate(node.kids):
                sub = dict(st)
                sub['t'] = start
                sub['rel'] = rel
                if node.split:
                    self.voice_counter += 1
                    sub['voice'] = f"{st['voice']}.{j + 1}"
                self.walk(k, sub)
                ends.append(sub['t'])
                rel = sub['rel']
                st['last_chord'] = sub['last_chord']
            st['t'] = max(ends) if ends else start
            st['rel'] = rel
            return
        if t == 'ctx':
            sub = dict(st)
            if node.ctype in ('Staff', 'GrandStaff', 'PianoStaff', 'StaffGroup', 'ChoirStaff'):
                if node.ctype == 'Staff':
                    # \context Staff without a name reuses the current staff
                    if node.name is None and not node.new and st['staff'] is not None:
                        nm = st['staff']
                    else:
                        nm = node.name or f'staff{len(self.staff_names)}'
                    self.staff_index(nm)
                    sub['staff'] = nm
            elif node.ctype == 'Voice':
                self.voice_counter += 1
                sub['voice'] = node.name or f"{st['voice']}/{self.voice_counter}"
            self.walk(node.body, sub)
            st['t'] = sub['t']
            st['rel'] = sub['rel']
            st['last_chord'] = sub['last_chord']
            return
        if t in ('tagged', 'keeptag', 'removetag'):
            sub = dict(st)
            if t == 'tagged':
                if getattr(node, 'skip', False):
                    return
            elif t == 'keeptag':
                sub['keep'] = set(node.tags)
            else:
                sub['remove'] = (st.get('remove') or set()) | node.tags
            self.walk(node.body, sub)
            for kk in ('t', 'rel', 'staff', 'hide', 'hide_once', 'last_chord'):
                st[kk] = sub[kk]
            return
        if t == 'ref':
            v = node.node
            sub = dict(st)
            sub['vars'] = st['vars'] + (node.name,)
            self.walk(v, sub)
            for kk in ('t', 'rel', 'staff', 'hide', 'hide_once', 'last_chord'):
                st[kk] = sub[kk]
            return
        if t == 'relative':
            sub = dict(st)
            if node.ref is not None:
                p = node.ref
                o = p['oct'] if p['check'] is None else p['check']
                sub['rel'] = (o, p['step'])
            else:
                sub['rel'] = (0, 3)  # f
            sub['fixed'] = None
            self.walk(node.body, sub)
            for kk in ('t', 'staff', 'hide', 'hide_once', 'last_chord'):
                st[kk] = sub[kk]
            return
        if t == 'fixed':
            sub = dict(st)
            sub['rel'] = None
            sub['fixed'] = node.ref['oct']
            self.walk(node.body, sub)
            for kk in ('t', 'staff', 'last_chord'):
                st[kk] = sub[kk]
            return
        if t == 'absolute':
            sub = dict(st)
            sub['rel'] = None
            sub['fixed'] = None
            self.walk(node.body, sub)
            for kk in ('t', 'staff', 'last_chord'):
                st[kk] = sub[kk]
            return
        if t == 'transpose':
            a, b = node.a, node.b
            sub = dict(st)
            sub['trd'] = st['trd'] + (b['oct'] * 7 + b['step']) - (a['oct'] * 7 + a['step'])
            sub['tr'] = st['tr'] + pitch_midi(b['oct'], b['step'], b['alt']) - pitch_midi(a['oct'], a['step'], a['alt'])
            self.walk(node.body, sub)
            for kk in ('t', 'rel', 'staff', 'last_chord'):
                st[kk] = sub[kk]
            return
        if t == 'scale':
            sub = dict(st)
            sub['scale'] = st['scale'] * node.f
            self.walk(node.body, sub)
            for kk in ('t', 'rel', 'staff', 'last_chord', 'hide', 'hide_once'):
                st[kk] = sub[kk]
            return
        if t == 'grace':
            sub = dict(st)
            sub['grace'] = st['grace'] + 1
            # place grace notes just before the main note: collect, then shift
            mark = len(self.notes)
            self.walk(node.body, sub)
            graces = self.notes[mark:]
            k = len(graces)
            for j, g in enumerate(graces):
                g['t'] = st['t'] - F(1, 64) * (k - j)
                g['grace'] = True
            st['rel'] = sub['rel']
            st['last_chord'] = sub['last_chord']
            return
        if t == 'aftergrace':
            start = st['t']
            self.walk(node.main, st)
            end = st['t']
            sub = dict(st)
            sub['grace'] = st['grace'] + 1
            mark = len(self.notes)
            sub['t'] = end
            self.walk(node.g, sub)
            graces = self.notes[mark:]
            k = len(graces)
            for j, g in enumerate(graces):
                g['t'] = end - F(1, 64) * (k - j)
                g['grace'] = True
            st['rel'] = sub['rel']
            return
        if t == 'repeat':
            n = node.n
            alts = node.alts
            if node.typ in ('volta', 'unfold', 'percent', 'tremolo', 'segno'):
                if node.typ == 'tremolo':
                    # \repeat tremolo n { a b }: each note lasts as written; repeated n times
                    for _ in range(n):
                        self.walk(node.body, st)
                    return
                for r in range(n):
                    self.walk(node.body, st)
                    if alts:
                        # LilyPond: with fewer alternatives than repeats, the first is reused
                        ai = 0 if r < n - len(alts) else r - (n - len(alts))
                        self.walk(alts[ai], st)
                return
            raise ParseError('unknown repeat ' + node.typ)
        if t == 'note':
            o, s, a = node.abs
            d = node.dur * st['scale']
            self.add(o, s, a, d, st, node.tie, node.fingers)
            st['last_chord'] = [(o, s, a)]
            st['hide_once'] = False
            if not st['grace']:
                st['t'] += d
            self.end = max(self.end, st['t'])
            return
        if t == 'chord':
            d = node.dur * st['scale']
            pitches = []
            first = None
            prev = None
            for p in node.kept:
                o, s, a = p['abs']
                pitches.append((o, s, a, p.get('tie') or node.tie, p.get('fingers')))
            if node.rest:
                if not st['grace']:
                    st['t'] += d
                return
            fingers = node.fingers or []
            for j, (o, s, a, tie, fg) in enumerate(pitches):
                f = fg or None
                self.add(o, s, a, d, st, tie, f, chord=True)
            st['last_chord'] = [(o, s, a) for (o, s, a, _, _) in pitches]
            st['hide_once'] = False
            if not st['grace']:
                st['t'] += d
            self.end = max(self.end, st['t'])
            return
        if t == 'q':
            d = node.dur * st['scale']
            for (o, s, a) in node.abs:
                # chord repetition: transposition already applied? keep raw
                self.add(o, s, a, d, st, node.tie)
            st['hide_once'] = False
            if not st['grace']:
                st['t'] += d
            self.end = max(self.end, st['t'])
            return
        if t == 'repeatpitch':
            d = node.dur * st['scale']
            for (o, s, a) in node.abs:
                self.add(o, s, a, d, st, node.tie)
            st['t'] += d
            return
        if t in ('rest', 'skip'):
            if not st['grace']:
                st['t'] += node.dur * st['scale']
            self.end = max(self.end, st['t'])
            st['hide_once'] = False
            return
        if t == 'tie':
            # tie written after whitespace: tie the last notes added in this voice/staff
            for j in range(len(self.notes) - 1, -1, -1):
                n = self.notes[j]
                if n['voice'] == st['voice'] and n['t'] + n['dur'] == st['t']:
                    self.ties[(n['staff'], n['m'])] = j
                elif n['t'] + n['dur'] < st['t']:
                    break
            return
        if t == 'barcheck':
            if not st['grace']:
                self.barchecks.append((st['t'], node.where))
            return
        if t == 'change':
            st['staff'] = node.name
            self.staff_index(node.name)
            return
        if t == 'time':
            self.times.append((st['t'], node.n, node.d))
            return
        if t == 'key':
            self.keys.append((st['t'], key_sig(node.p, node.mode.replace('\\', ''))))
            return
        if t == 'partial':
            if st['t'] == 0:
                self.partial = node.dur
            else:
                self.times.append((st['t'], 'partial', node.dur))
            return
        if t == 'tempo':
            self.tempos.append((st['t'], node.text, node.unit, node.bpm))
            return
        if t == 'bar':
            self.bars_explicit.append((st['t'], node.s))
            return
        if t == 'cadenza':
            self.cadenza.append((st['t'], node.on))
            return
        if t == 'hide':
            if node.once:
                st['hide_once'] = True
            else:
                st['hide'] = True
            return
        if t == 'unhide':
            st['hide'] = False
            return
        if t == 'clef':
            self.clefs.append((st['t'], st['staff'] or 'staff0', node.name))
            return
        if t in ('ignore', 'post', 'octcheck'):
            return
        raise ParseError('unknown node ' + t)


# ---------------------------------------------------------------- measures & checks
def measure_grid(ev, end):
    """bar start positions, honoring partial, time changes and cadenza sections"""
    times = sorted({(t, n, d) for (t, n, d) in ev.times if n != 'partial'}, key=lambda x: x[0])
    mid_partials = sorted([(t, d) for (t, n, d) in ev.times if n == 'partial'], key=lambda x: x[0])
    if not times or times[0][0] > 0:
        times = [(F(0), 4, 4)] + times
    cad = sorted(ev.cadenza)
    def in_cadenza(t):
        on = False
        for (ct, c) in cad:
            if ct <= t:
                on = c
        return on
    bars = [F(0)]
    t = F(0)
    if ev.partial:
        t = ev.partial
        bars.append(t)
    ti = 0
    explicit = sorted({bt for (bt, s) in ev.bars_explicit})
    guard = 0
    while t < end and guard < 100000:
        guard += 1
        while ti + 1 < len(times) and times[ti + 1][0] <= t:
            ti += 1
        if in_cadenza(t):
            nxt = [x for x in explicit if x > t]
            offs = [c for (c, on) in cad if c > t and not on]
            cand = (nxt[:1] + offs[:1])
            if not cand:
                break
            t = min(cand)
            bars.append(t)
            continue
        L = F(times[ti][1], times[ti][2])
        nt = t + L
        # a time change inside this bar (shouldn't happen) or a mid-piece partial
        for (pt, pd) in mid_partials:
            if t < pt < nt:
                nt = pt + pd
        bars.append(nt)
        t = nt
    bars = sorted(set(b for b in bars if b <= end))
    if bars[-1] < end:
        bars.append(end)
    return bars, times


def check_bars(ev, bars):
    bs = set(bars)
    errs = []
    for (t, where) in ev.barchecks:
        if t not in bs:
            errs.append((t, where))
    return errs


def parse_file(path, score=0, lang='nederlands'):
    P = Parser(path, lang)
    P.parse_top()
    if not P.scores:
        raise ParseError('no score found')
    ev = Evaluator(P).run(P.scores[score])
    end = ev.end
    bars, times = measure_grid(ev, end)
    errs = check_bars(ev, bars)
    return P, ev, bars, times, errs
