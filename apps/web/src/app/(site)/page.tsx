import type { Metadata } from "next";
import type { ReactNode } from "react";

import { GnosiaMascot, MARK_STAR } from "@/components/brand";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";

import { GITHUB_URL, siteLink } from "./site";

export const metadata: Metadata = {
  // Absolute: the root layout's title template would otherwise append the
  // product name a second time.
  title: { absolute: "Gnosia" },
  description:
    "A book that grows as you do. A living personal knowledge system that learns what you know and teaches what comes next.",
};

/**
 * The landing page at `/`, for a visitor who is not signed in (proxy.ts sends
 * a signed-in one to `/today` before this renders). A plain server component:
 * no data, no auth, CSS-only motion. Every claim on it maps to something the
 * product does today; the list is in docs/design/BRAND.md.
 */
export default function LandingPage() {
  return (
    <div data-layout="site">
      <Hero />
      <HowItWorks />
      <Features />
      <BuiltOn />
      <Closing />
    </div>
  );
}

const WRAP = "mx-auto w-full max-w-[1200px] px-5 md:px-8";

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className={cx(WRAP, "grid items-center gap-4 pt-2 pb-20 md:pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pt-10 lg:pb-32")}
    >
      <div className="order-2 text-center lg:order-1 lg:text-left">
        <p className="gnosia-rise inline-flex items-center gap-2 rounded-full border border-brand-teal/20 bg-brand-teal/5 px-3.5 py-1.5 text-[12px] font-semibold tracking-[0.18em] text-brand-teal uppercase">
          <StarGlyph className="size-3.5 text-brand-gold" />
          A living knowledge system
        </p>
        <h1
          id="hero-title"
          className="gnosia-rise gnosia-rise-2 mx-auto mt-6 max-w-[11ch] text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance text-brand-ink sm:text-[60px] lg:mx-0 lg:text-[76px]"
        >
          A book that grows as you do.
        </h1>
        <p className="gnosia-rise gnosia-rise-3 mx-auto mt-6 max-w-[32rem] text-[17px] leading-relaxed text-pretty text-brand-mist md:text-[19px] lg:mx-0">
          Gnosia keeps a living model of what you know, concept by concept, and teaches you what comes next.
        </p>
        <div className="gnosia-rise gnosia-rise-3 mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
          <Button variant="brand" href="/sign-in">
            Open your book
          </Button>
          <OutlineLink href={GITHUB_URL}>See the source</OutlineLink>
        </div>
      </div>

      <div className="relative order-1 mx-auto flex w-full max-w-[540px] justify-center pt-2 lg:order-2 lg:pt-0">
        {/* A soft glow behind the mascot: warm on cream, cool on navy. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 size-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand-gold-soft)_55%,transparent),transparent)] lg:size-[560px] dark:bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand-teal)_22%,transparent),transparent)]"
        />
        <GnosiaMascot pose="neutral" float preload className="relative h-[200px] sm:h-[260px] lg:h-[400px]" />
        <KnownCard />
        <FrontierCard />
      </div>
    </section>
  );
}

/** A glimpse of the knowledge model: three concepts and how sure it is you know each. */
function KnownCard() {
  const rows = [
    { name: "Softmax", p: 0.96 },
    { name: "Dot product", p: 0.97 },
    { name: "Query, key, value", p: 0.81 },
  ];
  return (
    <div
      aria-hidden
      className="gnosia-glass absolute -right-[4%] -bottom-[16%] hidden w-[236px] rounded-[20px] p-4 xl:block"
    >
      <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-mist uppercase">What you know</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.name} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 text-[13px] text-brand-ink">
              <span className="truncate">{r.name}</span>
              <span className="font-mono text-[12px] text-brand-mist tabular-nums">{r.p.toFixed(2)}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-brand-ink/10">
              <span className="block h-full rounded-full bg-brand-teal" style={{ width: `${r.p * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A glimpse of the frontier: the next concept, ready because its prerequisites are. */
function FrontierCard() {
  return (
    <div
      aria-hidden
      className="gnosia-glass absolute top-[3%] -left-[8%] hidden w-[210px] rounded-[20px] p-4 xl:block"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-brand-mist uppercase">
        <StarGlyph className="size-3 text-brand-gold" />
        Next on your frontier
      </p>
      <p className="mt-2 text-[16px] font-semibold text-brand-ink">Attention weights</p>
      <p className="mt-1 text-[13px] leading-snug text-brand-mist">All three prerequisites are ready.</p>
    </div>
  );
}

/* ---------------------------------------------------------- how it works */

const STEPS = [
  {
    name: "Probe",
    title: "Find what you already know.",
    body: "A few questions before any teaching, so your book starts from you rather than from zero.",
  },
  {
    name: "Plan",
    title: "The frontier picks what comes next.",
    body: "Concepts sit in a prerequisite graph. Next is whatever you are ready for, never a fixed syllabus.",
  },
  {
    name: "Teach and Close",
    title: "Everything writes back.",
    body: "Sessions, reviews and the tutor each record evidence in the same model, and the book updates.",
  },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className={cx(WRAP, "py-16 md:py-24")}>
      <SectionHead id="how-title" eyebrow="How it works" title="Three steps, on repeat." />
      <ol className="relative mt-12 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-6">
        {/* The thread between the three markers, desktop only. */}
        <span
          aria-hidden
          className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-brand-gold/50 to-transparent md:block"
        />
        {STEPS.map((s, i) => (
          <li key={s.name} className="relative flex flex-col items-start gap-4 md:items-center md:text-center">
            <span className="gnosia-glass relative grid size-12 place-items-center rounded-full">
              <StarGlyph className="size-4 text-brand-gold" />
            </span>
            <div>
              <p className="text-[12px] font-semibold tracking-[0.18em] text-brand-teal uppercase">
                {String(i + 1).padStart(2, "0")} · {s.name}
              </p>
              <h3 className="mt-2 text-[21px] leading-tight font-semibold tracking-[-0.015em] text-brand-ink">
                {s.title}
              </h3>
              <p className="mt-2 max-w-[22rem] text-[15px] leading-relaxed text-brand-mist md:mx-auto">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------- features */

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "A model of what you know",
    body: "Every concept carries a probability that you know it, updated by each answer, review and tutor question.",
    icon: <path d="M3 19h18M5 16c2.5 0 3.5-9 7-9s4 5 7 5" />,
  },
  {
    title: "Reviews at the right moment",
    body: "Spaced review with four ratings: Again, Hard, Good, Easy. The cards you keep missing get flagged.",
    icon: (
      <>
        <rect x="4" y="7" width="13" height="13" rx="2.5" />
        <path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16" />
      </>
    ),
  },
  {
    title: "A tutor that knows the page",
    body: "Ask about the concept you are on. The tutor knows what you already know and cites your own notes.",
    icon: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />,
  },
  {
    title: "Courses as paths",
    body: "Ten computer science courses from NUS, each a path through one shared graph of concepts.",
    icon: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
      </>
    ),
  },
  {
    title: "A library that remembers",
    body: "Narrated animations, diagrams, notes, links and transcripts, tied to concepts, with what you have watched.",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m10.5 9.5 4 2.5-4 2.5Z" />
      </>
    ),
  },
  {
    title: "A calm Today",
    body: "Next up, reviews due, a forgiving streak and a target you set. No XP, no hearts, no leagues.",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </>
    ),
  },
];

function Features() {
  return (
    <section aria-labelledby="features-title" className={cx(WRAP, "py-16 md:py-24")}>
      <SectionHead id="features-title" eyebrow="Inside the book" title="Everything you learn, in one place that remembers." />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 md:mt-16 lg:grid-cols-3 lg:gap-5">
        {FEATURES.map((f) => (
          <li key={f.title} className="gnosia-glass group relative flex flex-col gap-4 rounded-[24px] p-6 md:p-7">
            <StarGlyph
              className="absolute top-6 right-6 size-3.5 text-brand-gold opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-teal/10 text-brand-teal">
              <svg
                viewBox="0 0 24 24"
                className="size-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {f.icon}
              </svg>
            </span>
            <div>
              <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-brand-ink">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-brand-mist">{f.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------- built on */

const MECHANICS = [
  { name: "Bayesian Knowledge Tracing", body: "A probability, per concept, that you know it." },
  { name: "SM-2 scheduling", body: "Review intervals that stretch as you remember." },
  { name: "A prerequisite graph", body: "Concepts in order, so the next one is always in reach." },
  { name: "An append-only event log", body: "Every answer kept. The notes and the model are derived from it." },
];

function BuiltOn() {
  return (
    <section aria-labelledby="built-title" className={cx(WRAP, "py-10 md:py-14")}>
      <div className="grid items-center gap-8 border-y border-brand-ink/10 py-8 md:grid-cols-[1fr_auto] md:gap-12 md:py-10">
        <div>
          <h2 id="built-title" className="text-[12px] font-semibold tracking-[0.18em] text-brand-mist uppercase">
            Built on
          </h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:gap-x-10">
            {MECHANICS.map((m) => (
              <li key={m.name}>
                <p className="text-[15px] font-semibold text-brand-ink">{m.name}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-brand-mist">{m.body}</p>
              </li>
            ))}
          </ul>
        </div>
        {/* Hidden on a phone, so the closing panel's mascot is the only one in view there. */}
        <GnosiaMascot pose="reading" className="hidden h-[150px] md:block lg:h-[160px]" />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- closing */

function Closing() {
  return (
    <section aria-labelledby="closing-title" className={cx(WRAP, "pt-10 pb-24 md:pt-14 md:pb-32")}>
      <div className="gnosia-glass relative overflow-hidden rounded-[32px] px-6 py-14 text-center md:px-12 md:py-20">
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand-gold-soft)_45%,transparent),transparent)] dark:bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--brand-teal)_22%,transparent),transparent)]"
        />
        <GnosiaMascot pose="curious" className="relative mx-auto h-[128px] md:h-[150px]" />
        <h2
          id="closing-title"
          className="relative mx-auto mt-6 max-w-[18ch] text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-brand-ink md:text-[48px]"
        >
          Pick up where your book left off.
        </h2>
        <p className="relative mx-auto mt-4 max-w-[30rem] text-[16px] leading-relaxed text-brand-mist md:text-[17px]">
          Sign in to see what is due today and what comes next.
        </p>
        <div className="relative mt-8 flex justify-center">
          <Button variant="brand" href="/sign-in">
            Open your book
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- pieces */

function SectionHead({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="max-w-[40rem]">
      <p className="text-[12px] font-semibold tracking-[0.18em] text-brand-teal uppercase">{eyebrow}</p>
      <h2
        id={id}
        className="mt-3 text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-brand-ink md:text-[44px]"
      >
        {title}
      </h2>
    </div>
  );
}

/** The outlined pill beside the brand button, for a link that leaves the site. */
function OutlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={siteLink(
        "mb-1 inline-flex h-11 items-center gap-2 rounded-full border border-brand-ink/20 px-6 text-[15px] font-semibold whitespace-nowrap text-brand-ink hover:border-brand-ink/40 hover:bg-brand-ink/5",
      )}
    >
      {children}
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M5 11 11 5M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/** The mark's star on its own, for markers and "insight" moments. */
function StarGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="22 18 20 22" className={className} aria-hidden focusable="false">
      <path d={MARK_STAR} fill="currentColor" />
    </svg>
  );
}
