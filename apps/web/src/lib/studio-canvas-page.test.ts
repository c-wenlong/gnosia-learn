import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/studio/d/<name>`, the canvas route: its title is gated and decoded the
 * way the page is (S2-08), its health, listing and jobs reads start together
 * (S2-21), and a job opens below 1024px too (S2-23).
 */

type Answer = { ok: true; data: unknown } | { ok: false; reason: "down" | "refused"; status: number | null; headline: string; detail: string };

interface Call {
  path: string;
  signal: AbortSignal | undefined;
  settle: (answer: Answer) => void;
}

const mocks = vi.hoisted(() => ({ calls: [] as unknown[], studioApi: vi.fn(), requireStudio: vi.fn(), openShot: vi.fn() }));
vi.mock("@/lib/studio", () => ({ studioApi: mocks.studioApi, requireStudio: mocks.requireStudio, openShot: mocks.openShot }));
vi.mock("@gnosia/tutor/server/time-zone", () => ({ appTimeZone: () => "America/New_York" }));
vi.mock("@/app/(app)/studio/actions", () => ({
  commitDiagram: vi.fn(),
  exportSvg: vi.fn(),
  inspectDiagram: vi.fn(),
  restartMirror: vi.fn(),
  verifySvg: vi.fn(),
}));

const page = await import("@/app/(app)/studio/d/[name]/page");
const CanvasPage = page.default;
const { JobPanel } = await import("@/components/studio/JobPanel");
const { DiagramInspector } = await import("@/components/studio/DiagramInspector");
const { SheetFocus } = await import("@/components/studio/SheetFocus");
const { BlockedCard } = await import("@/components/studio/StudioBlocked");

const calls = mocks.calls as Call[];

const healthy = { tldrawkc: true, postgres: true, stale: false, checks: [] };
const diagram = {
  name: "dot-product",
  title: "Dot product",
  topic: "vectors",
  svgState: "current",
  tldr: { path: "dot-product.tldr" },
};
const listing = { dir: "catalog", diagrams: [diagram], errors: [], counts: { total: 1, withTopic: 1, unreadable: 0 } };

beforeEach(() => {
  calls.length = 0;
  mocks.requireStudio.mockReset();
  mocks.studioApi.mockImplementation(
    (path: string, init?: { signal?: AbortSignal }) => new Promise<Answer>((settle) => calls.push({ path, signal: init?.signal, settle })),
  );
});

function answer(path: string, value: Answer): void {
  const call = calls.find((held) => held.path === path || held.path.startsWith(`${path}?`));
  if (!call) throw new Error(`the page never asked for ${path}`);
  call.settle(value);
}

function elements(node: ReactNode, into: { type: unknown; props: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach((child) => elements(child, into));
  else if (isValidElement(node)) {
    const element = node as unknown as { type: unknown; props: Record<string, unknown> };
    into.push(element);
    elements(element.props.children as ReactNode, into);
  }
  return into;
}

function start(query: Record<string, string> = {}): Promise<ReactNode> {
  return CanvasPage({ params: Promise.resolve({ name: "dot-product" }), searchParams: Promise.resolve(query) }) as Promise<ReactNode>;
}

/** Answers every call the page makes, as a healthy runner would, until it draws. */
async function drawn(query: Record<string, string> = {}, health: Record<string, unknown> = healthy): Promise<ReactNode> {
  const pending = start(query);
  await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
  answer("/api/health", { ok: true, data: health });
  answer("/api/diagrams", { ok: true, data: listing });
  answer("/api/jobs", { ok: true, data: { jobs: [] } });
  await vi.waitFor(() => expect(calls.some((call) => call.path === "/api/mirrors")).toBe(true));
  answer("/api/mirrors", { ok: true, data: { file: "dot-product.tldr", url: "http://127.0.0.1:9/", port: 9, healthy: true, note: "" } });
  await vi.waitFor(() => expect(calls.some((call) => call.path === "/api/diagrams/dot-product")).toBe(true));
  answer("/api/diagrams/dot-product", { ok: true, data: diagram });
  return pending;
}

describe("the canvas route's title (S2-08)", () => {
  it("is gated, and a malformed escape is not a 500", async () => {
    const metadata = await page.generateMetadata({ params: Promise.resolve({ name: "%E0%A4%A" }) });
    expect(metadata.title).toBe("%E0%A4%A · Studio");
    expect(mocks.requireStudio).toHaveBeenCalledTimes(1);
  });

  it("refuses before decoding anything on a deployment with no studio", async () => {
    mocks.requireStudio.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    await expect(page.generateMetadata({ params: Promise.resolve({ name: "x" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("the canvas route's reads (S2-21)", () => {
  it("asks for health, the listing and the jobs before any has answered", async () => {
    const pending = start();
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
    expect(calls.map((call) => call.path.split("?")[0]).sort()).toEqual(["/api/diagrams", "/api/health", "/api/jobs"]);
    answer("/api/health", { ok: false, reason: "down", status: null, headline: "down", detail: "" });
    await pending;
  });

  it("aborts the listing and the jobs when health blocks the screen", async () => {
    const pending = start();
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
    answer("/api/health", { ok: true, data: { ...healthy, tldrawkc: false } });
    const tree = await pending;
    expect(elements(tree).some((element) => element.type === BlockedCard)).toBe(true);
    expect(calls.filter((call) => call.path !== "/api/health").every((call) => call.signal?.aborted)).toBe(true);
  });
});

describe("the job panel on a small screen (S2-23)", () => {
  it("is a sheet below 1024px, with a way to close it, rather than hidden", async () => {
    const tree = await drawn({ job: "j1" });
    const aside = elements(tree).find((element) => element.type === "aside")!;
    expect(String(aside.props.className)).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(String(aside.props.className)).toContain("lg:block");
    const inside = elements(aside.props.children as ReactNode);
    expect(inside.some((element) => element.type === JobPanel)).toBe(true);
    expect(inside.some((element) => element.props.href === "/studio/d/dot-product")).toBe(true);
  });

  it("keeps the inspector beside the canvas from 1024px, and hidden below until asked", async () => {
    const tree = await drawn();
    const aside = elements(tree).find((element) => element.type === "aside")!;
    expect(String(aside.props.className)).toMatch(/(^|\s)hidden(\s|$)/);
    expect(elements(aside.props.children as ReactNode).some((element) => element.type === DiagramInspector)).toBe(true);
  });

  it("opens the inspector as a sheet with a Close below 1024px when asked (R2-1-23)", async () => {
    const tree = await drawn({ inspect: "1" });
    const aside = elements(tree).find((element) => element.type === "aside")!;
    expect(String(aside.props.className)).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(String(aside.props.className)).toContain("fixed");
    const sheet = elements(aside.props.children as ReactNode).find((element) => element.type === SheetFocus)!;
    expect(sheet.props.returnTo).toBe('button[aria-label="More actions"]');
    const inside = elements(sheet.props.children as ReactNode);
    expect(inside.some((element) => element.type === DiagramInspector)).toBe(true);
    expect(inside.some((element) => element.props.href === "/studio/d/dot-product")).toBe(true);
  });
});

describe("times on the canvas route (S2-11)", () => {
  it("prints a stale topic list's time in the app's zone, not the server's", async () => {
    const tree = await drawn({}, { ...healthy, vocabulary: { stale: true, readAt: "2026-10-30T02:05:00.000Z" } });
    const banner = elements(tree).find((element) => typeof element.props.children === "string" && element.props.children.includes("topic list is stale"));
    // 02:05 UTC is 22:05 the evening before in New York, the app's zone in this test.
    expect(String(banner?.props.children)).toContain("22:05");
  });
});

