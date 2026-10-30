import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";

import { GnosiaMascot, type MascotPose } from "@/components/brand/GnosiaMascot";
import { MARK_STAR } from "@/components/brand/GnosiaMark";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";

import banner from "../../../public/banner.png";
import { ProbeDemo } from "./ProbeDemo";
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
 * a signed-in one to `/home` before this renders). Laid out as a book: a
 * title page with one working probe, three chapters, a contents page with a
 * colophon, and the world art as the last page. A server component apart from
 * `ProbeDemo`; no data, no auth, CSS-only motion. Every claim on it maps to
 * something the product does today; the reasoning is in docs/design/BRAND.md.
 */
export default function LandingPage() {
  return (
    <div data-layout="site">
      <Hero />
      <Chapters />
      <Contents />
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
      className={cx(
        WRAP,
        "grid items-center gap-14 pt-6 pb-20 md:pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-14 lg:pb-32",
      )}
    >
      <div className="text-center lg:text-left">
        <h1
          id="hero-title"
          className="gnosia-rise mx-auto max-w-[12ch] font-book text-[48px] leading-[1.02] font-medium tracking-[-0.025em] text-balance text-brand-ink sm:text-[64px] lg:mx-0 lg:text-[84px]"
        >
          A book that <em className="font-normal text-brand-teal">grows</em> as you do.
        </h1>
        <p className="gnosia-rise gnosia-rise-2 mx-auto mt-7 max-w-[30rem] text-[18px] leading-relaxed text-pretty text-brand-mist md:text-[20px] lg:mx-0">
          Gnosia keeps a living model of what you know, concept by concept, and teaches you what comes next.
        </p>
        <div className="gnosia-rise gnosia-rise-3 mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-4 lg:justify-start">
          <Button variant="brand" href="/sign-in">
            Open your book
          </Button>
          <a
            href={GITHUB_URL}
            className={siteLink(
              "rounded-md text-[15px] font-semibold text-brand-ink underline decoration-brand-ink/25 underline-offset-[6px] hover:decoration-brand-teal",
            )}
          >
            Read the source
          </a>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[460px] pt-[84px] lg:pt-[108px]">
        {/* The mascot peeks over the top of the page it is asking from: it
            sits behind the card, which hides everything below its eyes. */}
        <div className="pointer-events-none absolute top-0 right-6 lg:right-10">
          <GnosiaMascot pose="curious" float preload className="h-[130px] lg:h-[165px]" />
        </div>
        <div className="relative">
          <ProbeDemo />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- chapters */

type Chapter = {
  n: string;
  name: string;
  title: string;
  body: string;
  panel: string;
  pose: MascotPose;
  art: ReactNode;
};

const CHAPTERS: Chapter[] = [
  {
    n: "one",
    name: "Probe",
    title: "It starts from what you already know.",
    body: "A few questions before any teaching, so your book begins with you rather than with page one. Every concept gets a probability that you know it, and every answer after that moves it.",
    panel: "gnosia-panel-teal",
    pose: "reading",
    art: <KnownArt />,
  },
  {
    n: "two",
    name: "Plan",
    title: "Next is whatever you are ready for.",
    body: "Concepts sit in a graph of prerequisites. When the ones underneath are known, the one above lights up. No fixed syllabus, just the next thing in reach.",
    panel: "gnosia-panel-gold",
    pose: "excited",
    art: <FrontierArt />,
  },
  {
    n: "three",
    name: "Review",
    title: "Reviews arrive just before you forget.",
    body: "Spaced review with four ratings. Remembered cards wait longer each time; the ones you keep missing come back sooner and get flagged. Sessions, reviews and the tutor all write back to the same book.",
    panel: "gnosia-panel-mist",
    pose: "happy",
    art: <ReviewArt />,
  },
];

function Chapters() {
  return (
    <div className="flex flex-col gap-20 py-10 md:gap-28 md:py-16">
      {CHAPTERS.map((c, i) => (
        <section
          key={c.n}
          aria-labelledby={`chapter-${c.n}`}
          className={cx(WRAP, "grid items-center gap-10 md:grid-cols-2 md:gap-14 lg:gap-20")}
        >
          <div className={cx("max-w-[34rem]", i % 2 === 1 && "md:order-2")}>
            <p className="flex items-baseline gap-3 text-brand-teal">
              <span className="font-book text-[20px] italic">Chapter {c.n}</span>
              <span aria-hidden className="h-px w-8 translate-y-[-5px] bg-brand-teal/40" />
              <span className="text-[15px] font-semibold">{c.name}</span>
            </p>
            <h2
              id={`chapter-${c.n}`}
              className="mt-4 font-book text-[34px] leading-[1.08] font-medium tracking-[-0.02em] text-balance text-brand-ink md:text-[46px]"
            >
              {c.title}
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-pretty text-brand-mist">{c.body}</p>
          </div>

          <div
            className={cx(
              c.panel,
              "relative flex min-h-[340px] items-center justify-center rounded-[32px] px-5 pt-12 pb-16 sm:px-6 md:min-h-[420px] md:px-10",
            )}
          >
            {c.art}
            {/* Hangs off the panel's outer bottom corner, half in the gap
                below, so it never lands on the art. */}
            <span className={cx("absolute -bottom-11 md:-bottom-12", i % 2 === 1 ? "left-5" : "right-5")}>
              <GnosiaMascot pose={c.pose} className="h-[92px] md:h-[104px]" />
            </span>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Chapter one: the estimates after a probe. */
function KnownArt() {
  const rows = [
    { name: "Dot product", p: 0.97 },
    { name: "Softmax", p: 0.91 },
    { name: "Query, key, value", p: 0.64 },
    { name: "Attention weights", p: 0.18 },
  ];
  return (
    <div aria-hidden className="gnosia-paper w-full max-w-[330px] rounded-[22px] p-5">
      <p className="text-[13px] font-medium text-brand-mist">What you know</p>
      <ul className="mt-4 flex flex-col gap-3.5">
        {rows.map((r) => (
          <li key={r.name} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3 text-[14px] text-brand-ink">
              <span className="truncate">{r.name}</span>
              <span className="text-[13px] font-medium text-brand-mist tabular-nums">{r.p.toFixed(2)}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-brand-ink/10">
              <span
                className={cx("block h-full rounded-full", r.p >= 0.5 ? "bg-brand-teal" : "bg-brand-ink/30")}
                style={{ width: `${r.p * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Chapter two: three known prerequisites light the next concept; the one past it waits. */
function FrontierArt() {
  const known = ["Dot product", "Softmax", "Query, key, value"];
  return (
    <div aria-hidden className="@container relative w-full max-w-[400px]">
      <svg viewBox="0 0 400 260" className="w-full overflow-visible" fill="none">
        {[40, 130, 220].map((y) => (
          <path
            key={y}
            d={`M160 ${y} C 196 ${y}, 196 130, 222 130`}
            className="stroke-brand-teal"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
        <path d="M310 152 L310 196" className="stroke-brand-ink/25" strokeWidth="2" strokeDasharray="4 5" />
      </svg>
      <ul className="absolute inset-0">
        {known.map((k, i) => (
          <li
            key={k}
            className="gnosia-paper absolute left-0 flex h-[13.8%] w-[40%] items-center gap-[2cqw] rounded-full px-[2.75cqw] text-[3.25cqw] font-medium whitespace-nowrap text-brand-ink"
            style={{ top: `${(8.5 + i * 34.6).toFixed(1)}%` }}
          >
            <span className="grid size-[4cqw] shrink-0 place-items-center rounded-full bg-brand-teal text-brand-cream dark:text-brand-navy">
              <svg viewBox="0 0 16 16" className="size-[2.5cqw]" fill="none">
                <path d="M4 8.5 7 11.5 12.5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="truncate">{k}</span>
          </li>
        ))}
        <li className="absolute top-[40.4%] left-[55.5%] flex h-[19.2%] w-[44.5%] items-center gap-[2cqw] rounded-[4cqw] border-2 border-brand-gold bg-[#fffdf8] px-[3cqw] text-[3.5cqw] font-semibold whitespace-nowrap text-brand-ink shadow-[0_12px_28px_-14px_color-mix(in_srgb,var(--brand-gold)_70%,transparent)] dark:bg-[color-mix(in_srgb,var(--brand-cream)_6%,var(--brand-navy))]">
          <StarGlyph className="size-[4cqw] shrink-0 text-brand-gold" />
          <span>Attention weights</span>
        </li>
        <li className="absolute top-[76%] left-[55.5%] flex h-[13.8%] w-[44.5%] items-center rounded-full border border-dashed border-brand-ink/25 px-[3cqw] text-[3.25cqw] whitespace-nowrap text-brand-mist">
          Multi-head attention
        </li>
      </ul>
    </div>
  );
}

/** Chapter three: a review card, answered, with the four ratings. */
function ReviewArt() {
  const ratings = ["Again", "Hard", "Good", "Easy"];
  return (
    <div aria-hidden className="w-full max-w-[340px]">
      <div className="gnosia-paper rounded-[22px] p-5">
        <p className="text-[13px] font-medium text-brand-mist">Review, 3 of 7</p>
        <p className="mt-3 font-book text-[19px] leading-snug font-medium text-brand-ink">
          Why divide the scores by the square root of the key size?
        </p>
        <p className="mt-3 border-t border-dashed border-brand-ink/15 pt-3 text-[14px] leading-snug text-brand-mist">
          So large dot products do not push softmax into a region with tiny gradients.
        </p>
        <div className="mt-5 grid grid-cols-4 gap-1.5">
          {ratings.map((r) => (
            <span
              key={r}
              className={cx(
                "rounded-xl py-2 text-center text-[12px] font-semibold",
                r === "Good"
                  ? "bg-brand-teal text-brand-cream shadow-[0_3px_0_var(--brand-navy)] dark:text-brand-navy dark:shadow-[0_3px_0_color-mix(in_srgb,var(--brand-teal)_50%,var(--brand-navy))]"
                  : "border border-brand-ink/12 text-brand-mist",
              )}
            >
              {r}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-center font-book text-[15px] text-brand-ink/80 italic">Good. See it again in 6 days.</p>
    </div>
  );
}

/* -------------------------------------------------------------- contents */

const CONTENTS = [
  {
    title: "Home",
    body: "Pick up where you left off: the module, the video, the concept. No schedule, no streak, no leagues.",
  },
  {
    title: "Courses as paths",
    body: "Ten computer science courses from NUS, each a path through one shared graph of concepts.",
  },
  {
    title: "A tutor that knows the page",
    body: "Ask about the concept you are on. The tutor knows what you already know and cites your own notes.",
  },
  {
    title: "Reviews at the right moment",
    body: "Again, Hard, Good, Easy. The cards you keep missing get flagged.",
  },
  {
    title: "A library that remembers",
    body: "Narrated animations, diagrams, notes, links and transcripts, tied to concepts, with what you have watched.",
  },
];

const ROMAN = ["i", "ii", "iii", "iv", "v"];

function Contents() {
  return (
    <section aria-labelledby="contents-title" className={cx(WRAP, "py-20 md:py-28")}>
      <div className="mx-auto max-w-[760px]">
        <h2
          id="contents-title"
          className="text-center font-book text-[40px] leading-none font-medium tracking-[-0.02em] text-brand-ink md:text-[56px]"
        >
          Contents
        </h2>
        <p className="mt-4 text-center font-book text-[17px] text-brand-mist italic">What is inside the book.</p>

        <ol className="mt-12 flex flex-col md:mt-14">
          {CONTENTS.map((c, i) => (
            <li key={c.title} className="grid grid-cols-[2.25rem_1fr] gap-x-3 border-t border-brand-ink/10 py-6 md:grid-cols-[3rem_1fr]">
              <span className="pt-1 font-book text-[18px] text-brand-teal italic">{ROMAN[i]}.</span>
              <div>
                <p className="font-book text-[21px] font-medium text-brand-ink md:text-[24px]">{c.title}</p>
                <p className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-brand-mist">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <Colophon />
      </div>
    </section>
  );
}

/** What a book's last page says: how it was made. Here, the mechanics under the model. */
function Colophon() {
  return (
    <aside aria-labelledby="colophon-title" className="mt-14 border-t border-brand-ink/10 pt-10 text-center md:mt-16">
      <StarGlyph className="mx-auto size-4 text-brand-gold" />
      <h2 id="colophon-title" className="mt-4 font-book text-[20px] font-medium text-brand-ink">
        Colophon
      </h2>
      <p className="mx-auto mt-4 max-w-[34rem] font-book text-[16px] leading-relaxed text-pretty text-brand-ink/85 italic">
        Gnosia keeps one probability per concept with Bayesian Knowledge Tracing, spaces reviews with SM-2, orders
        concepts in a prerequisite graph, and derives the notes and the model from an append-only event log. Set in
        Literata and Figtree. The{" "}
        <a
          href={GITHUB_URL}
          className={siteLink("rounded-sm text-brand-teal underline decoration-brand-teal/40 underline-offset-4 hover:decoration-brand-teal")}
        >
          source is open
        </a>
        .
      </p>
    </aside>
  );
}

/* --------------------------------------------------------------- closing */

/** The last page: the world art, full bleed, with the one call to action on it. */
function Closing() {
  return (
    // `dark` scopes the dark brand values to this band whatever the theme, so
    // the brand button is the lifted teal with a navy label on the night sky.
    <section aria-labelledby="closing-title" className="dark relative isolate overflow-hidden bg-[#0d1c2b]">
      {/* On a phone the art is a strip above the words; from md it fills the
          band and the words sit on its dark left side. */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[300px] sm:h-[420px] md:inset-y-0 md:h-auto">
        <Image src={banner} alt="" sizes="100vw" className="h-full w-full object-cover object-[72%_center]" />
        {/* Navy from the side the words sit on, so cream text always reads. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[#0d1c2b] via-[#0d1c2b]/20 via-40% to-transparent md:bg-gradient-to-r md:from-[#0d1c2b] md:from-10% md:via-[#0d1c2b]/45 md:via-40% md:to-transparent md:to-70%"
        />
      </div>
      <div className={cx(WRAP, "flex flex-col pt-[260px] pb-16 sm:pt-[380px] md:min-h-[640px] md:justify-center md:py-24")}>
        <div className="max-w-[30rem]">
          <p className="font-book text-[19px] text-[#e2b95e] italic">The next page</p>
          <h2
            id="closing-title"
            className="mt-3 font-book text-[40px] leading-[1.04] font-medium tracking-[-0.02em] text-balance text-[#faf6ec] md:text-[60px]"
          >
            Pick up where your book left off.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#faf6ec]/80">
            Sign in to pick up where you left off.
          </p>
          <div className="mt-9">
            <Button variant="brand" href="/sign-in">
              Open your book
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- pieces */

/** The mark's star on its own, for "this one is next" and the colophon. */
function StarGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="22 18 20 22" className={className} aria-hidden focusable="false">
      <path d={MARK_STAR} fill="currentColor" />
    </svg>
  );
}
