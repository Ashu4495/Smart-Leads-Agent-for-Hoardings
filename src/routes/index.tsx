import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";

import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  Copy,
  Flame,
  Gauge,
  MapPin,
  Moon,
  NotebookPen,
  Save,
  Search,
  Snowflake,
  Sparkles,
  Sun,
  TrendingDown,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  buildPitch,
  fetchPitchFromAPI,
  fetchVacanciesFromAPI,
  fmtDate,
  getVacancies,
  hoardings,
  inr,
  type Lead,
  type Vacancy,
} from "@/lib/leads-api";
import { leadKey, useLeadStore } from "@/lib/lead-store";

const VacancyMap = lazy(() => import("@/components/VacancyMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Leads Agent — Hoarding Vacancy Cockpit" },
      {
        name: "description",
        content:
          "Detect upcoming hoarding vacancies, rank the best-fit customers with explicit reasons, and generate a personalised pitch with suggested pricing.",
      },
      { property: "og:title", content: "Smart Leads Agent — Hoarding Vacancy Cockpit" },
      {
        property: "og:description",
        content:
          "90-day vacancy pipeline for 300 billboards with ranked leads, why-reasons and AI-style pitch drafting.",
      },
    ],
  }),
  component: Cockpit,
});

function scoreTone(s: number) {
  if (s >= 70) return "text-success";
  if (s >= 50) return "text-primary";
  return "text-muted-foreground";
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
      }}
      className="panel p-4.5 hover-scale cursor-default transition-all duration-300 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <div className="rounded-lg bg-primary/10 p-2 text-primary border border-primary/20">
            <Icon className="size-4.5" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">{label}</span>
        </div>
      </div>
      <div className="mt-3.5 font-mono text-3xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </motion.div>
  );
}

function LeadCard({
  lead,
  rank,
  vacancy,
  onOpen,
  savedCount,
  hasNotes,
}: {
  lead: Lead;
  rank: number;
  vacancy: Vacancy;
  onOpen: () => void;
  savedCount: number;
  hasNotes: boolean;
}) {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-border/80 bg-surface/80 backdrop-blur-md p-4.5 hover-scale hover:shadow-2xl hover:border-primary/50 transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-extrabold tracking-wide uppercase ${
                rank === 1
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 glow-amber"
                  : rank === 2
                    ? "bg-slate-400/20 text-slate-200 border border-slate-400/40"
                    : "bg-orange-500/20 text-orange-300 border border-orange-500/40"
              }`}
            >
              {rank === 1 ? "🥇 #1 RANK" : rank === 2 ? "🥈 #2 RANK" : "🥉 #3 RANK"}
            </span>
            <span className="truncate font-bold text-base text-foreground">{lead.customer.name}</span>
            {lead.isIncumbent && (
              <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent border border-accent/30">
                INCUMBENT
              </span>
            )}
            {lead.coldRelationship && (
              <span className="inline-flex items-center gap-1 rounded bg-destructive/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive border border-destructive/30">
                <Snowflake className="size-3" /> COLD
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {lead.customer.industry} · {lead.customer.budgetBand} budget · {lead.customer.id}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono text-2xl font-bold tabular-nums ${scoreTone(lead.score)}`}>
            {lead.score}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">score</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${lead.score}%` }} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {lead.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <Check className="mt-0.5 size-3 shrink-0 text-accent" />
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="text-xs">
          <span className="text-muted-foreground">Suggested rate </span>
          <span className="font-mono font-semibold text-primary">{inr(lead.suggestedRate)}</span>
          <span className="text-muted-foreground">/mo</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <TrendingDown className="size-3" /> churn {Math.round(lead.churnRisk)}%
          </span>
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Sparkles className="size-3.5" /> Open lead
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-muted-foreground">
        <span>
          Vacancy on {vacancy.hoarding.id} opens {fmtDate(vacancy.freeFrom)}.
        </span>
        {savedCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <Save className="size-3" /> {savedCount} saved
          </span>
        )}
        {hasNotes && (
          <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            <NotebookPen className="size-3" /> notes
          </span>
        )}
      </div>
    </motion.div>
  );
}

function LeadDrawer({
  vacancy,
  lead,
  onClose,
  store,
}: {
  vacancy: Vacancy;
  lead: Lead;
  onClose: () => void;
  store: ReturnType<typeof useLeadStore>;
}) {
  const key = leadKey(vacancy.hoarding.id, lead.customer.id);
  const record = store.getRecord(key);
  const [copied, setCopied] = useState(false);
  const [pitch, setPitch] = useState(() => buildPitch(vacancy, lead));
  const [whySummary, setWhySummary] = useState<string | null>(null);
  const [loadingPitch, setLoadingPitch] = useState(false);
  const [notes, setNotes] = useState(record.notes);
  const [notesSaved, setNotesSaved] = useState(false);

  const loadPitch = useCallback(async () => {
    setLoadingPitch(true);
    try {
      const res = await fetchPitchFromAPI(vacancy.hoarding.id, lead.customer.id);
      if (res && res.pitch_text) {
        setPitch(res.pitch_text);
        if (res.why_summary) setWhySummary(res.why_summary);
      }
    } catch (err) {
      console.error("Failed to load pitch from API:", err);
    } finally {
      setLoadingPitch(false);
    }
  }, [vacancy.hoarding.id, lead.customer.id]);

  useEffect(() => {
    loadPitch();
  }, [loadPitch]);

  useEffect(() => {
    setNotes(store.getRecord(key).notes);
  }, [key, store.hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[1000] flex justify-end bg-background/70 backdrop-blur-sm"
    >
      <button aria-label="Close drawer" className="flex-1 cursor-default" onClick={onClose} />
      <motion.aside 
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="panel flex h-full w-full max-w-xl flex-col overflow-hidden rounded-none border-l"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-bold">{lead.customer.name}</h3>
              {lead.isIncumbent && (
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  INCUMBENT
                </span>
              )}
              {lead.coldRelationship && (
                <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                  <Snowflake className="size-3" /> COLD
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {lead.customer.industry} · {lead.customer.budgetBand} budget · {lead.customer.id} ·{" "}
              {vacancy.hoarding.id} free {fmtDate(vacancy.freeFrom)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border bg-surface-2/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</div>
              <div className={`font-mono text-xl font-bold ${scoreTone(lead.score)}`}>
                {lead.score}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-2/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Churn risk
              </div>
              <div className="font-mono text-xl font-bold text-destructive">
                {Math.round(lead.churnRisk)}%
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-2/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Suggested
              </div>
              <div className="font-mono text-xl font-bold text-primary">
                {inr(lead.suggestedRate)}
              </div>
            </div>
          </div>

          {whySummary && (
            <div className="rounded-md border border-primary/25 bg-primary/10 p-3.5 text-xs leading-relaxed text-foreground">
              <div className="font-semibold uppercase tracking-wider text-primary">Why This Lead (AI Summary)</div>
              <p className="mt-1 text-muted-foreground">{whySummary}</p>
            </div>
          )}

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Why this lead ranks here
            </h4>
            <ul className="mt-2 space-y-1.5">
              {lead.reasons.map((r) => (
                <li key={r} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-accent" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h4 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" /> Suggested pitch
              </h4>
              <div className="flex items-center gap-2">
                <button
                  disabled={loadingPitch}
                  onClick={loadPitch}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all"
                >
                  <Sparkles className={`size-3 text-primary ${loadingPitch ? "animate-spin" : ""}`} />
                  {loadingPitch ? "Generating..." : "Regenerate"}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(pitch);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Copy className="size-3" /> {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => store.savePitch(key, pitch)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground"
                >
                  <Save className="size-3" /> Save
                </button>
              </div>
            </div>
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              rows={14}
              className="mt-2 w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-ring"
            />
          </section>

          <section>
            <h4 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <NotebookPen className="size-3.5 text-accent" /> Internal notes
            </h4>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesSaved(false);
              }}
              onBlur={() => {
                store.setNotes(key, notes);
                setNotesSaved(true);
              }}
              rows={4}
              placeholder="Call outcomes, objections, decision maker, follow-up date…"
              className="mt-2 w-full resize-y rounded-md border border-input bg-background p-3 text-xs leading-relaxed outline-none placeholder:text-muted-foreground focus:border-ring"
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{notesSaved ? "Saved locally" : "Saves on blur"}</span>
              <button
                onClick={() => {
                  store.setNotes(key, notes);
                  setNotesSaved(true);
                }}
                className="rounded-md border border-input px-2 py-1 hover:text-foreground"
              >
                Save notes
              </button>
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Saved pitches ({record.pitches.length})
            </h4>
            {record.pitches.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No saved pitches yet — edit the draft above and hit Save.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {record.pitches.map((p) => (
                  <div
                    key={p.savedAt}
                    className="rounded-md border border-border bg-surface-2/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {new Date(p.savedAt).toLocaleString("en-IN")}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPitch(p.text)}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => store.removePitch(key, p.savedAt)}
                          aria-label="Delete saved pitch"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {p.text}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </motion.aside>
    </motion.div>
  );
}

function Cockpit() {
  const [windowDays, setWindowDays] = useState(90);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const store = useLeadStore();

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
      return "dark"; // Default to dark mode
    }
    return "dark";
  });

  // Apply theme class to document
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  const [vacancies, setVacancies] = useState<Vacancy[]>(() => getVacancies(windowDays));

  useEffect(() => {
    let active = true;
    fetchVacanciesFromAPI(windowDays).then((data) => {
      if (active && data && data.length > 0) {
        setVacancies(data);
      }
    });
    return () => {
      active = false;
    };
  }, [windowDays]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return vacancies;
    return vacancies.filter(
      (v) =>
        v.hoarding.id.toLowerCase().includes(s) ||
        v.hoarding.location.toLowerCase().includes(s) ||
        v.hoarding.area.toLowerCase().includes(s) ||
        v.leads.some((l) => l.customer.name.toLowerCase().includes(s)),
    );
  }, [vacancies, q]);

  // Reset to first page whenever the search or window changes.
  useEffect(() => {
    setPage(0);
  }, [q, windowDays]);

  const selected = filtered.find((v) => v.hoarding.id === selectedId) ?? filtered[0];

  const openLead = selected?.leads.find((l) => l.customer.id === openLeadId) ?? null;

  const atRisk = vacancies.reduce((s, v) => s + v.revenueAtRisk, 0);
  const urgent = vacancies.filter((v) => v.daysUntilFree <= 30).length;

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Activity className="size-5 text-primary animate-pulse" />
              Smart Leads Agent
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hoarding vacancy cockpit · <span className="font-semibold text-foreground">{vacancies.length}</span> sites under management
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex items-center justify-center rounded-md border border-input bg-surface-2 p-2 hover:bg-surface-2/80 transition-all hover:scale-105"
            >
              {theme === "dark" ? (
                <Sun className="size-4 text-warning" />
              ) : (
                <Moon className="size-4 text-primary" />
              )}
            </button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search site, area or customer"
                className="w-64 rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring transition-all"
              />
            </div>
            <div className="flex rounded-lg border border-primary/40 p-1 bg-surface-2 shadow-lg">
              {[30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setWindowDays(d)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                    windowDays === d
                      ? "bg-primary text-primary-foreground font-extrabold shadow-md scale-105"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6">
        <motion.section 
          initial="hidden" 
          animate="show" 
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.1 }
            }
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Stat
            icon={CalendarClock}
            label="Vacancies"
            value={String(vacancies.length)}
            sub={`falling free in next ${windowDays} days`}
          />
          <Stat
            icon={Flame}
            label="Urgent"
            value={String(urgent)}
            sub="free within 30 days — call now"
          />
          <Stat
            icon={Wallet}
            label="Revenue at risk"
            value={inr(atRisk)}
            sub="monthly card value of open slots"
          />
          <Stat
            icon={Gauge}
            label="Leads ranked"
            value={String(vacancies.length * 3)}
            sub="top-3 customers per vacant site"
          />
        </motion.section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="panel grid-lines overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Vacancy pipeline
              </span>
              <span className="text-[11px] text-muted-foreground">{filtered.length} sites</span>
            </div>
            <div className="max-h-[335px] overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted-foreground">No matching vacancies.</p>
              )}
              {filtered.map((v) => {
                const active = selected?.hoarding.id === v.hoarding.id;
                return (
                  <button
                    key={v.hoarding.id}
                    onClick={() => setSelectedId(v.hoarding.id)}
                    className={`flex h-[67px] w-full items-center gap-3 border-b border-border px-4 text-left transition-all duration-200 ${
                      active ? "bg-surface-2 font-medium" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <div
                      className={`w-12 shrink-0 rounded-md py-1.5 text-center font-mono text-sm font-bold tabular-nums transition-all ${
                        v.daysUntilFree <= 30
                          ? "bg-destructive/15 text-destructive"
                          : v.daysUntilFree <= 60
                            ? "bg-warning/15 text-warning"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {v.daysUntilFree}d
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{v.hoarding.location}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {v.hoarding.id} · free {fmtDate(v.freeFrom)} · {inr(v.revenueAtRisk)}/mo
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {selected ? (
              <>
                <div className="panel p-5 transition-all duration-300 hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <MapPin className="size-3.5" /> {selected.hoarding.area}
                      </div>
                      <h2 className="mt-1 text-xl font-bold">{selected.hoarding.location}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selected.hoarding.id} · {selected.hoarding.size} · traffic{" "}
                        {selected.hoarding.trafficScore}/100 · card rate{" "}
                        {inr(selected.hoarding.monthlyRate)}/mo
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-right">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Free from
                      </div>
                      <div className="font-mono text-sm font-semibold text-primary">
                        {fmtDate(selected.freeFrom)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
                    <Building2 className="size-3.5 shrink-0" />
                    Current booking {selected.lastBooking.id} ends{" "}
                    {fmtDate(selected.lastBooking.end)} · value {inr(selected.lastBooking.value)} ·
                    no renewal on file.
                  </div>
                </div>

                <ClientOnly
                  fallback={
                    <div className="panel h-[380px] animate-pulse bg-surface-2/40" />
                  }
                >
                  <Suspense
                    fallback={<div className="panel h-[380px] animate-pulse bg-surface-2/40" />}
                  >
                    <VacancyMap
                      vacancies={filtered}
                      selectedId={selected.hoarding.id}
                      onSelect={setSelectedId}
                      appTheme={theme}
                    />
                  </Suspense>
                </ClientOnly>

                <motion.div layout className="grid gap-4 xl:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                  {selected.leads.map((lead, i) => {
                    const rec = store.getRecord(leadKey(selected.hoarding.id, lead.customer.id));
                    return (
                      <LeadCard
                        key={lead.customer.id}
                        lead={lead}
                        rank={i + 1}
                        vacancy={selected}
                        savedCount={rec.pitches.length}
                        hasNotes={rec.notes.trim().length > 0}
                        onOpen={() => setOpenLeadId(lead.customer.id)}
                      />
                    );
                  })}
                  </AnimatePresence>
                </motion.div>
              </>
            ) : (
              <div className="panel p-8 text-sm text-muted-foreground">
                Select a vacancy to see its ranked leads.
              </div>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {selected && openLead && (
          <LeadDrawer
            vacancy={selected}
            lead={openLead}
            store={store}
            onClose={() => setOpenLeadId(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
