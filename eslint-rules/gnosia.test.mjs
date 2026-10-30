import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The house rules through the repository's own eslint.config.mjs, so each
 * case checks the rule and the files it is turned on for together. A snippet
 * is linted as if it sat at the path given; nothing is written to disk.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENT = "apps/web/src/components/Probe.tsx";
const KIT = "apps/web/src/components/ui/Probe.tsx";
const LIB = "apps/web/src/lib/probe.ts";

let eslint;
beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

/** The rules a snippet breaks, of those named, linted as `file`. */
async function broken(code, rule, file = COMPONENT) {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(`${file}: ${fatal.message}\n${code}`);
  return result.messages.filter((m) => m.ruleId === rule).map((m) => m.message);
}

/** Each `bad` snippet breaks `rule` at `file`, and each `good` one does not. */
function cases(rule, { bad = [], good = [], file = COMPONENT }) {
  it.each(bad.map((code) => [code]))(`${rule} catches %s`, async (code) => {
    expect(await broken(code, rule, file)).not.toEqual([]);
  });
  it.each(good.map((code) => [code]))(`${rule} lets through %s`, async (code) => {
    expect(await broken(code, rule, file)).toEqual([]);
  });
}

const jsx = (body) => `export const Probe = () => ${body};\n`;

describe("the kit's elements", () => {
  cases("gnosia/kit-select", { bad: [jsx("<select />")] });
  it("holds even the kit to the select rule", async () => {
    expect(await broken(jsx("<select />"), "gnosia/kit-select", KIT)).not.toEqual([]);
  });
  cases("gnosia/kit-dialog", { bad: [jsx("<dialog open />")], good: [jsx("<Dialog open />")] });
  it("lets the kit's Dialog draw a <dialog>", async () => {
    expect(await broken(jsx("<dialog open />"), "gnosia/kit-dialog", "apps/web/src/components/ui/Dialog.tsx")).toEqual([]);
  });
  cases("gnosia/kit-fields", {
    bad: [jsx("<datalist id='x' />"), jsx("<textarea\n  rows={3}\n/>"), jsx('<input\n  onChange={() => {}}\n  type="checkbox"\n/>')],
    good: [jsx('<input type="text" />'), jsx("<Textarea rows={3} />")],
  });
  it("lets components/ui draw the fields", async () => {
    expect(await broken(jsx("<textarea />"), "gnosia/kit-fields", KIT)).toEqual([]);
  });
  cases("gnosia/kit-details", { bad: [jsx("<details><summary>Menu</summary></details>")] });
  it("lets a named fold of text be a <details>", async () => {
    expect(await broken(jsx("<details />"), "gnosia/kit-details", "apps/web/src/components/workspace/NoteDisclosure.tsx")).toEqual([]);
  });
  cases("gnosia/kit-roles", {
    bad: [
      jsx('<div role="radiogroup" />'),
      jsx('<button role="radio" />'),
      jsx('<div role="tablist" />'),
      jsx('<button role="tab" id="x" />'),
      jsx('<div role={"tab"} />'),
      jsx('<button role={wide ? "group" : "radio"} />'),
      "export const props = { role: 'tablist' };",
      jsx("<div role={`tablist`} />"),
      "export const props = { role: `radio` };",
    ],
    good: [jsx("<div role={`tabpanel`} />"), jsx('<div role="tabpanel" />'), jsx('<div role={wide ? undefined : "tabpanel"} />'), "export const p = { id, role: 'tabpanel' };", jsx('<div role="group" />')],
  });
  cases("gnosia/kit-popover", { bad: [jsx('<div popover="auto" />'), "export const open = (el) => el.showPopover();"] });
  cases("gnosia/kit-menu-box", {
    bad: ['export const BOX = "rounded-2xl border-2 border-border bg-surface p-1.5 shadow";'],
    good: ['export const BOX = "rounded-2xl border-2 bg-surface p-2";'],
  });
  cases("gnosia/kit-menu-panel", {
    bad: [jsx('<ul role="listbox" className="rounded-xl" />'), jsx('<div role="menu" />')],
    good: [`import { MENU_PANEL } from "@/components/ui/classes";\n${jsx('<div role="menu" className={MENU_PANEL} />')}`],
  });
  cases("gnosia/kit-focus-ring", {
    bad: [
      'const RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";\nexport { RING };',
      "const RING = `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;\nexport { RING };",
    ],
  });
  cases("gnosia/kit-text-link", {
    bad: [jsx('<a className="text-accent-text font-semibold hover:underline" />')],
    good: [jsx('<a className="text-accent-text" />')],
  });
  cases("gnosia/kit-glyph", {
    bad: [jsx('<path d="M5 5l10 10M15 5L5 15" />'), jsx('<path d="M3.5 5.5h13M3.5 10h13" />')],
    good: [jsx('<path d="M4 10h12" />')],
  });
  it("draws the field pieces' marks with Glyph", async () => {
    expect(await broken(jsx("<svg />"), "gnosia/kit-no-svg", "apps/web/src/components/ui/Checkbox.tsx")).not.toEqual([]);
    expect(await broken(jsx("<svg />"), "gnosia/kit-no-svg", KIT)).toEqual([]);
  });
  cases("gnosia/kit-collapse-padding", {
    bad: [jsx('<Collapse open={n > 0} className="pt-8" />'), jsx('<Reveal open={a} className={cx("md:px-3", b)} />')],
    good: [jsx('<Collapse open={n > 0} className="min-w-0" />'), jsx('<Collapse open={open}><p className="pt-4" /></Collapse>')],
  });
  cases("gnosia/kit-card", { bad: ['export const C = "rounded-[20px] border-2 border-border bg-surface p-5";'] });
  cases("gnosia/kit-typing-dots", {
    bad: ["export const dot = (at) => ({ animationDelay: `${at * 180}ms` });"],
    good: ["export const dot = (at) => ({ animationDelay: `${at * 90}ms` });"],
  });
  cases("gnosia/kit-warn-box", {
    bad: [
      jsx('<p className={cx("rounded-xl px-4", ok ? "bg-ok-tint" : "bg-warn-tint")}>no</p>'),
      jsx('<p className="rounded-lg bg-warn-tint p-3">no</p>'),
      'export const BOX = "rounded-md bg-warn-tint p-3";',
      "export const BOX = `rounded-md bg-warn-tint p-3`;",
    ],
    good: [jsx('<span className="rounded-full bg-warn-tint px-3" />'), jsx('<button className="inline-flex h-7 rounded-md bg-warn-tint px-2" />')],
  });
});

describe("the browser's confirm()", () => {
  const confirms = async (code) =>
    [
      ...(await broken(code, "no-restricted-globals", LIB)),
      ...(await broken(code, "gnosia/kit-confirm", LIB)),
    ].length;

  it("is caught bare, through window, and through a chain of globals", async () => {
    expect(await confirms('export function drop() { if (confirm("Sure?")) return 1; }')).toBe(1);
    expect(await confirms("export const go = () => window.confirm('Sure?');")).toBe(1);
    expect(await confirms("globalThis.window.confirm('Sure?');")).toBe(1);
    expect(await confirms("export const go = () => self.confirm('Sure?');")).toBe(1);
    // Every read, not only a dotted call (Greptile on #556).
    expect(await confirms('export const go = () => window["confirm"]("Sure?");')).toBe(1);
    expect(await confirms('export const go = () => window.confirm.call(window, "Sure?");')).toBe(1);
  });

  it("is told from a confirm of the file's own", async () => {
    expect(await confirms("export function save(confirm: (x: number) => boolean) { return confirm(1); }")).toBe(0);
    expect(await confirms("declare const dialog: { confirm(x: string): void };\ndialog.confirm('Sure?');")).toBe(0);
    expect(await confirms("declare const api: { window: { confirm(x: string): void } };\napi.window.confirm('Sure?');")).toBe(0);
    expect(await confirms("declare const helpers: { confirm(n: number): void };\nconst { confirm } = helpers;\nconfirm(2);")).toBe(0);
    // A parameter named window is the caller's, not the browser's (Greptile on #556).
    expect(await confirms("type Api = { confirm(n: number): void; self: Api };\nexport function f(window: Api) { window.confirm(1); return window.self.confirm(2); }")).toBe(0);
  });
});

describe("class lists", () => {
  cases("gnosia/cx-only", {
    bad: [
      jsx("<p className={`p-2 ${b}`} />"),
      jsx('<p className={"p-2 " + b} />'),
      jsx('<p className={["p-2", b].join(" ")} />'),
      jsx("<Frame idleClassName={`p-2 ${b}`} />"),
      "export const f = buttonClasses({ className: `p-2 ${b}` });",
      "const layer = `p-2 ${blur}`;\nexport const g = <img className={cx(layer, h)} />;",
      "const shared = `p-2 ${tight}`;\nexport const i = <ul className={shared} />;",
      jsx('<p className={selected ? `ring-2 ${tone}` : "ring-0"} />'),
      jsx("<p className={open && `p-2 ${b}`} />"),
      jsx('<p className={given ?? "p-2 " + b} />'),
      "const tinted = `ring-2 ${tone}`;\nexport const m = <p className={decorate(tinted)} />;",
      'const padded = `p-2 ${size}`;\nexport const n = <a className={buttonClasses({ variant: "ghost", className: padded })} />;',
    ],
    good: [
      jsx('<p className={cx("p-2", b && "p-4", c)} />'),
      jsx("<p className={NOTE} />"),
      jsx("<p className={`p-2 text-text2`} />"),
      jsx("<a href={`/learn/${slug}`} aria-label={`Open ${title}`} />"),
      'const label = `${count} notes`;\nexport const g = <p className={cx("p-2")}>{label}</p>;',
      jsx('<p className={open ? "p-2" : NOTE} />'),
      jsx('<p className={given ?? "p-2"} />'),
      'const resume = `${order}. ${title}`;\nexport const j = <a className={cx(resume === null ? ROW : ROW_TWO_LINE, resume !== null && "h-9")} title={resume} />;',
      "export function F({ className: given = `p-${n}` }) { return <p className={cx(given)} />; }",
    ],
  });
});

describe("type", () => {
  cases("gnosia/type-size", {
    bad: [
      jsx('<span className="text-[11px]" />'),
      jsx('<span className="md:text-[10.5px]" />'),
      jsx('<span className="text-[0.625rem]" />'),
      'export const css = "a { font-size: 11px; }";',
      'export const css = "a { font-size: 0.625rem; }";',
      jsx("<text fontSize={11} />"),
      jsx("<text fontSize={Math.min(11, size)} />"),
      jsx("<text fontSize={11 - 1} />"),
      jsx("<p style={{ fontSize: big ? 14 : 10 }} />"),
      "export const f = (compact: boolean) => { const fontSize = compact ? 12 : 11.5; return fontSize; };",
    ],
    good: [
      'export const css = "a { font-size: 0.875rem; }";',
      jsx('<span className="text-[12px] text-[1.0625rem] text-[0.8em]" />'),
      jsx("<p style={{ fontSize: Math.max(12, Math.round(size * 0.3)) }} />"),
      jsx("<text fontSize={12.5} />"),
      jsx("<text fontSize={Math.max(12, size - 2)} />"),
      jsx("<text fontSize={size - 2} />"),
      "/** no `text-[10px]` here */\n// nor text-[11px]\nexport const x = 1;",
    ],
  });
  it("lets the public site draw to its own scale", async () => {
    expect(await broken(jsx('<span className="text-[11px]" />'), "gnosia/type-size", "apps/web/src/app/(site)/probe.tsx")).toEqual([]);
  });
  it("lets the workspace graph's one allowed size through, and only it", async () => {
    const graph = "apps/web/src/components/ConceptGraph.tsx";
    const allowed = "export const f = (compact: boolean) => { const fontSize = compact ? 12 : 11.5; return fontSize; };";
    expect(await broken(allowed, "gnosia/type-size", graph)).toEqual([]);
    expect(await broken(`${allowed}\n${jsx('<span className="text-[10px]" />')}`, "gnosia/type-size", graph)).toHaveLength(1);
    expect(await broken("export const x = 1;", "gnosia/type-size", graph)).toEqual([expect.stringContaining("matches nothing")]);
  });

  cases("gnosia/h1-role", {
    bad: [jsx('<h1 className="font-display text-[28px] font-bold">x</h1>')],
    good: [jsx('<h1 className={cx(PAGE_TITLE, "mb-3")}>x</h1>')],
  });
  it("counts a file's allowed <h1>s exactly", async () => {
    const review = "apps/web/src/components/review/ReviewSession.tsx";
    expect(await broken(jsx("<h1>x</h1>"), "gnosia/h1-role", review)).toEqual([]);
    expect(await broken(jsx("<><h1>x</h1><h1>y</h1></>"), "gnosia/h1-role", review)).toHaveLength(1);
    expect(await broken("export const x = 1;", "gnosia/h1-role", review)).toEqual([expect.stringContaining("lower the allowance")]);
  });
});

describe("dialogs", () => {
  cases("gnosia/dialog-close-mark", {
    bad: [jsx("<button data-dialog-close />"), 'export const p = { "data-dialog-close": "" };', 'export const f = (el) => el.setAttribute("data-dialog-close", "");'],
    good: ['export const f = (el) => el.hasAttribute("data-dialog-close");'],
  });
  cases("gnosia/dialog-header", {
    bad: [
      jsx('<Dialog open><IconButton onClick={() => close()} label="Close" /></Dialog>'),
      jsx("<Dialog open><IconButton label={'Close'} size=\"sm\" /></Dialog>"),
      jsx('<Dialog open><button type="button" aria-label="Close" onClick={close} /></Dialog>'),
      jsx('<header><DialogHeader title="x" onClose={close} /><IconButton label="Close" /></header>'),
    ],
    good: [
      jsx('<Dialog open><DialogHeader title="Settings" onClose={close} /></Dialog>'),
      jsx('<Dialog open><IconButton label="Expand" /><span title="Close" /></Dialog>'),
      jsx('<IconButton label="Close" />'),
    ],
  });
});

describe("one place for each question", () => {
  cases("gnosia/ime", {
    bad: ["export const f = (e: KeyboardEvent) => e.isComposing;", "export const f = (e: KeyboardEvent) => e.keyCode === 229;"],
    good: ["export const f = (editor: { isComposing(): boolean }) => editor.isComposing();"],
  });
  it("moves a tab row by tabKeyIndex", async () => {
    const code = "export const next = (i: number, n: number) => (i + 1) % n;";
    expect(await broken(code, "gnosia/roving-keys", "apps/web/src/components/ui/TabList.tsx")).not.toEqual([]);
    expect(await broken(code, "gnosia/roving-keys", KIT)).toEqual([]);
  });
  cases("gnosia/save-status", {
    bad: [
      `import { LiveStatus } from "@/components/ui/LiveStatus";\nexport const S = ({ save }) => <LiveStatus tone={save.kind === "error" ? "danger" : "muted"} />;`,
      `import { FormRow } from "@/components/ui/FormRow";\nexport function tone(kind: string) { switch (kind) { case "saved": return { tone: "ok", text: "Saved" }; default: return null; } }`,
    ],
    good: [`export const tone = (save) => (save.kind === "error" ? "danger" : "ok");`],
  });
  cases("gnosia/image-reveal", {
    bad: [
      "export const f = (img: HTMLImageElement) => img.complete;",
      "export const f = (ref: { current: HTMLImageElement }) => ref.current.complete;",
      "export const f = (el: HTMLImageElement) => el.complete && el.naturalWidth > 0;",
      "export const f = (props: { posterEl: HTMLImageElement }) => props.posterEl.complete;",
    ],
    good: ["export const f = (job: { complete: boolean }) => job.complete;"],
  });
  cases("gnosia/plain-click", {
    bad: [
      "export const f = (e: MouseEvent) => e.button !== 0 || e.metaKey || e.ctrlKey;",
      "export const f = (e: MouseEvent) => e.metaKey || e.button === 1;",
    ],
    good: ["export const f = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;"],
  });
  cases("gnosia/motion", {
    bad: [
      'export const q = "(prefers-reduced-motion: reduce)";',
      'export const f = (el: Element) => el.scrollIntoView({ behavior: "smooth" });',
      'export const f = (still: boolean) => (still ? "auto" : "smooth");',
      "export function reducedMotion() { return false; }",
    ],
    good: ["export const f = (el: Element) => el.scrollIntoView({ behavior: scrollBehavior() });"],
    file: LIB,
  });
  cases("gnosia/client-cookie", {
    bad: ['export const f = () => { document.cookie = "a=1"; };'],
    good: ["export const f = () => document.cookie.split(';');"],
    file: LIB,
  });
  it("logs nothing from send-json", async () => {
    expect(await broken("export const f = () => console.log(1);", "no-console", "apps/web/src/lib/send-json.ts")).not.toEqual([]);
  });
  it("reads a slug-keyed record through ownValue", async () => {
    const file = "apps/web/src/app/(app)/library/[id]/page.tsx";
    expect(await broken("export const f = (notes: Record<string, string>, slug: string) => notes[slug];", "gnosia/own-key", file)).not.toEqual([]);
    expect(await broken("export const f = (notes: Record<string, string>, slug: string) => notes?.[slug];", "gnosia/own-key", file)).not.toEqual([]);
    expect(await broken("export const f = (notes: string[]) => notes[0];", "gnosia/own-key", file)).toEqual([]);
    expect(await broken("export const f = (other: Record<string, string>, slug: string) => other[slug];", "gnosia/own-key", file)).toEqual([]);
  });
});

describe("the studio", () => {
  const STUDIO = "apps/web/src/components/studio/Probe.tsx";
  cases("gnosia/studio-job-state", {
    bad: [jsx("<p>{job.state}</p>"), jsx("<p>{row.state}</p>")],
    good: [jsx("<p>{jobStateLabel(job.state)}</p>"), jsx('<p data-state={job.state}>{job.state === "running" ? "Busy" : null}</p>')],
    file: STUDIO,
  });
  cases("gnosia/studio-kit", {
    bad: [
      "export function Button() { return null; }",
      "export const ChipLink = () => null;",
      'export { Chip, Thing as ButtonLink } from "./x";',
      'export const C = "pointer-events-auto inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface px-2 text-xs";',
      "export const C = `inline-flex h-6 items-center rounded-md border px-2`;",
    ],
    good: [
      "// export function Button() {}\nexport function VideoChangeButton() { return null; }",
      'export const ROW = "relative flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-xs";',
      'export const THUMB = "flex h-6 w-12 shrink-0 items-center rounded border border-border";',
    ],
    file: STUDIO,
  });
  it("gates every studio entry point first", async () => {
    const page = "apps/web/src/app/(app)/studio/probe/page.tsx";
    const gated = 'import { requireStudio } from "@/lib/studio";\nexport default async function P() { requireStudio(); return null; }';
    expect(await broken(gated, "gnosia/studio-gate", page)).toEqual([]);
    expect(await broken('import { requireStudio } from "@/lib/studio";\nexport default async function P() { await x(); requireStudio(); return null; }', "gnosia/studio-gate", page)).toHaveLength(1);
    expect(await broken(`${gated}\nexport async function generateMetadata() { return {}; }`, "gnosia/studio-gate", page)).toHaveLength(1);
    expect(await broken('export { default } from "./other";', "gnosia/studio-gate", page)).not.toEqual([]);
    const actions = "apps/web/src/app/(app)/studio/actions.ts";
    expect(await broken('"use server";\nexport async function a() { requireStudio(); }\nexport const b = async () => 1;', "gnosia/studio-gate", actions)).toHaveLength(1);
    const route = "apps/web/src/app/(app)/studio/x/[y]/route.ts";
    expect(await broken("export async function GET() { return new Response(); }", "gnosia/studio-gate", route)).toHaveLength(1);
    // An export list is followed to each function it names (Greptile on #556).
    const mixed = 'import { requireStudio } from "@/lib/studio";\nexport async function GET() { requireStudio(); return new Response(); }\nasync function POST() { return new Response(); }\nconst PUT = async () => { requireStudio(); return new Response(); };\nexport { POST, PUT };';
    expect(await broken(mixed, "gnosia/studio-gate", route)).toEqual([expect.stringContaining("POST")]);
    expect(await broken('async function Page() { return null; }\nexport default Page;', "gnosia/studio-gate", page)).toHaveLength(1);
  });
  it("keeps TutorChat's first load free of the studio", async () => {
    const file = "apps/web/src/components/workspace/TutorChat.tsx";
    const rule = "@typescript-eslint/no-restricted-imports";
    expect(await broken('import type { TagKind } from "@/lib/studio-drafts";\nexport type T = TagKind;', rule, file)).toEqual([]);
    expect(await broken('import { tagKinds } from "@/lib/studio-drafts";\nexport const t = tagKinds;', rule, file)).not.toEqual([]);
    expect(await broken('import { inlinePieces } from "@/lib/mentions";\nexport const t = inlinePieces;', rule, file)).not.toEqual([]);
    expect(await broken('import type { Kit } from "./TutorStudioKit";\nexport type K = Kit;', rule, file)).not.toEqual([]);
    expect(await broken('import { readHealth } from "@/lib/tutor-studio";\nexport const r = readHealth;', rule, file)).toEqual([]);
  });
});

describe("theme tokens", () => {
  cases("gnosia/theme-tokens", {
    bad: [
      'export const c = "#f7f6f3";',
      jsx('<p className="bg-[#111]" />'),
      jsx('<p className="text-red-800 dark:text-red-200" />'),
      jsx('<p className="hover:text-red-600" />'),
      jsx('<p className="border-amber-300/60" />'),
      'export const shade = "red-600";',
      "export const tones = { warn: 'amber-500' };",
      "export const s = `0 0 0 rgb(0 0 0 / 0.3)`;",
      jsx('<p style={{ color: "hsl(10 20% 30%)" }} />'),
      jsx('<p className="text-[var(--muted)]" />'),
      "export const tone = 'var(--muted-strong)';",
      jsx('<p className="border-[var(--border)]" />'),
      jsx('<p className="hover:bg-[var(--surface2)]/60" />'),
    ],
    good: [
      "// the card in #206 and #1a2b3c\n/* bg-red-600 #fff */\nexport const x = 1;",
      jsx('<p className="bg-black/75 text-white" />'),
      jsx('<p className="bg-danger text-[var(--ok-on)] border-warn" />'),
      jsx('<p className="bg-diagram-matte text-text2 bg-surface-raised" />'),
      jsx('<input accept="image/*" />'),
      'export const id = "item-#12";',
      jsx('<p className="text-[color-mix(in_srgb,var(--tone)_55%,var(--text))] h-[var(--shell-row)]" />'),
    ],
  });
  it("leaves the brand pages and the familiars' pixel art their colours", async () => {
    expect(await broken('export const c = "#f7f6f3";', "gnosia/theme-tokens", "apps/web/src/app/(site)/page.tsx")).toEqual([]);
    expect(await broken('export const c = "#f7f6f3";', "gnosia/theme-tokens", "apps/web/src/components/avatar/sprites.ts")).toEqual([]);
    expect(await broken('export const c = "#f7f6f3";', "gnosia/theme-tokens", LIB)).toEqual([]);
  });
  it("still holds the brand pages and the pixel art to the token names (Greptile on #556)", async () => {
    for (const file of ["apps/web/src/app/(site)/page.tsx", "apps/web/src/components/avatar/sprites.ts"]) {
      expect(await broken('export const c = "text-[var(--muted)]";', "gnosia/theme-tokens", file)).not.toEqual([]);
      expect(await broken('export const c = "bg-[var(--surface2)]";', "gnosia/theme-tokens", file)).not.toEqual([]);
    }
  });
});

describe("sentence case", () => {
  cases("gnosia/sentence-case", {
    bad: [
      'export const c = "text-[11px] uppercase";',
      'export const c = "md:uppercase text-xs";',
      'export const c = "font-bold tracking-wide";',
      'export const c = "tracking-[0.05em] text-text3";',
      'export const c = "[text-transform:uppercase]";',
      jsx('<TutorMessage label="PLANNER" />'),
      jsx('<Input placeholder={"DESCRIBE IT"} />'),
      jsx('<img alt={wide ? "FULL WIDTH" : "Small"} />'),
      jsx("<nav aria-label={`MAIN MENU ${x}`} />"),
      jsx('<p>{"PLANNER"}</p>'),
      jsx("<p>WHAT YOU KNOW</p>"),
    ],
    good: [
      'export const c = "tracking-tight tracking-[-0.02em] text-balance not-uppercased-slug";',
      jsx('<p title="SVG" aria-label="Export SVG" className="PLANNER">CS4263</p>'),
      jsx("<p>Planner</p>"),
    ],
  });
});

describe("a field's text", () => {
  cases("gnosia/field-text", {
    bad: [jsx('<input className="text-sm" />'), 'const local = "rounded text-xs";\nexport const A = () => <textarea className={local} />;'],
    good: [jsx('<input className="text-base" />'), jsx('<input type="checkbox" className="text-xs" />'), jsx('<p className="text-sm" />')],
  });
  it("follows a class imported one module away", async () => {
    // NOTE in components/ui/classes.ts is 12px: right for a note, wrong for a field.
    const code = 'import { NOTE } from "@/components/ui/classes";\nexport const A = () => <input className={NOTE} />;';
    expect(await broken(code, "gnosia/field-text")).toEqual([expect.stringContaining("text-[12px]")]);
  });
});
