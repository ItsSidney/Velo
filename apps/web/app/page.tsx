"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Square, Plus, Search, Menu, X, Copy, RotateCcw, Trash2, Sparkles, Code2, ChevronDown, Volume2, Play, Pencil, ChevronLeft, ChevronRight, Paperclip, Download, HelpCircle, Globe, Image as ImageIcon, User, ExternalLink, FileText, FolderPlus, Calendar, Terminal, Sigma, Upload, Settings, Mic, MicOff, StopCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Highlight, themes } from "prism-react-renderer";
import "katex/dist/katex.min.css";

const MODES = [
  { name: "Chat", icon: Sparkles },
  { name: "Coder", icon: Code2 },
];

const SUGGESTIONS: Record<string, string[][]> = {
  Chat: [
    ["Explain quantum computing simply", "Write a haiku about velocity", "What causes a solar eclipse?", "Give me a 30-minute bodyweight workout"],
    ["Summarize how black holes form", "Plan a productive morning routine", "Explain AI transformers like I'm 12", "Suggest a random dinner idea"],
    ["What's the fastest land animal?", "Teach me 5 Spanish phrases", "Why is the sky blue?", "Draft a polite follow-up email"],
  ],
  Coder: [
    ["Write a Python function to sort a list", "Fix this bug in my React code", "Code a matplotlib graph of sin(x)", "Explain this regex"],
    ["Write a SQL query to join two tables", "Debounce a JavaScript function", "Convert this callback to async/await", "Write a unit test for a REST API"],
    ["Refactor this Python class", "Explain Big-O of quicksort", "Build a CSS grid layout", "Write a bash script to backup files"],
  ],
};

function pickSuggestions(mode: string): string[] {
  const pools = SUGGESTIONS[mode] ?? SUGGESTIONS.Chat!;
  const pool = pools[Math.floor(Math.random() * pools.length)]!;
  return [...pool].sort(() => Math.random() - 0.5);
}

interface Msg { role: string; content: string; ts?: number; ms?: number; attachments?: { name: string; type: string; size: number; preview?: string }[]; }
interface Conv { id: string; title: string; mode: string; versions: Msg[][]; vi: number; updatedAt: number; }

const STORAGE_KEY = "velo.conversations";
const PAGE_SIZE = 8;

function loadConvs(): Conv[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return raw.map((c: any) => {
      if (Array.isArray(c.versions)) return c;
      if (Array.isArray(c.messages)) return { id: c.id, title: c.title, mode: c.mode || "Chat", versions: [c.messages], vi: 0, updatedAt: c.updatedAt || Date.now() };
      return { id: crypto.randomUUID(), title: "New chat", mode: "Chat", versions: [[]], vi: 0, updatedAt: Date.now() };
    });
  } catch { return []; }
}
function saveConvs(c: Conv[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {} }

function formatTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// LLMs emit LaTeX with \(...\) inline and \[...\] display delimiters (and sometimes
// plain-bracket forms like "[ \boxed{...} ]" on their own lines). remark-math only
// understands $...$ / $$...$$, so convert before rendering. Code fences are left alone.
function preprocessLatex(src: string): string {
  if (!src) return src;
  const protectedSegments: string[] = [];
  // Pull out fenced code blocks so we never touch their contents
  const withFences = src.replace(/```[\s\S]*?```/g, (m) => {
    protectedSegments.push(m);
    return `\u0000CODE${protectedSegments.length - 1}\u0000`;
  });

  let out = withFences;
  // Display math: \[ ... \]  →  $$ ... $$
  out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `\n$$${inner}$$\n`);
  // Bracket display form: [ <latex containing backslash commands> ]
  // (must NOT be a markdown link — those are followed immediately by "(")
  out = out.replace(/\[((?:[^\[\]\\]|\\.)+\\(?:[^\[\]\\]|\\.)*?)\](?!\()/g,
    (_m, inner) => `\n$$${inner.trim()}$$\n`);
  // Inline math: \( ... \)  →  $ ... $
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner}$`);

  // Restore code fences
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => protectedSegments[Number(i)] || "");
  return out;
}

function CodeBlock({ className, children }: { className?: string; children: any }) {
  const lang = (className || "").replace("language-", "") || "text";
  const code = String(children).replace(/\n$/, "");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const isHtml = lang === "html" || lang === "htm";

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-[#272727] enter">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#141414] text-xs text-[#71717A] border-b border-[#272727]">
        <span>{lang}</span>
        <div className="flex gap-2">
          {lang === "python" && <PythonRunner code={code} />}
          <button
            onClick={() => { setShowPreview(!showPreview); }}
            className={`p-1.5 rounded-md text-[10px] font-medium transition-all ${showPreview ? "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30" : "text-[#71717A] hover:text-[#E5E7E5] hover:bg-[#1A1A1A]"}`}
            title={showPreview ? "View code" : "Live preview"}
          >
            {showPreview ? "Code" : "Preview"}
          </button>
          <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-1.5 hover:bg-[#2A2A2A] rounded-md" title={copied ? "Copied!" : "Copy"}><Copy size={12} /></button>
        </div>
      </div>
      {!showPreview ? (
        <Highlight
          theme={themes.vsDark}
          code={code}
          language={lang}
        >
          {({ className: hlClass, style, tokens, getLineProps, getTokenProps }) => (
            <div className="p-3 overflow-x-auto" style={{ ...style, padding: "0.75rem", fontSize: "0.85rem", lineHeight: "1.6" }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Highlight>
      ) : (
        <div className="h-[400px] w-full overflow-hidden border-t border-[#272727] bg-[#0A0A0A]">
          <iframe
            srcDoc={code}
            className="w-full h-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups"
            title="HTML preview"
          />
        </div>
      )}
    </div>
  );
}

const MANIM_SHIM = `import sys, types, math, io, base64
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

_MANIM_FRAMES = []
_MANIM_FIG = None
_MANIM_AX = None
_BG = "#0A0A0A"

class _Vec:
    def __init__(self, x=0.0, y=0.0, z=0.0): self.x, self.y, self.z = float(x), float(y), float(z)
    def __add__(self, o): return _Vec(self.x+o.x, self.y+o.y, self.z+o.z)
    def __sub__(self, o): return _Vec(self.x-o.x, self.y-o.y, self.z-o.z)
    def __mul__(self, k): return _Vec(self.x*k, self.y*k, self.z*k)
    __rmul__ = __mul__

LEFT = _Vec(-1,0,0); RIGHT = _Vec(1,0,0); UP = _Vec(0,1,0); DOWN = _Vec(0,-1,0)
ORIGIN = _Vec(0,0,0)
DEGREES = math.pi/180.0
BLUE="#40a9ff"; RED="#ff6b6b"; GREEN="#51cf66"; YELLOW="#ffd43b"; GREY="#868e96"
WHITE="#ffffff"; BLACK="#000000"; PURPLE="#cc5de8"; ORANGE="#ff922b"

def _rgb(c):
    c = str(c).lstrip("#")
    if len(c) == 8: c = c[:6]
    return tuple(int(c[i:i+2],16)/255 for i in (0,2,4))

def _init_fig():
    global _MANIM_FIG, _MANIM_AX
    if _MANIM_FIG is None:
        _MANIM_FIG, _MANIM_AX = plt.subplots(figsize=(6,6), dpi=100)
        _MANIM_FIG.patch.set_facecolor(_BG)
    _MANIM_AX.cla()
    _MANIM_AX.set_xlim(-6, 6); _MANIM_AX.set_ylim(-4, 4)
    _MANIM_AX.set_facecolor(_BG)
    _MANIM_AX.set_xticks([]); _MANIM_AX.set_yticks([])
    return _MANIM_AX

def _capture(scene=None):
    if scene is not None:
        _MANIM_AX.cla()
        _MANIM_AX.set_xlim(-6, 6); _MANIM_AX.set_ylim(-4, 4)
        _MANIM_AX.set_facecolor(_BG)
        _MANIM_AX.set_xticks([]); _MANIM_AX.set_yticks([])
        for m in scene.mobjects: m._draw(_MANIM_AX)
    buf = io.BytesIO()
    _MANIM_FIG.savefig(buf, format="png", facecolor=_BG)
    buf.seek(0)
    _MANIM_FRAMES.append(plt.imread(buf, format="png"))

class _Anim:
    def __init__(self, target):
        self.target = target
        self.from_pos = target.pos
        self.from_op = target.opacity
        self.dv = _Vec()
        self.to_op = None
        self.to_pos = None
    def shift(self, v): self.dv = (self.dv + v) if self.dv else v; return self
    def move_to(self, v): self.to_pos = v; return self
    def set_opacity(self, o): self.to_op = o; return self
    def set_color(self, c): self.target.color = c; return self

class Mobject:
    def __init__(self, pos=None, color=BLUE, **kw):
        self.pos = pos or _Vec()
        self.color = color
        self.opacity = 1.0
        self.alive = True
    def shift(self, v): self.pos = self.pos + v; return self
    def move_to(self, v): self.pos = v; return self
    def set_color(self, c): self.color = c; return self
    def set_opacity(self, o): self.opacity = float(o); return self
    def scale(self, s): return self
    def become(self, other): self.pos = other.pos; return self
    @property
    def animate(self): return _Anim(self)
    def _draw(self, ax): pass

class Sphere(Mobject):
    def __init__(self, radius=1.0, color=BLUE, fill_opacity=0.8, **kw):
        super().__init__(color=color, **kw)
        self.r = float(radius); self.fill_opacity = float(fill_opacity)
    def _draw(self, ax):
        if not self.alive: return
        ax.add_patch(Circle((self.pos.x, self.pos.y), self.r, color=_rgb(self.color), alpha=self.opacity*self.fill_opacity))

class Dot(Mobject):
    def __init__(self, radius=0.12, color=YELLOW, point=None, **kw):
        super().__init__(pos=point, color=color, **kw)
        self.r = float(radius)
    def _draw(self, ax):
        if not self.alive: return
        ax.add_patch(Circle((self.pos.x, self.pos.y), self.r, color=_rgb(self.color), alpha=self.opacity))

class Plane(Mobject):
    def __init__(self, color=GREY, **kw): super().__init__(color=color, **kw)
    def _draw(self, ax):
        if not self.alive: return
        for x in np.arange(-6,7,1): ax.plot([x,x],[-4,4],color=_rgb(self.color),alpha=0.15*self.opacity,lw=0.6)
        for y in np.arange(-4,5,1): ax.plot([-6,6],[y,y],color=_rgb(self.color),alpha=0.15*self.opacity,lw=0.6)

class Text(Mobject):
    def __init__(self, s, color=WHITE, font_size=14, **kw):
        super().__init__(color=color, **kw); self.s = str(s); self.font_size = font_size
    def _draw(self, ax):
        if not self.alive: return
        ax.text(self.pos.x, self.pos.y, self.s, color=_rgb(self.color), ha="center", va="center", fontsize=self.font_size, alpha=self.opacity)

class Line(Mobject):
    def __init__(self, start=None, end=None, color=WHITE, stroke_width=4, **kw):
        super().__init__(pos=start, color=color, **kw)
        self.start = start or _Vec(); self.end = end or _Vec(); self.stroke_width = stroke_width
    def _draw(self, ax):
        if not self.alive: return
        ax.plot([self.start.x, self.end.x], [self.start.y, self.end.y], color=_rgb(self.color), lw=self.stroke_width, alpha=self.opacity)

class FadeIn:
    def __init__(self, m, shift=None, **kw): self.m = m; self.dv = shift or _Vec()
class FadeOut:
    def __init__(self, m, **kw): self.m = m

def linear(t): return t
def smooth(t): return t*t*(3-2*t)
def there_and_back(t): return math.sin(t*math.pi)
def ease_in_out(t): return t*t*(3-2*t)

class Scene:
    def __init__(self):
        self.mobjects = []
        _MANIM_FRAMES.clear()
    def set_camera_orientation(self, **kw): pass
    def add(self, *ms):
        for m in ms:
            if m not in self.mobjects: self.mobjects.append(m)
        _init_fig()
    def remove(self, *ms):
        for m in ms:
            if m in self.mobjects: self.mobjects.remove(m)
    def play(self, *anims, run_time=1.0, rate_func=linear):
        _init_fig()
        steps = max(8, int(run_time*24))
        animated = set()
        for a in anims:
            m = getattr(a, "m", None) or getattr(a, "target", None)
            if m is None: continue
            if m not in self.mobjects: self.mobjects.append(m)
            animated.add(id(m))
            if isinstance(a, FadeIn):
                m._start_op, m._end_op = 0.0, 1.0
                m._start_pos, m._end_pos = m.pos - a.dv, m.pos
            elif isinstance(a, FadeOut):
                m._start_op, m._end_op = m.opacity, 0.0
                m._start_pos = m._end_pos = m.pos
            else:
                m._start_pos = a.from_pos
                m._end_pos = a.to_pos if a.to_pos is not None else (a.from_pos + a.dv)
                m._start_op = m.opacity
                m._end_op = a.to_op if a.to_op is not None else m.opacity
        for m in self.mobjects:
            if id(m) not in animated:
                m._start_pos = m._end_pos = m.pos
                m._start_op = m._end_op = m.opacity
        for i in range(steps+1):
            t = rate_func(i/steps)
            for m in self.mobjects:
                p0, p1 = m._start_pos, m._end_pos
                o0, o1 = m._start_op, m._end_op
                m.pos = p0 + (p1-p0)*t
                m.opacity = o0 + (o1-o0)*t
            _capture(self)
        for m in self.mobjects:
            if getattr(m, "_end_op", 1.0) <= 0.0: m.alive = False
        self.mobjects = [m for m in self.mobjects if m.alive]
    def wait(self, t=1.0):
        _init_fig()
        for _ in range(max(3,int(t*15))): _capture(self)

manim = types.ModuleType("manim")
for _n in ["Scene","Sphere","Plane","Dot","Text","Line","FadeIn","FadeOut","Mobject","_Vec",
           "LEFT","RIGHT","UP","DOWN","ORIGIN","DEGREES","BLUE","RED","GREEN","YELLOW",
           "GREY","WHITE","BLACK","PURPLE","ORANGE","linear","smooth","there_and_back","ease_in_out"]:
    manim.__dict__[_n] = globals()[_n]
sys.modules["manim"] = manim
`;

const MANIM_ENCODE = `import io, base64, inspect
from PIL import Image
_scenes = [c for c in list(globals().values())
           if inspect.isclass(c) and issubclass(c, Scene) and c is not Scene]
for _cls in _scenes:
    _s = _cls()
    if hasattr(_s, "construct"): _s.construct()
_result = ""
if _MANIM_FRAMES:
    _buf = io.BytesIO()
    _frames = [Image.fromarray((f[:,:,:3]*255).astype("uint8")).convert("P", palette=Image.ADAPTIVE)
               for f in _MANIM_FRAMES]
    _frames[0].save(_buf, format="GIF", save_all=True, append_images=_frames[1:],
                    duration=50, loop=0, optimize=True)
    _result = base64.b64encode(_buf.getvalue()).decode()
`;

const PLOT_ENCODE = `import io, base64
import matplotlib.pyplot as plt
_result = ""
if plt.get_fignums():
    _fig = plt.gcf()
    _buf = io.BytesIO()
    plt.savefig(_buf, format="png", bbox_inches="tight", facecolor=_fig.get_facecolor())
    plt.close("all")
    _result = base64.b64encode(_buf.getvalue()).decode()
`;

function PythonRunner({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [output, setOutput] = useState("");
  const [img, setImg] = useState<string | null>(null);
  const isManim = /(^|\n)\s*(from\s+manim\s+import|import\s+manim)/.test(code);

  const run = async () => {
    setState("running"); setImg(null); setOutput("");
    try {
      let py: any = (window as any).pyodide;
      if (!py) {
        setOutput("Loading Python runtime…");
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js";
        document.head.appendChild(s);
        await new Promise((res, rej) => { s.onload = res; s.onerror = () => rej(new Error("Could not load Pyodide (offline?)")); });
        py = await (window as any).loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/" });
        (window as any).pyodide = py;
        await py.loadPackage(["numpy", "matplotlib", "pillow"]);
        setOutput("");
      }
      py.setStdout({ batched: (t: string) => setOutput((o: string) => o + t + "\n") });
      py.setStderr({ batched: (t: string) => setOutput((o: string) => o + t + "\n") });

      if (isManim) {
        setOutput("Rendering animation…");
        py.runPython(MANIM_SHIM);
        await py.runPythonAsync(code);
        py.runPython(MANIM_ENCODE);
        const gif = py.globals.get("_result");
        setImg(gif ? "data:image/gif;base64," + gif : null);
        setState("done");
        return;
      }

      await py.runPythonAsync(code);
      py.runPython(PLOT_ENCODE);
      const b64 = py.globals.get("_result");
      if (b64) setImg("data:image/png;base64," + b64);
      setState("done");
    } catch (e: any) {
      setOutput(String(e?.message ?? e));
      setState("error");
    }
  };

  return (
    <div className="w-full">
      <button onClick={run} className="flex items-center gap-1 hover:text-white">
        <Play size={11} /> {state === "running" ? "Running…" : isManim ? "Render animation" : "Run"}
      </button>
      {output && <pre className="mt-1 text-xs text-[#A1A1A1] whitespace-pre-wrap bg-[#0A0A0A] p-2 rounded">{output}</pre>}
      {state === "error" && <div className="mt-1 text-xs text-[#FF3B30]">Runtime error (see output above)</div>}
      {img && (
        <figure className="mt-2">
          <img src={img} alt="Output" className="rounded border border-[#2A2A2A] max-w-full" />
          {isManim && (
            <figcaption className="mt-1 text-[10px] text-[#6B6B6B] flex items-center gap-1">
              <Play size={10} /> animated GIF rendered from your scene
            </figcaption>
          )}
        </figure>
      )}
    </div>
  );
}

function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("unsplash.com")) {
      return u.protocol + "//" + u.hostname + u.pathname;
    }
    return url;
  } catch {
    return url;
  }
}

function InlineImage({ src, alt }: { src?: string; alt?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const normalizedSrc = useMemo(() => src ? normalizeImageUrl(src) : "", [src]);
  if (!src) return null;
  return (
    <span className="block mt-2">
      {state === "error" ? (
        <div className="rounded-xl border border-[#2A2A2A] bg-[#111111] p-4 animate-in">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#1F1F1F] flex items-center justify-center">
              <ImageIcon size={18} className="text-[#6B6B6B]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#EDEDED]">{alt || "Image"}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">Couldn’t load image — the source may be unavailable or expired.</p>
              <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-[#FF3B30] hover:underline break-all">
                <ExternalLink size={10} /> Open original URL
              </a>
            </div>
          </div>
        </div>
      ) : (
        <>
          {state === "loading" && (
            <div className="block h-32 rounded-xl border border-[#2A2A2A] bg-[#111111] animate-pulse" />
          )}
          <img
            src={normalizedSrc}
            alt={alt || ""}
            onLoad={() => setState("ok")}
            onError={() => setState("error")}
            className={`rounded-xl border border-[#2A2A2A] max-h-96 object-contain ${state === "ok" ? "enter" : "hidden"}`}
          />
        </>
      )}
    </span>
  );
}

function LinkCard({ url }: { url: string }) {
  const [data, setData] = useState<any>(null);
  const [imgOk, setImgOk] = useState(true);
  const host = useMemo(() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; } }, [url]);
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  const spotify = url.match(/open\.spotify\.com\//);
  const soundcloud = url.match(/soundcloud\.com\//);
  const twitch = url.match(/twitch\.tv\//);
  const vimeo = url.match(/vimeo\.com\/\d+/);
  const figma = url.match(/figma\.com\//);
  const gmaps = /google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps/.test(url);
  const isDirectImg = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url) || /images\.unsplash\.com|imgur\.com|i\.redd\.it|media\.|\/media\/|picsum\.photos/.test(host);
  const isEmbed = yt || spotify || soundcloud || twitch || vimeo || figma || gmaps;
  useEffect(() => {
    if (isEmbed) return;
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`).then((r) => r.json()).then(setData).catch(() => setData({ error: true }));
  }, [url, isEmbed]);
  if (yt) return <iframe className="w-full aspect-video rounded-lg mt-2 border border-[#2A2A2A] enter" src={`https://www.youtube.com/embed/${yt[1]}`} allowFullScreen />;
  if (spotify) return <iframe className="w-full h-[152px] rounded-lg mt-2 border border-[#2A2A2A] enter" src={`https://open.spotify.com/embed${url.split("open.spotify.com")[1]}`} allow="encrypted-media" />;
  if (soundcloud) return <iframe className="w-full h-[166px] rounded-lg mt-2 border border-[#2A2A2A] enter" src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff3b30`} />;
  if (twitch) return <iframe className="w-full aspect-video rounded-lg mt-2 border border-[#2A2A2A] enter" src={`https://player.twitch.tv/?channel=${url.split("/").pop()}&parent=localhost`} />;
  if (vimeo) return <iframe className="w-full aspect-video rounded-lg mt-2 border border-[#2A2A2A] enter" src={`https://player.vimeo.com/video/${url.split("/").pop()}`} allowFullScreen />;
  if (figma) return <a href={url} target="_blank" className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-[#2A2A2A] text-sm hover:border-[#3A3A3A]">◆ {host}</a>;
  if (gmaps) {
    const q = decodeURIComponent((url.split("?q=")[1] || url.split("maps?q=")[1] || "").replace(/\+/g, " "));
    const src = q ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed` : url.replace(/^https?:\/\/[^/]+/, "https://maps.google.com");
    return <iframe className="w-full h-64 rounded-lg mt-2 border border-[#2A2A2A] enter" src={src} allowFullScreen />;
  }
  if (isDirectImg) return <img src={url} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} className="max-h-72 rounded-lg mt-2 border border-[#2A2A2A] object-contain enter" />;
  if (!data) return <div className="text-xs text-[#6B6B6B] mt-2">Loading preview…</div>;
  if (data.error) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2 rounded-lg border border-[#2A2A2A] overflow-hidden hover:border-[#3A3A3A] transition-colors enter">
      {data.image && imgOk && <img src={data.image} alt="" onError={() => setImgOk(false)} className="w-full max-h-48 object-cover" />}
      {data.image && !imgOk && <div className="w-full h-24 bg-[#171717] flex items-center justify-center text-xs text-[#6B6B6B]">image unavailable</div>}
      <div className="p-3">
        <div className="text-sm font-medium">{data.title || url}</div>
        {data.description && <div className="text-xs text-[#A1A1A1] mt-1 line-clamp-2">{data.description}</div>}
        <div className="text-[10px] text-[#6B6B6B] mt-1">{data.siteName || host}</div>
      </div>
    </a>
  );
}

function MessageBubble({
  message,
  index,
  messages,
  streaming,
  editIdx,
  onCopy,
  onSpeak,
  onEdit,
  onSend,
  onRedo,
  onRegenerate,
}: {
  message: Msg;
  index: number;
  messages: Msg[];
  streaming: boolean;
  editIdx: number | null;
  onCopy: (content: string) => void;
  onSpeak: (content: string) => void;
  onEdit: (index: number, content: string) => void;
  onSend: (content: string) => void;
  onRedo: (index: number) => void;
  onRegenerate: () => void;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isStreaming = streaming && index === messages.length - 1 && isAssistant;
  const isEditing = editIdx === index;

  const prevMsg = messages[index - 1];
  const nextMsg = messages[index + 1];
  const isFirstInGroup = !prevMsg || prevMsg.role !== message.role;
  const isLastInGroup = !nextMsg || nextMsg.role !== message.role;
  const showAvatar = isFirstInGroup;

  const topRadius = isFirstInGroup ? "rounded-t-3xl" : "rounded-t-[4px]";
  const bottomRadius = isLastInGroup ? "rounded-b-3xl" : "rounded-b-[4px]";
  const sideRadius = isUser
    ? isLastInGroup ? "rounded-tr-3xl" : "rounded-tr-[4px]"
    : isLastInGroup ? "rounded-tl-3xl" : "rounded-tl-[4px]";

  const baseClasses = `
    max-w-[92%] px-5 py-3 text-sm leading-relaxed relative select-text
    rounded-3xl ${topRadius} ${bottomRadius} ${sideRadius}
    ${isUser
      ? "bg-gradient-to-br from-[#FF3B30] via-[#E0352B] to-[#B3271E] text-white shadow-[0_4px_20px_rgba(255,59,48,0.25)]"
      : "bg-[#141414] border border-[#262626] text-[#EDEDED] shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
    }
  `;

  const avatarIcon = isUser ? <User size={16} /> : <span className="font-black text-[15px] leading-none tracking-tight">V</span>;
  const avatarColor = isUser
    ? "bg-gradient-to-br from-[#FF3B30] to-[#E0352B]"
    : "bg-black";

  const renderContent = () => {
    if (isEditing) {
      return (
        <div className={`w-full ${baseClasses}`}>
          <div className="flex gap-2">
            <textarea
              value={message.content}
              onChange={(e) => onEdit(index, e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm resize-none text-inherit"
              rows={3}
              autoFocus
            />
            <button
              onClick={() => onSend(message.content)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isUser
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-[#262626] text-white hover:bg-[#2E2E2E]"
              }`}
            >
              Send
            </button>
          </div>
        </div>
      );
    }

    const content = (
      <div
        className={`w-full ${baseClasses} group ${isStreaming ? "streaming-cursor" : ""}`}
        role={isAssistant ? "status" : undefined}
        aria-live={isStreaming ? "polite" : undefined}
      >
        {isAssistant ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, output: "html" }]]}
            components={{
              code({ className, children, ...props }: any) {
                const isBlock = /language-/.test(className || "");
                if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
                return (
                  <code
                    className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                      isUser ? "bg-white/15 text-[#FFD43B]" : "bg-[#1F1F1F] text-[#51CF66]"
                    }`}
                    {...props}
                  >
                    {children}
                  </code>                );
              },
              img({ src, alt }: any) {
                return <InlineImage src={src} alt={alt} />;
              },
              p({ children, ...props }: any) {
                return <p className="my-2 last:mb-0 first:mt-0" {...props}>{children}</p>;
              },
              ul({ children, ...props }: any) {
                return <ul className="list-disc pl-5 my-2 space-y-1" {...props}>{children}</ul>;
              },
              ol({ children, ...props }: any) {
                return <ol className="list-decimal pl-5 my-2 space-y-1" {...props}>{children}</ol>;
              },
              li({ children, ...props }: any) {
                return <li className="leading-relaxed" {...props}>{children}</li>;
              },
              blockquote({ children, ...props }: any) {
                return (
                  <blockquote
                    className={`border-l-3 pl-3 my-2 italic ${
                      isUser ? "border-white/30 text-white/80" : "border-[#FF3B30]/50 text-[#A1A1A1]"
                    }`}
                    {...props}
                  >
                    {children}
                  </blockquote>
                );
              },
              h1({ children, ...props }: any) {
                return <h1 className="text-lg font-bold mt-4 mb-2" {...props}>{children}</h1>;
              },
              h2({ children, ...props }: any) {
                return <h2 className="text-base font-bold mt-3 mb-1" {...props}>{children}</h2>;
              },
              h3({ children, ...props }: any) {
                return <h3 className="text-sm font-bold mt-2 mb-1" {...props}>{children}</h3>;
              },
              table({ children, ...props }: any) {
                return (
                  <div className="overflow-x-auto my-3 rounded-xl border border-[#2A2A2A]">
                    <table className="w-full text-xs" {...props}>
                      {children}
                    </table>
                  </div>
                );
              },
              th({ children, ...props }: any) {
                return (
                  <th
                    className={`px-3 py-2 text-left font-semibold border-b border-[#2A2A2A] ${
                      isUser ? "bg-white/10 text-white" : "bg-[#1F1F1F] text-[#EDEDED]"
                    }`}
                    {...props}
                  >
                    {children}
                  </th>
                );
              },
              td({ children, ...props }: any) {
                return (
                  <td
                    className={`px-3 py-2 border-t border-[#2A2A2A]/50 ${
                      isUser ? "text-white/90" : "text-[#A1A1A1]"
                    }`}
                    {...props}
                  >
                    {children}
                  </td>
                );
              },
              hr({ ...props }: any) {
                return <hr className="my-3 border-[#2A2A2A]" {...props} />;
              },
            }}
          >{isAssistant ? preprocessLatex(message.content) : message.content || (isStreaming ? "▊" : "")}</ReactMarkdown>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {message.attachments.map((att: any, i: number) => {
              const isText = /\.(txt|md|js|ts|tsx|jsx|py|json|css|html|mdx|sh|bash|yaml|yml|toml|xml|csv)$/i.test(att.name);
              return (
                <div key={i} className="flex flex-col gap-1 px-3 py-2 rounded-xl bg-[#1A1A1A] border border-[#272727] text-xs">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1A1A1A] border border-[#272727] text-xs">
                    <FileText className="text-[#71717A]" size={12} />
                    <span className="truncate max-w-[200px]">{att.name}</span>
                    <span className="text-[#71717A]">({(att.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  {isText && att.preview && (
                    <div className="px-3 pb-2 text-[11px] text-[#9CA3AF] bg-[#141414] rounded-lg border border-[#272727] max-h-48 overflow-auto font-mono whitespace-pre-wrap">
                      {att.preview}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(() => {
          const urls = message.content.match(/https?:\/\/[^\s)]+/g) || [];
          return Array.from(new Set(urls)).map((u) => <LinkCard key={u} url={u} />);
        })()}
      </div>
    );

    const actionBar = (
      <div
        className={`flex items-center gap-2 mt-1.5 opacity-90 transition-all duration-200 translate-y-0 ${
          isUser ? "justify-end" : "justify-start"
        }`}
      >
        <button
          onClick={() => onCopy(message.content)}
          className={`p-1.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${
            isUser
              ? "text-white/70 hover:text-white hover:bg-white/15"
              : "text-[#6B6B6B] hover:text-white hover:bg-[#262626]"
          }`}
          title="Copy"
        >
          <Copy size={11} />
        </button>
        {isAssistant && (
          <>
            <button
              onClick={() => onRedo(index)}
              className={`p-1.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${
                isUser
                  ? "text-white/70 hover:text-white hover:bg-white/15"
                  : "text-[#6B6B6B] hover:text-white hover:bg-[#262626]"
              }`}
              title="Redo"
            >
              <RotateCcw size={11} className="rotate-180" />
            </button>
            <button
              onClick={() => onSpeak(message.content)}
              className={`p-1.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${
                isUser
                  ? "text-white/70 hover:text-white hover:bg-white/15"
                  : "text-[#6B6B6B] hover:text-white hover:bg-[#262626]"
              }`}
              title="Speak"
            >
              <Volume2 size={11} />
            </button>
          </>
        )}
        {isUser && (
          <button
            onClick={() => onEdit(index, message.content)}
            className={`p-1.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${
              isUser
                ? "text-white/70 hover:text-white hover:bg-white/15"
                : "text-[#6B6B6B] hover:text-white hover:bg-[#262626]"
            }`}
            title="Edit & resend"
          >
            <Pencil size={11} />
          </button>
        )}
        {index === messages.length - 1 && isAssistant && (
          <button
            onClick={onRegenerate}
            className={`p-1.5 rounded-xl transition-all hover:scale-105 active:scale-95 ${
              isUser
                ? "text-white/70 hover:text-white hover:bg-white/15"
                : "text-[#6B6B6B] hover:text-white hover:bg-[#262626]"
            }`}
            title="Regenerate"
          >
            <RotateCcw size={11} />
          </button>
        )}
        {message.ts && (
          <span className={`text-[10px] mono select-none ${isUser ? "text-white/50" : "text-[#6B6B6B]"}`}>
            {formatTime(message.ts)}
          </span>
        )}
      </div>
    );

    return (
      <>
        {content}
        {actionBar}
      </>
    );
  };

  return (
    <div
      key={index}
      className={`flex animate-in w-full ${isUser ? "justify-end" : "justify-start"}`}
      style={{
        animationDelay: `${index * 30}ms`,
        animationDuration: "300ms",
      }}
    >
      <div className={`flex ${isUser ? "flex-row-reverse" : ""} gap-3 max-w-[92%] w-full min-w-0`}>
        {showAvatar && !isEditing && (
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-2xl flex items-center justify-center ${avatarColor} shadow-[0_2px_10px_rgba(0,0,0,0.3)] text-white self-end`}
            aria-hidden="true"
          >
            {avatarIcon}
          </div>
        )}
        {!showAvatar && !isEditing && <div className="flex-shrink-0 w-8" />}

        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} min-w-0`}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState("Chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [searching, setSearching] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(SUGGESTIONS.Chat![0]!);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const newChatRef = useRef<(() => void) | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [tps, setTps] = useState(0);
  const currentConv = convs.find((c) => c.id === currentId);
  const [filteredCmds, setFilteredCmds] = useState([...MODES].map((m) => ({ label: `Mode: ${m.name}`, action: () => setMode(m.name) })));
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [apiKey, setApiKey] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sendRef = useRef<((t?: string, b?: Msg[]) => Promise<void>) | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  // Load available TTS voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        const preferred = voices.find(v => v.lang.startsWith("en") && v.name.includes("Natural")) || voices.find(v => v.lang.startsWith("en")) || voices[0];
        setSelectedVoice(preferred || null);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Speech-to-text using Groq Whisper via MediaRecorder
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");
        formData.append("apiKey", apiKey);
        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          if (data.text) {
            setInput((prev) => (prev ? prev + " " : "") + data.text);
          }
        } catch (e) {
          console.error("Transcription failed:", e);
        }
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error("Mic access denied:", e);
    }
  }, [apiKey]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Enhanced speak with voice selection
  const speakText = useCallback((text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (selectedVoice) u.voice = selectedVoice;
      u.rate = 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }, [selectedVoice]);

  // Voice mode: continuous listen -> respond -> speak loop
  const voiceModeActive = useRef(false);
  const startVoiceMode = useCallback(async () => {
    voiceModeActive.current = true;
    setVoiceMode(true);
    while (voiceModeActive.current) {
      // Listen
      await new Promise<void>((resolve) => {
        const stream = navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
          const recorder = new MediaRecorder(s, { mimeType: "audio/webm" });
          audioChunksRef.current = [];
          recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
          recorder.onstop = () => { s.getTracks().forEach(t => t.stop()); resolve(); };
          recorder.start();
          mediaRecorderRef.current = recorder;
          // Auto-stop after 5 seconds of silence or max 15 seconds
          setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 15000);
        });
      });
      // Transcribe
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      formData.append("apiKey", apiKey);
      let transcript = "";
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        const data = await res.json();
        transcript = data.text || "";
      } catch {}
      if (!transcript.trim()) continue;
      // Send message and wait for response
      await sendRef.current?.(transcript);
      // Auto-read the last assistant message
      if (autoRead) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === "assistant") speakText(lastMsg.content);
      }
      // Small pause before listening again
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, [apiKey, autoRead, speakText, messages]);

  const stopVoiceMode = useCallback(() => {
    voiceModeActive.current = false;
    setVoiceMode(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    if (!cmdQuery) {
      setFilteredCmds([...MODES].map((m) => ({ label: `Mode: ${m.name}`, action: () => setMode(m.name) })));
    } else {
      const q = cmdQuery.toLowerCase();
      const results = [...MODES].filter(m => m.name.toLowerCase().includes(q));
      if (results.length === 0) {
        setFilteredCmds([{ label: `No commands match "${cmdQuery}"`, action: () => {} }]);
      } else {
        setFilteredCmds(results.map(m => ({ label: `Mode: ${m.name}`, action: () => setMode(m.name) })));
      }
    }
  }, [cmdQuery]);

  useEffect(() => { setConvs(loadConvs()); }, []);
  useEffect(() => { setSuggestions(pickSuggestions(mode)); }, [mode]);

  const newChat = useCallback(() => {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setStreaming(false);
    setCurrentId(null);
    setLatency(null);
    setSuggestions(pickSuggestions(mode));
  }, [streaming, mode]);
  newChatRef.current = newChat;

useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K: command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen((v) => !v); }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  // Auto-save conversations to localStorage whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;
    setConvs((prev) => {
      const id = currentId ?? crypto.randomUUID();
      if (!currentId) setCurrentId(id);
      const title = (messages.find((m) => m.role === "user")?.content ?? "New chat").slice(0, 40);
      const existing = prev.find((c) => c.id === id);
      const versions = existing ? [...existing.versions.filter((_, i) => i !== existing.vi), messages] : [messages];
      const updated: Conv = { id, title, mode, versions, vi: versions.length - 1, updatedAt: Date.now() };
      const next = [updated, ...prev.filter((c) => c.id !== id)];
      saveConvs(next);
      return next;
    });
  }, [messages, currentId, mode]);

  const loadConv = useCallback((c: Conv) => {
    if (streaming) abortRef.current?.abort();
    const msgs = c.versions?.[c.vi ?? 0] || [];
    // deep clone so stored data isn't mutated by reference
    setMessages(JSON.parse(JSON.stringify(msgs)));
    setCurrentId(c.id);
    setStreaming(false);
    setSuggestions(pickSuggestions(c.mode || "Chat"));
  }, [streaming]);

  const filteredConvs = convs.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );
  const visibleConvs = filteredConvs.slice(0, page * PAGE_SIZE);
  const hasMore = page * PAGE_SIZE < filteredConvs.length;

  const copyText = useCallback(async (t: string) => {
    await navigator.clipboard.writeText(t);
  }, []);

  const speak = useCallback((t: string) => {
    try {
      const u = new SpeechSynthesisUtterance(t);
      if (selectedVoice) u.voice = selectedVoice;
      u.rate = 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }, [selectedVoice]);

  const deleteConv = useCallback((id: string) => {
    setConvs(prev => prev.filter(c => c.id !== id));
    if (currentId === id) {
      setMessages([]);
      setCurrentId(null);
    }
  }, [currentId]);

  const stepVersion = useCallback((dir: -1 | 1) => {
    setConvs((prev) => {
      const idx = prev.findIndex((c) => c.id === currentId);
      if (idx < 0) return prev;
      const c = prev[idx];
      if (!c) return prev;
      const vi = Math.max(0, Math.min(c.versions.length - 1, (c.vi ?? 0) + dir));
      const updated = { ...c, vi };
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }, [currentId]);

  const exportChat = useCallback(() => {
    const c = convs.find((x) => x.id === currentId);
    if (!c) return;
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `velo-${c.title.replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [convs, currentId]);

  const runSlash = (text: string) => {
    if (!text.startsWith("/")) return false;
    const parts = text.split(" ");
    const cmd = parts[0]!.toLowerCase();
    if (cmd === "/clear") { setMessages([]); return true; }
    if (cmd === "/export") { exportChat(); return true; }
    if (cmd === "/help") { setInput("/clear · /export · /search <q> · /mode Chat · /mode Coder"); return true; }
    if (cmd === "/search" && parts.length > 1) { setWebSearch(true); return true; }
    if (cmd === "/mode") {
      const m = parts[1];
      if (m === "Chat" || m === "Coder") { setMode(m); setSuggestions(pickSuggestions(m)); }
      return true;
    }
    return false;
  };

  const send = useCallback(async (textOverride?: string, base?: Msg[]) => {
    const t = (textOverride ?? input).trim();
    if (!t && attachments.length === 0) return;
    const b = base ?? messages;
    const next = [...b.filter((m, i) => i !== editIdx || editIdx === null || m.role !== "user"), { 
      role: "user", 
      content: t, 
      ts: Date.now(),
      attachments: attachments.map(f => ({ name: f.name, type: f.type, size: f.size }))
    }];
    if (editIdx !== null) setEditIdx(null);
    if (!textOverride) { setInput(""); setAttachments([]); }
    let finalNext = next;
    const useSearch = webSearch || t.startsWith("/search ");
    if (useSearch) {
      const query = t.replace(/^\/search\s+/, "");
      setSearching(true);
      try {
        const sr = await fetch(`/api/search?q=${encodeURIComponent(query)}`).then((r) => r.json());
        if (sr.results?.length) {
          const ctx = sr.results.map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join("\n\n");
          finalNext = [...next, { role: "user", content: `Web search results for "${query}":\n\n${ctx}\n\nAnswer the user's question using these sources with inline citations [1], [2].`, ts: Date.now() }];
        }
      } catch {}
      setSearching(false);
    }
    setMessages(next);
    setStreaming(true);
    const start = performance.now();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: finalNext, mode }), signal: ctrl.signal }).catch(() => null);
    if (!res || !res.body) { setStreaming(false); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    let tokens = 0;
    let buf = "";
    setMessages((m) => [...m, { role: "assistant", content: "", ts: Date.now() }]);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const line of parts) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") { const ms = Math.round(performance.now() - start); setLatency(ms); setTps(Math.round(tokens / (ms / 1000))); setStreaming(false); setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1]!, ms }; return c; }); return; }
          try {
            const j = JSON.parse(payload);
            if (j.token) { acc += j.token; tokens++; setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: acc, ts: Date.now() }; return c; }); }
            if (j.error) { acc += "\n[error: " + j.error + "]"; setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: acc }; return c; }); }
          } catch {}
        }
      }
      if (buf.startsWith("data:")) {
        const payload = buf.slice(5).trim();
        try { const j = JSON.parse(payload); if (j.token) acc += j.token; } catch {}
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setMessages((m) => { const c = [...m]; if (c.length) c[c.length - 1] = { role: "assistant", content: acc + "\n[stopped]" }; return c; });
    } finally { setStreaming(false); abortRef.current = null; }
    // Auto-read the last assistant message if enabled
    if (autoRead) {
      setTimeout(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === "assistant") speak(lastMsg.content);
      }, 500);
    }
  }, [input, messages, mode, editIdx, webSearch, attachments, autoRead, speak]);

  sendRef.current = send;

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);
  const regenerate = useCallback(async () => {
    const trimmed = messages[messages.length - 1]?.role === "assistant" ? messages.slice(0, -1) : messages;
    const lastUser = [...trimmed].reverse().find((m) => m.role === "user");
    if (lastUser) await send(lastUser.content, trimmed);
  }, [messages, send]);

  const redoMessage = useCallback(async (idx: number) => {
    const m = messages[idx];
    if (!m || m.role !== "assistant") return;
    const prevUser = [...messages].slice(0, idx).reverse().find((x) => x.role === "user");
    if (!prevUser) return;
    const base = messages.slice(0, idx);
    await send(prevUser.content, base);
  }, [messages, send]);

  const slash = input.startsWith("/");
  const slashCmds = ["/clear", "/export", "/help", "/search ", "/mode Chat", "/mode Coder"].filter((s) => s.startsWith(input.split(" ")[0]!));

  return (
    <div className="flex relative h-screen bg-[#0A0A0A] text-[#EDEDED] overflow-hidden">
      <div className="bg-mesh">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
      </div>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`w-64 border-r border-[#1F1F1F] bg-[#0A0A0A] fixed left-0 top-0 h-full z-40 transition-transform duration-300 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:relative lg:static lg:inset-0 lg:h-auto lg:z-0 lg:translate-x-0`}>
        {/* Mobile close button */}
        <div className="lg:hidden p-3 border-b border-[#1F1F1F] flex items-center justify-between">
          <span className="text-sm font-semibold text-[#E5E7E5]">Sidebar</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg text-[#9CA3AF] hover:text-[#E5E7E5] hover:bg-[#1A1A1A] transition-colors" aria-label="Close sidebar">
            <X size={20} />
          </button>
        </div>
        <div className="p-3 space-y-3">
          <button onClick={newChat} className="w-full group relative flex items-center justify-center gap-2 px-3 py-3 rounded-2xl border border-[#272727] bg-[#141414] text-[#E5E7E5] text-sm font-medium hover:bg-[#1A1A1A] hover:border-[#3A3A3A] transition-all active:scale-95 shadow-[0_0_12px_rgba(0,0,0,0.4)]">
            <Plus size={16} className="transition-transform group-hover:rotate-90" /> New chat
          </button>
          <div className="relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6B]" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }} placeholder="Search chats…" className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-[#111111] border border-[#2A2A2A] text-sm outline-none focus:border-[#FF3B30] focus:ring-1 focus:ring-[#FF3B30]/40 transition-all placeholder-[#6B6B6B]" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-white transition-colors"><X size={13} /></button>}
          </div>
          <div className="flex gap-1.5">
            {MODES.map((m) => { const Icon = m.icon; return (
              <button key={m.name} onClick={() => setMode(m.name)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs transition-all ${mode === m.name ? "bg-[#1A1A1A] text-[#FF3B30] border border-[#FF3B30]/30 shadow-[0_0_8px_rgba(255,59,48,0.15)]" : "text-[#8A8A8A] border border-[#272727] hover:text-[#E5E7E5] hover:bg-[#141414]"}`}><Icon size={12} /> {m.name}</button>
            ); })}
          </div>
        </div>
        <div className="flex items-center justify-between px-4 mb-2">
          <span className="text-[10px] text-[#71717A] uppercase tracking-widest">{search ? `Results (${filteredConvs.length})` : "History"}</span>
          {convs.length > 0 && <button onClick={() => { if (confirm("Delete all chats?")) { setConvs([]); saveConvs([]); newChat(); } }} className="text-[10px] text-[#71717A] hover:text-[#FF3B30] transition-colors">Clear all</button>}
        </div>
        <div className="flex-1 overflow-y-auto px-1 space-y-0.5">
          {visibleConvs.map((c) => (
            <div key={c.id} onClick={() => loadConv(c)} className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm cursor-pointer transition-all ${currentId === c.id ? "bg-[#1A1A1A] text-[#E5E7E5] border border-[#272727] shadow-[0_0_10px_rgba(255,59,48,0.1)]" : "text-[#9CA3AF] hover:bg-[#141414] hover:text-[#E5E7E5] border-transparent"}`}>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#9CA3AF] group-hover:bg-[#FF3B30] transition-colors flex-shrink-0" />
                <span className="truncate">{c.title}</span>
                {(c.versions?.length ?? 1) > 1 && (
                  <span className="text-[9px] text-[#71717A] font-mono bg-[#141414] px-1.5 py-0.5 rounded border border-[#272727]/50 ml-auto shrink-0">
                    {(c.vi ?? 0) + 1}/{c.versions.length}
                  </span>
                )}
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }} className="opacity-0 group-hover:opacity-100 text-[#71717A] hover:text-[#FF3B30] transition-opacity p-1 rounded hover:bg-[#1A1A1A]"><Trash2 size={11} /></button>
            </div>
          ))}
          {hasMore && <button onClick={() => setPage((p) => p + 1)} className="w-full text-xs text-[#6B6B6B] hover:text-white py-2 flex items-center justify-center gap-1 rounded-lg hover:bg-[#141414] transition-colors"><ChevronDown size={11} /> Load more</button>}
          {filteredConvs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 space-y-3">
              <Search size={26} className="text-[#3A3A3A]" />
              <div className="text-xs text-[#6B6B6B]">{search ? "No chats match your search" : "No chats yet"}</div>
              {!search && <button onClick={newChat} className="text-[10px] text-[#FF3B30] font-medium hover:underline hover:glow transition-all">Start your first chat →</button>}
            </div>
          )}
        </div>

        <div className="p-3 text-[10px] text-[#6B6B6B] border-t border-[#1F1F1F]">Velo · by Eldrick Sidney & Jeremy Kinoti</div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0" onClick={() => sidebarOpen && setSidebarOpen(false)}>
        <header className="h-12 border-b border-[#272727] flex items-center px-4 gap-3 shrink-0 bg-[#0A0A0A]/80 backdrop-blur-md">
          <button onClick={() => setSidebarOpen((v) => !v)} className="text-[#9CA3AF] hover:text-[#E5E7E5] p-1 rounded-md hover:bg-[#141414]"><Menu size={18} /></button>
          <span className="font-medium text-sm">Velo</span>
          <span className="text-xs text-[#71717A]">/ {mode}</span>
          {latency !== null && <span className="text-[10px] text-[#71717A] mono">{latency}ms · {tps} tok/s</span>}
          <div className="ml-auto flex items-center gap-2 text-xs text-[#71717A]">
            <button onClick={exportChat} className="p-1.5 rounded-md border border-[#272727] hover:text-[#E5E7E5]" title="Export"><Download size={13} /></button>
            <button onClick={() => setCmdOpen(true)} className="px-2 py-1 rounded-md border border-[#272727] hover:text-[#E5E7E5]">⌘K</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="w-full max-w-[90vw] mx-auto px-4 py-8 space-y-8">
            {messages.length === 0 && (
              <div className="mt-12 enter-pop">
                <div className="flex flex-col items-center justify-center text-center space-y-5">
                  <div className="space-y-2">
                    <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-[#E5E7E5] via-[#9CA3AF] to-[#E5E7E5] bg-clip-text text-transparent">Velo</h1>
                    <p className="text-[#A1A1A1] text-sm">High-velocity AI chat · {mode} mode · by Eldrick Sidney & Jeremy Kinoti</p>
                  </div>
                </div>
                <div className="mt-10 flex flex-wrap justify-center gap-3 max-w-[800px] mx-auto">
                  {suggestions.map((s, si) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{ animationDelay: `${si * 70}ms` }}
                      className="enter px-4 py-2 rounded-2xl border border-[#272727] text-xs font-medium text-[#9CA3AF] hover:border-[#FF3B30]/50 hover:text-[#FF3B30] hover:-translate-y-0.5 hover:bg-[#141414] active:scale-95 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {streaming && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
              <div className="flex justify-start enter-fade">
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#111111] border border-[#2A2A2A]">
                  <span className="w-2 h-2 rounded-full bg-[#FF3B30] pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[#FF3B30] pulse" style={{ animationDelay: "200ms" }} />
                  <span className="w-2 h-2 rounded-full bg-[#FF3B30] pulse" style={{ animationDelay: "400ms" }} />
                  <span className="text-[#A1A1A1] text-xs ml-2">Velo is thinking…</span>
                </div>
              </div>
            )}
            {streaming && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
              <div className="flex justify-start enter-fade">
                <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-[#111111] border border-[#2A2A2A] shadow-[0_0_20px_rgba(255,59,48,0.15)] glow">
                  <div className="relative w-24 h-6 overflow-hidden rounded-full bg-[#141414] border border-[#2A2A2A]">
                    <div className="absolute left-0 top-0 bottom-0 w-full bg-gradient-to-r from-[#FF3B30] to-[#B3271E] velo-sweep-slow shimmer" />
                  </div>
                  <div className="flex flex-col ml-4">
                    <span className="text-[#A1A1A1] text-xs font-medium">Velo is thinking</span>
                    <div className="flex gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] pulse" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] pulse" style={{ animationDelay: "200ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] pulse" style={{ animationDelay: "400ms" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                index={i}
                messages={messages}
                streaming={streaming}
                editIdx={editIdx}
                onCopy={copyText}
                onSpeak={speak}
                onEdit={(i: number, c: string) => { setEditIdx(i); setInput(c); }}
                onSend={(c: string) => send(c)}
                onRedo={(i: number) => redoMessage(i)}
                onRegenerate={regenerate}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-[#272727] p-4 shrink-0">
          <div className="w-full max-w-[90vw] mx-auto">
            <div className="relative rounded-2xl border border-[#272727] bg-[#141414] overflow-hidden focus-within:border-[#FF3B30]/40 transition-colors">
              {streaming && <div className="velo-pulse absolute inset-x-0 top-0 h-px bg-[#FF3B30]" />}
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!runSlash(input)) send(); } }} placeholder="Message Velo… ( / for commands )" rows={2} className="w-full bg-transparent px-4 py-3 text-sm resize-none outline-none text-[#E5E7E5] min-h-[52px]" />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 text-xs text-[#71717A]">
                  <label className="px-2 py-1 rounded-md border border-[#272727] flex items-center gap-1 cursor-pointer hover:bg-[#1A1A1A] transition-colors whitespace-nowrap">
                    <Paperclip size={11} /> attach
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.txt,.md,.js,.ts,.py,.json,.css,.html"
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        const filesWithPreview = await Promise.all(
                          files.map(async (f) => {
                            const isText = /\.(txt|md|js|ts|tsx|jsx|py|json|css|html|mdx|sh|bash|yaml|yml|toml|xml|csv)$/i.test(f.name);
                            let preview = "";
                            if (isText) {
                              preview = await f.text().catch(() => "");
                            }
                            return { ...f, preview };
                          })
                        );
                        setAttachments((prev) => [...prev, ...filesWithPreview]);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    />
                  </label>
                  <button onClick={() => setWebSearch((v) => !v)} title="Web search" className={`px-2 py-1 rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap ${webSearch ? "border-[#FF3B30] text-[#FF3B30] bg-[#FF3B30]/10" : "border-[#272727] text-[#71717A] hover:text-[#E5E7E5]"}`}>
                    <Globe size={11} /> {searching ? "Searching…" : "Web"} {webSearch && "✓"}
                  </button>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    title={isRecording ? "Stop recording" : "Voice input"}
                    className={`px-2 py-1 rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap ${isRecording ? "border-[#FF3B30] text-[#FF3B30] bg-[#FF3B30]/10 animate-pulse" : "border-[#272727] text-[#71717A] hover:text-[#E5E7E5]"}`}
                  >
                    <Mic size={11} /> {isRecording ? "Recording…" : "Voice"}
                  </button>
                  <button
                    onClick={() => setAutoRead(!autoRead)}
                    title="Auto-read responses"
                    className={`px-2 py-1 rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap ${autoRead ? "border-[#FF3B30] text-[#FF3B30] bg-[#FF3B30]/10" : "border-[#272727] text-[#71717A] hover:text-[#E5E7E5]"}`}
                  >
                    <Volume2 size={11} /> {autoRead ? "Auto-read ✓" : "Auto-read"}
                  </button>
                  <select
                    value={selectedVoice?.name || ""}
                    onChange={(e) => {
                      const voice = availableVoices.find((v) => v.name === e.target.value);
                      if (voice) setSelectedVoice(voice);
                    }}
                    className="px-2 py-1 rounded-md border border-[#272727] bg-[#141414] text-[#71717A] text-xs outline-none focus:border-[#FF3B30] cursor-pointer max-w-[120px]"
                  >
                    {availableVoices.filter(v => v.lang.startsWith("en")).map((v) => (
                      <option key={v.name} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={voiceMode ? stopVoiceMode : startVoiceMode}
                    title="Voice mode (continuous conversation)"
                    className={`px-2 py-1 rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap ${voiceMode ? "border-[#FF3B30] text-[#FF3B30] bg-[#FF3B30]/10 animate-pulse" : "border-[#272727] text-[#71717A] hover:text-[#E5E7E5]"}`}
                  >
                    <Mic size={11} /> {voiceMode ? "Voice Mode On" : "Voice Mode"}
                  </button>
                  {currentConv && currentConv.versions.length > 1 && (
                    <span className="px-2 py-1 rounded-md border border-[#272727] flex items-center gap-1 whitespace-nowrap">
                      <button onClick={() => stepVersion(-1)} className="hover:text-[#E5E7E5]"><ChevronLeft size={12} /></button>
                      {currentConv.vi + 1}/{currentConv.versions.length}
                      <button onClick={() => stepVersion(1)} className="hover:text-[#E5E7E5]"><ChevronRight size={12} /></button>
                    </span>
                  )}
                  <span className="px-2 py-1 rounded-md border border-[#272727] whitespace-nowrap">{messages.length} msgs</span>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {streaming ? (
                    <button onClick={stop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#272727] text-sm hover:bg-[#242424] whitespace-nowrap"><Square size={14} /> Stop</button>
                  ) : (
                    <button onClick={() => { if (!runSlash(input)) send(); }} disabled={!input.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#FF3B30] bg-[#FF3B30] text-white text-sm font-medium disabled:opacity-40 disabled:border-[#FF3B30]/50 hover:bg-[#E0352B] hover:border-[#E0352B] active:scale-95 transition-transform whitespace-nowrap"><Send size={16} /> Send</button>
                  )}
                </div>
              {slash && slashCmds.length > 0 && (
                <div className="absolute bottom-full mb-2 left-3 right-3 rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] p-1 animate-in">
                  {slashCmds.map((s) => <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} className="w-full text-left px-2 py-1 rounded text-xs hover:bg-[#1F1F1F]">{s}</button>)}
                </div>
              )}
            </div>
              </div>
            </div>
            </div>
          </main>

      {cmdOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm" onClick={() => setCmdOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-[#2A2A2A] bg-[#111111] overflow-hidden shadow-2xl animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1F1F1F]">
              <Search size={14} className="text-[#6B6B6B]" />
              <input autoFocus value={cmdQuery} onChange={(e) => setCmdQuery(e.target.value)} placeholder="Type a command…" className="flex-1 bg-transparent outline-none text-sm" />
              <button onClick={() => setCmdOpen(false)} className="text-[#6B6B6B] hover:text-white"><X size={14} /></button>
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
              {filteredCmds.length === 0 && <div className="px-3 py-2 text-xs text-[#6B6B6B]">No commands</div>}
              {filteredCmds.map((c, i) => <button key={i} onClick={() => { c.action(); setCmdOpen(false); setCmdQuery(""); }} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[#1F1F1F]">{c.label}</button>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
