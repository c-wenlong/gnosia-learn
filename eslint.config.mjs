import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import gnosia from "./eslint-rules/gnosia.mjs";

/** The web app's own source: what the house rules below read. Tests may build anything they need to check it. */
const WEB = ["apps/web/src/**/*.ts", "apps/web/src/**/*.tsx"];
const WEB_IGNORES = ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"];
const ui = (file) => `apps/web/src/components/ui/${file}`;
const src = (file) => `apps/web/src/${file}`;

/**
 * The house rules (eslint-rules/gnosia.mjs), each with the files it allows and
 * why. They were unit tests that walked and grepped every source file; as lint
 * rules they read the parsed tree and report at the line.
 */
const houseRules = [
  {
    files: WEB,
    ignores: WEB_IGNORES,
    plugins: { gnosia },
    rules: {
      // A native <select> opens the platform's own menu; even the kit's Select draws its own.
      "gnosia/kit-select": "error",
      "gnosia/kit-menu-panel": "error",
      "gnosia/cx-only": "error",
      "gnosia/sentence-case": "error",
      "gnosia/field-text": "error",
      "gnosia/kit-confirm-chain": "error",
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Ask in place with ConfirmFold or InlineConfirm, never through the browser's confirm()." },
      ],
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis", "self"].map((object) => ({
          object,
          property: "confirm",
          message: "Ask in place with ConfirmFold or InlineConfirm, never through the browser's confirm().",
        })),
      ],
    },
  },
  {
    files: WEB,
    // components/ui is the kit, which draws these elements for everyone else.
    ignores: [...WEB_IGNORES, ui("**")],
    rules: { "gnosia/kit-fields": "error" },
  },
  {
    files: WEB,
    ignores: [
      ...WEB_IGNORES,
      // The kit's own Callout, Notice and Banner are the warn box.
      ui("**"),
      // Not yet on Callout: the tutor chat's notices and its recorded verdict,
      // ok or warn, which Callout has no ok tone for. Move one onto the kit and
      // take it off this list; never add to it.
      src("components/workspace/TutorChat.tsx"),
      src("components/workspace/VerdictRow.tsx"),
    ],
    rules: { "gnosia/kit-warn-box": "error" },
  },
  { files: WEB, ignores: [...WEB_IGNORES, ui("Dialog.tsx")], rules: { "gnosia/kit-dialog": "error" } },
  {
    files: WEB,
    // Folds of text, never menus: the studio's list of diagrams it could not
    // read, and a concept's note.
    ignores: [...WEB_IGNORES, src("app/(app)/studio/page.tsx"), src("components/workspace/NoteDisclosure.tsx")],
    rules: { "gnosia/kit-details": "error" },
  },
  {
    files: WEB,
    ignores: [...WEB_IGNORES, ui("SegmentedControl.tsx"), ui("TabList.tsx")],
    rules: { "gnosia/kit-roles": "error" },
  },
  { files: WEB, ignores: [...WEB_IGNORES, ui("Popover.tsx")], rules: { "gnosia/kit-popover": "error" } },
  {
    files: WEB,
    ignores: [...WEB_IGNORES, ui("classes.ts")],
    rules: {
      "gnosia/kit-menu-box": "error",
      "gnosia/kit-focus-ring": "error",
      "gnosia/kit-text-link": "error",
    },
  },
  {
    files: WEB,
    // Not cards: DomainBrowser's domain tile is a button with its own padding
    // and an accent border on hover, and the composer's box is a field's face
    // that shares the card's radius.
    ignores: [...WEB_IGNORES, ui("classes.ts"), src("components/learn/DomainBrowser.tsx"), ui("composer-keys.ts")],
    rules: { "gnosia/kit-card": "error" },
  },
  { files: WEB, ignores: [...WEB_IGNORES, ui("Glyph.tsx")], rules: { "gnosia/kit-glyph": "error" } },
  { files: [ui("Checkbox.tsx"), ui("SearchField.tsx"), ui("Combobox.tsx")], rules: { "gnosia/kit-no-svg": "error" } },
  { files: WEB, ignores: WEB_IGNORES, rules: { "gnosia/kit-collapse-padding": "error" } },
  { files: WEB, ignores: [...WEB_IGNORES, ui("TypingDots.tsx")], rules: { "gnosia/kit-typing-dots": "error" } },
  { files: WEB, ignores: [...WEB_IGNORES, ui("DialogHeader.tsx")], rules: { "gnosia/dialog-close-mark": "error", "gnosia/dialog-header": "error" } },
  { files: WEB, ignores: [...WEB_IGNORES, ui("composer-keys.ts")], rules: { "gnosia/ime": "error" } },
  { files: [ui("TabList.tsx"), ui("SegmentedControl.tsx")], rules: { "gnosia/roving-keys": "error" } },
  {
    files: WEB,
    // save-status.ts is the mapper.
    ignores: [...WEB_IGNORES, ui("save-status.ts")],
    rules: { "gnosia/save-status": "error" },
  },
  {
    files: WEB,
    // DiagramView keeps its own check, for a skeleton with three states;
    // use-asset-failure asks the opposite question, whether a complete
    // picture failed.
    ignores: [...WEB_IGNORES, ui("use-image-reveal.ts"), src("components/DiagramView.tsx"), src("components/use-asset-failure.ts")],
    rules: { "gnosia/image-reveal": "error" },
  },
  { files: WEB, ignores: [...WEB_IGNORES, src("lib/plain-click.ts")], rules: { "gnosia/plain-click": "error" } },
  { files: WEB, ignores: [...WEB_IGNORES, src("lib/motion.ts")], rules: { "gnosia/motion": "error" } },
  { files: WEB, ignores: [...WEB_IGNORES, src("lib/client-cookie.ts")], rules: { "gnosia/client-cookie": "error" } },
  // A send's body may hold a key, so the one door for JSON writes logs nothing.
  { files: [src("lib/send-json.ts")], rules: { "no-console": "error" } },
  // The public site is BRAND.md's, drawn to its own scale and colours, outside the app's roles and theme.
  { files: WEB, ignores: [...WEB_IGNORES, src("app/(site)/**")], rules: { "gnosia/type-size": "error", "gnosia/h1-role": "error" } },
  {
    files: [src("components/ConceptGraph.tsx")],
    rules: {
      // The workspace graph's SVG labels are drawn at layout size, and 11.5px
      // is what fits a 16-character line in a 112px column (D10 of
      // docs/proposals/domain-map.md).
      "gnosia/type-size": ["error", { allow: ["fontSize = compact ? 12 : 11.5"] }],
    },
  },
  // <h1>s that take none of the title roles, each on purpose (IMPLEMENTATION.md, "Type roles", exceptions).
  // The studio home's hero, What shall we make?, at 30 and 40px.
  { files: [src("app/(app)/studio/page.tsx")], rules: { "gnosia/h1-role": ["error", { allow: 1 }] } },
  // A session step's title, 20 and 28 from 768px, a focus title that changes every step.
  { files: [src("components/session/SessionFocus.tsx")], rules: { "gnosia/h1-role": ["error", { allow: 1 }] } },
  // Review's question, 20 and 24 from 768px; its close screen takes CLOSE_TITLE.
  { files: [src("components/review/ReviewSession.tsx")], rules: { "gnosia/h1-role": ["error", { allow: 1 }] } },
  // The watch page's title in the sans at 22 and 24 (#168), or a file name in mono.
  { files: [src("components/library/AssetTitle.tsx")], rules: { "gnosia/h1-role": ["error", { allow: 2 }] } },
  // A heading inside a note's own Markdown, sized with the prose.
  { files: [src("components/NoteProse.tsx")], rules: { "gnosia/h1-role": ["error", { allow: 1 }] } },
  {
    files: [src("components/**/*.{ts,tsx}"), src("app/**/*.{ts,tsx}")],
    ignores: [
      ...WEB_IGNORES,
      // The public brand pages draw the Gnosia brand in its own colours.
      src("app/(site)/**"),
      // Pixel art: each familiar is a grid of fixed colours, and its palette is the picture.
      src("components/avatar/sprites.ts"),
    ],
    rules: { "gnosia/theme-tokens": "error" },
  },
  // Records keyed by a slug someone else chose; ?topic= on /library reaches titles straight from the URL.
  { files: [src("app/(app)/library/page.tsx")], rules: { "gnosia/own-key": ["error", { names: ["titles", "concepts"] }] } },
  { files: [src("app/(app)/library/[[]id]/page.tsx")], rules: { "gnosia/own-key": ["error", { names: ["notes"] }] } },
  { files: [src("components/library/AssetTabs.tsx")], rules: { "gnosia/own-key": ["error", { names: ["titles"] }] } },
  { files: [src("lib/concept-workspace.ts")], rules: { "gnosia/own-key": ["error", { names: ["cards"] }] } },
  { files: [src("components/studio/**/*.tsx")], ignores: WEB_IGNORES, rules: { "gnosia/studio-job-state": "error" } },
  {
    files: [src("components/studio/**/*.{ts,tsx}"), src("app/(app)/studio/**/*.{ts,tsx}")],
    ignores: WEB_IGNORES,
    rules: { "gnosia/studio-kit": "error" },
  },
  {
    // Every file Next invokes on its own under the studio, and the server
    // actions, each export its own POST endpoint (D11).
    files: [
      src("app/(app)/studio/**/{page,layout,route,default,template}.{ts,tsx}"),
      src("app/(app)/studio/**/actions.ts"),
    ],
    rules: { "gnosia/studio-gate": "error" },
  },
  {
    // D68: a concept page without a studio pays only for TutorChat's own lines
    // and the loader. Anything of the studio's that TutorChat imports as a
    // value is on every concept page's first load, so it takes only types from
    // the studio, and the composer's chunk only through import().
    files: [src("components/workspace/TutorChat.tsx")],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/studio*", "@/components/studio/*", "**/MentionComposer", "@/lib/mentions"],
              allowTypeImports: true,
              message: "TutorChat takes only types from the studio and the composer (D68); load the rest through TutorStudioKit's import().",
            },
            { group: ["**/TutorStudioKit"], message: "TutorStudioKit is fetched with import() when the studio answers (D68), never imported." },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...houseRules,
  {
    // Next is not installed at the repo root any more; the app is a workspace
    // under apps/web. Without this, @next/eslint-plugin-next cannot find the
    // app directory and the rules that need to know where the routes live
    // (no-html-link-for-pages and friends) silently check nothing.
    // https://nextjs.org/docs/app/api-reference/config/eslint#specifying-a-root-directory-within-a-monorepo
    settings: { next: { rootDir: "apps/web/" } },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "out/**",
    "build/**",
    "**/next-env.d.ts",
    // Generated by `npm run test:coverage`; the HTML report ships its own JS.
    "coverage/**",
    // A git submodule with its own repo, tooling and (Python) code. Without
    // this, a local `npm run lint` walks its virtualenvs and reports 100k+
    // findings from third-party site-packages.
    "tools/manimkc/**",
    // Same reason, different toolchain: a git submodule with its own repo,
    // its own flat ESLint config and its own TypeScript projects. Linting it
    // from here would use the wrong config and walk its build output.
    "tools/tldrawkc/**",
    // The third submodule, remotionkc: its own repo, its own Remotion and
    // TypeScript setup, and a node_modules once installed.
    "tools/remotionkc/**",
    // The fourth, revideokc: its own repo, its own Revideo and TypeScript
    // setup, and a node_modules once installed.
    "tools/revideokc/**",
    // The fifth, blenderkc: its own repo, Python like manimkc, and a .venv
    // holding bpy once installed.
    "tools/blenderkc/**",
    // Symlinks into the design-systems library, another repo with its own
    // capture scripts and tooling (docs/design/reference/README.md). Locally
    // they resolve and would be linted with this repo's config; in CI they
    // dangle.
    "docs/design/reference/**",
    // The desktop app makes a git worktree per session under
    // .claude/worktrees/<name>/, each a full checkout with its own
    // node_modules and tools/tldrawkc/dist. Linting from the repo root walks
    // every one of them (9,400 findings in one run) for code that is not this
    // checkout's; each worktree lints itself.
    ".claude/worktrees/**",
    // The studio runner's home when STUDIO_HOME is the default: every video
    // job and doctor run there holds a synthetic checkout of a video tool
    // (revideokc's and remotionkc's lib/, src/ and tools/ copies), which is
    // the submodules' code, not this checkout's.
    ".studio/**",
    // apps/**, packages/** and services/** are deliberately NOT here. They are
    // npm workspaces in this repo, written in the same TypeScript by the same
    // people, so this config lints them correctly and should. (Their tsconfigs
    // are separate, for the opposite reason: type-checking, unlike linting,
    // needs the libs each one sets — DOM and JSX for the app, Node-only for
    // the rest.)
  ]),
]);

export default eslintConfig;
