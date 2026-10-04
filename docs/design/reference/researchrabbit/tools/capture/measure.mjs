// Measures ResearchRabbit's signed-in components from the redacted static
// snapshots (~/.self-learn/researchrabbit-snapshots/<page>.html.gz), in every
// state CSS can still reach once scripts are gone.
//
//   PLAYWRIGHT=/path/to/playwright/index.mjs node tools/capture/measure.mjs [--only key,key] [page ...]
//
// SNAP_DIR may point at a directory that already holds the gunzipped
// snapshots (<name>.html + <name>.json); otherwise they are gunzipped from
// RR_SNAPSHOTS (default ~/.self-learn/researchrabbit-snapshots) into a
// temporary directory outside the repository and removed afterwards.
//
// Writes raw/components-computed.json (merged, so a subset of pages can be
// re-run; key order follows SPECS, not the run order) and one crop per
// component and state into components/crops/{component}-{state}.png at 2x,
// quantized to 256 colours. A crop wider than 1600px is halved first. A state
// whose pixels are identical to the default crop is not written again: its
// entry says `sameAsDefault`.
//
// A component is picked by its styled-components display name (the class
// `GraphControls__StyledButton-sc-abc123-1 geFTkD` is `GraphControls__StyledButton`),
// so a rebuild that changes the generated hashes does not break the kit.
// `generateVariantComponent__default` is one display name shared by many
// unrelated buttons, so those are found by their text or their position.
//
// States:
//   default        at rest, as captured
//   hover          real mouse hover, 450ms settle for transitions; the entry
//                  records whether :hover really matched (`hovered`)
//   focus-visible  keyboard: focus(), Shift+Tab, Tab, so Chromium's own
//                  :focus-visible heuristic sees a keyboard focus; the entry
//                  records `focus.ok` and `focus.matches`
//   <other>        another element or another snapshot that was captured in
//                  that state (a card tinted by a hover when the snapshot was
//                  taken, a tooltip, an open menu)
//
// Every click is preventDefault()ed and every navigation away from the file is
// aborted. The only network traffic allowed is Google Fonts (the app's two
// faces) and the app's own static image assets, so the crops show the cards'
// art; no request that could change anything is let through.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REF = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const RAW = path.join(REF, 'raw');
const CROPS = path.join(REF, 'components', 'crops');
const OUT_JSON = path.join(RAW, 'components-computed.json');
const ARCHIVE = (process.env.RR_SNAPSHOTS || '~/.self-learn/researchrabbit-snapshots').replace(/^~/, os.homedir());

const args = process.argv.slice(2);
const onlyArg = args.indexOf('--only');
const ONLY_KEYS = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;
const ONLY_PAGES = args.filter((a, i) => !a.startsWith('--') && (onlyArg < 0 || i !== onlyArg + 1));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// page key -> snapshot name
const PAGES = {
  sp: 'search-split-light-default',
  'sp-hover-input': 'search-split-light-hover-input',
  'sp-hover-result': 'search-split-light-hover-result',
  'sp-hover-list-card': 'search-split-light-hover-list-card',
  'sp-hover-legend-inputs': 'search-split-light-hover-legend-inputs',
  'sp-hover-legend-results': 'search-split-light-hover-legend-results',
  'sp-inspect': 'search-split-light-inspect-node',
  sm: 'search-map-light-default',
  'sm-zoom': 'search-map-light-zoomed-in',
  'sm-inspect': 'search-map-light-inspect-node',
  'sm-x': 'search-map-light-settings-x-axis',
  'sm-y': 'search-map-light-settings-y-axis',
  'sm-size': 'search-map-light-settings-size',
  'sm-adv': 'search-map-light-settings-advanced',
  'sm-filter': 'search-map-light-filter-popover',
  sl: 'search-list-light-default',
  lm: 'library-map-light-default',
  'lm-hover': 'library-map-light-hover',
  'lm-moved': 'library-map-light-positions-moved',
  'lm-reset': 'library-map-light-positions-reset-menu',
  ll: 'library-list-light-default',
  home: 'home-light-default',
};

// ---------------------------------------------------------------- specs
//
// A spec is one component; each target is where and in which states it is
// read. `find` is a JS expression run in the page with the helpers in __m;
// `as` names the state (or prefixes it, for hover and focus-visible);
// `hover` and `focus` default to the found element; `crop` is an expression
// for the element to photograph (default: the found element); `extra` is
// `(el) => ({...})` run in the page.

const ALL = ['default', 'hover', 'focus-visible'];
const D = ['default'];
const HOV = ['default', 'hover'];
const sc = (n, i = 0) => `__m.sc(${JSON.stringify(n)}, ${i})`;
const btn = (t, scope) => `__m.btn(${JSON.stringify(t)}${scope ? ', ' + scope : ''})`;
const at = (x, y, tag = 'button') => `__m.at(${x}, ${y}, ${JSON.stringify(tag)})`;
const T = (page, find, o = {}) => ({ page, find, ...o });
const sub = (o) => `(el) => __m.sub(el, ${JSON.stringify(o)})`;

const TOG = (st) => `[...document.querySelectorAll('[class*="LayoutSettingsGeneric__OptionContainer-sc-"] button')].find((b) => b.getAttribute('data-state') === '${st}')`;
const OPT_ALL = `[...document.querySelectorAll('[class*="LayoutSettingsGeneric__OptionContainer-sc-"]')]`;
const OPT_CHOSEN = `${OPT_ALL}.find((c) => getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)')`;
const OPT_OTHER = `${OPT_ALL}.find((c) => getComputedStyle(c).backgroundColor === 'rgba(0, 0, 0, 0)')`;

const GRAPH_PAGES = [
  ['sp', 'split-default'], ['sp-hover-input', 'split-hover-input'], ['sp-hover-result', 'split-hover-result'],
  ['sp-hover-list-card', 'split-hover-list-card'], ['sp-hover-legend-inputs', 'split-hover-legend-inputs'],
  ['sp-hover-legend-results', 'split-hover-legend-results'], ['sp-inspect', 'split-inspect-node'],
  ['sm', 'map-default'], ['sm-zoom', 'map-zoomed-in'], ['sm-inspect', 'map-inspect-node'], ['sm-x', 'map-settings-x-axis'],
  ['sm-y', 'map-settings-y-axis'], ['sm-size', 'map-settings-size'], ['sm-adv', 'map-settings-advanced'],
  ['sm-filter', 'map-filter-popover'], ['lm', 'library-default'], ['lm-hover', 'library-hover'],
  ['lm-moved', 'library-positions-moved'], ['lm-reset', 'library-positions-reset-menu'],
];

const SPECS = [
  // ============================================================ shell
  { key: 'page-ground', group: 'Shell and navigation', name: 'Page ground', desc: 'The pastel ground behind every signed-in page: a transparent full-page container holding three 1080px radial gradients (lavender fading through turquoise, lavender, peach), each anchored to a different corner. The colour under them is the body background.',
    targets: [T('sp', sc('GradientBackground__Container'), { states: D, crop: false, extra: `(el) => ({ body: __m.box(document.body), blobs: [...el.querySelectorAll('[class*="GradientBackground__Gradient-sc-"]')].map((g) => __m.box(g)) })` }),
      T('home', sc('GradientBackground__Container'), { as: 'home', states: D, crop: false })] },
  { key: 'nav-bar', group: 'Shell and navigation', name: 'Top bar', desc: 'The 64px bar over every signed-in page: wordmark at the left, Search and Library tabs, then the Upgrade pill, the workspace menu and the account button at the right. It paints nothing of its own; the page gradient shows through.',
    targets: [T('sp', sc('Navigation__Container'), { states: D, pad: 0, extra: `(el) => __m.kids(el, 'a, button, svg')` }),
      T('lm', sc('Navigation__Container'), { as: 'library', states: D, pad: 0 })] },
  { key: 'nav-logo', group: 'Shell and navigation', name: 'Wordmark link', desc: 'ResearchRabbit wordmark. The rabbit mark beside it only shows on the Library and Home pages (the width animates).',
    targets: [T('sp', sc('Navigation__LogoContainer'), { states: ALL, extra: `(el) => __m.sub(el, { wordmark: 'Navigation__StyledWordmark' })` }), T('lm', sc('Navigation__LogoContainer'), { as: 'with-mark', states: D })] },
  { key: 'nav-tab', group: 'Shell and navigation', name: 'Search and Library tabs', desc: 'Two text tabs. The current one sits in a white pill; the other is plain text.',
    targets: [T('sp', sc('Navigation__LinkContainer', 0), { as: 'current', states: ALL }), T('sp', sc('Navigation__LinkContainer', 1), { as: 'other', states: ALL })] },
  { key: 'nav-upgrade', group: 'Shell and navigation', name: 'Upgrade pill', desc: 'Green pill button in the top bar.',
    targets: [T('sp', sc('Navigation__NavButton'), { states: ALL })] },
  { key: 'nav-workspace', group: 'Shell and navigation', name: 'Workspace menu button', desc: 'Pill with the workspace name (redacted to "My workspace") and a chevron. The menu itself is not in the snapshots.',
    targets: [T('sp', btn('My workspace'), { states: ALL })] },
  { key: 'nav-avatar', group: 'Shell and navigation', name: 'Account button', desc: 'Round 32px button with a person icon.',
    targets: [T('sp', sc('generateVariantComponent__default', 1), { states: ALL })] },
  { key: 'session-bar', group: 'Shell and navigation', name: 'Search session bar', desc: 'Grey pill under the top bar with close, back, forward and the rabbit trail button.',
    targets: [T('sp', sc('ExploreSession__NavButtonsContainer'), { states: D, extra: `(el) => __m.kids(el, 'button')` })] },
  { key: 'session-bar-button', group: 'Shell and navigation', name: 'Search session bar button', desc: 'Close, back and forward buttons in the session bar.',
    targets: [T('sp', sc('ExploreSession__NavButton', 0), { as: 'close', states: ALL, crop: sc('ExploreSession__NavButtonsContainer') }), T('sp', sc('ExploreSession__NavButton', 1), { as: 'back', states: HOV, crop: sc('ExploreSession__NavButtonsContainer') }), T('sp', sc('RabbitTrail__RabbitContainer'), { as: 'rabbit', states: ALL, crop: sc('ExploreSession__NavButtonsContainer') })] },
  { key: 'main-card', group: 'Shell and navigation', name: 'Main card', desc: 'The 50% white card, rounded at the top corners only, that holds a solid white header strip and the list or graph, left of the right-hand panel.',
    targets: [T('sp', sc('Scaffold__Main'), { states: D, extra: `(el) => ({ header: __m.box(__m.sc('Scaffold__Header')), body: __m.box(__m.sc('Scaffold__Body')), actions: __m.box(__m.sc('Scaffold__Actions')), root: __m.box(__m.sc('Scaffold__Root')), content: __m.box(__m.sc('Scaffold__Content')) })` })] },
  { key: 'side-panel', group: 'Shell and navigation', name: 'Right panel', desc: 'The 390px column at the right: Next Search, the article detail or the layout settings take turns in it.',
    targets: [T('sp', sc('Scaffold__Actions'), { as: 'next-search', states: D }), T('sm-inspect', sc('Scaffold__Actions'), { as: 'article', states: D }), T('sm-x', sc('Scaffold__Actions'), { as: 'layout', states: D })] },

  // ============================================================ search header
  { key: 'search-summary', group: 'Search header', name: 'Search summary pill', desc: 'The search header: "Similar articles" in a light pill, "to", then the black "9 Articles" pill, all inside a lavender capsule.',
    targets: [T('sp', sc('SearchSummary__Container'), { states: D, extra: sub({ left: 'SearchSummary__InfoContainer', label: 'SearchSummary__Label', to: 'SearchSummary__With' }) + '' })] },
  { key: 'search-summary-type', group: 'Search header', name: 'Search type pill', desc: 'The light pill that names the kind of search ("Similar articles").',
    targets: [T('sp', sc('SearchSummary__InfoContainer', 0), { states: HOV })] },
  { key: 'search-summary-inputs', group: 'Search header', name: 'Search inputs pill', desc: 'The black pill that names the inputs ("9 Articles") with the seed icon.',
    targets: [T('sp', sc('SearchSummary__InfoContainer', 1), { states: HOV })] },
  { key: 'view-toggle', group: 'Search header', name: 'View toggle', desc: 'Three icon buttons in one capsule: split, list and map. The current one is filled black.',
    targets: [T('sp', sc('ViewSelection__Container'), { states: D, extra: `(el) => __m.kids(el, 'button')` }), T('sm', sc('ViewSelection__Container'), { as: 'map', states: D })] },
  { key: 'view-toggle-button', group: 'Search header', name: 'View toggle button', desc: 'One of the three view buttons, current and not current.',
    targets: [T('sp', sc('ViewSelection__Button', 0), { as: 'current', states: ALL, crop: sc('ViewSelection__Container') }), T('sp', sc('ViewSelection__Button', 1), { as: 'other', states: ALL, crop: sc('ViewSelection__Container') })] },
  { key: 'filter-button', group: 'Search header', name: 'Filter button', desc: 'Round funnel button left of the view toggle; it opens the filter popover.',
    targets: [T('sp', `__m.sc('Scaffold__Header').querySelector('button')`, { states: ALL, crop: `__m.sc('Scaffold__Header').querySelector('button').parentElement` }), T('sm-filter', `__m.sc('Scaffold__Header').querySelector('button')`, { as: 'open', states: D })] },
  { key: 'filter-popover', group: 'Search header', name: 'Filter popover', desc: 'A small card under the filter button: a text field with a Go button and a line of help.',
    targets: [T('sm-filter', sc('Popup__Content'), { states: D, extra: sub({ input: 'Input__form', info: 'ExploreSimpleFilter__InfoContainer' }) })] },
  { key: 'filter-input', group: 'Search header', name: 'Filter field', desc: 'Text input inside the filter popover.',
    targets: [T('sm-filter', sc('Input__form'), { states: ALL, crop: sc('Popup__Content') })] },
  { key: 'filter-go', group: 'Search header', name: 'Filter Go button', desc: 'Small button at the right end of the filter field.',
    targets: [T('sm-filter', btn('Go'), { states: ALL, crop: sc('Popup__Content') })] },

  // ============================================================ graph
  { key: 'graph-canvas', group: 'Graph', name: 'Graph canvas region', desc: 'The graph area of each captured state: the canvas bitmap with its axes captions, legend, toolbar and any hover label drawn on top. The canvas is a bitmap in the snapshots, so these crops are the only record of node, edge and label drawing; read the colours from graph.md and raw/graph-code-notes.md.',
    targets: GRAPH_PAGES.map(([p, as]) => T(p, sc('Graph__Container'), { as, states: D, pad: 0 })) },
  { key: 'graph-legend', group: 'Graph', name: 'Graph legend', desc: 'Three chips at the top right of the graph: References (arrow), Search inputs (seed icon), Results (open circle). Hovering a chip shows a tooltip and highlights those nodes.',
    targets: [T('sp', sc('ExploreGraphLegend__Container'), { states: D, extra: `(el) => __m.kids(el, '[class*="ExploreGraphLegend__ItemContainer-sc-"], svg, span')` })] },
  { key: 'graph-legend-item', group: 'Graph', name: 'Graph legend chip', desc: 'One legend chip. Hovering shows a help cursor and a white fill; the tooltip itself comes from script and is only present in three of the snapshots.',
    targets: [T('sp', sc('ExploreGraphLegend__ItemContainer', 0), { as: 'references', states: ALL, crop: sc('ExploreGraphLegend__Container') }), T('sp', sc('ExploreGraphLegend__ItemContainer', 1), { as: 'inputs', states: HOV, crop: sc('ExploreGraphLegend__Container') }), T('sp', sc('ExploreGraphLegend__ItemContainer', 2), { as: 'results', states: HOV, crop: sc('ExploreGraphLegend__Container') })] },
  { key: 'graph-tooltip', group: 'Graph', name: 'Legend tooltip', desc: 'Dark tooltip with an arrow, shown above a legend chip.',
    targets: [T('sp-hover-legend-inputs', sc('HintContainer__Content'), { as: 'search-inputs', states: D, pad: 12, extra: sub({ arrow: 'HintContainer__Arrow' }) }), T('sp-hover-legend-results', sc('HintContainer__Content'), { as: 'results', states: D, pad: 12 }), T('sp-hover-result', sc('HintContainer__Content'), { as: 'result-hover', states: D, pad: 12 })] },
  { key: 'graph-axis-y', group: 'Graph', name: 'Graph axis caption, vertical', desc: 'Rotated caption with an arrow icon and two rules, at the bottom left of the graph ("More citations").',
    targets: [T('sm', sc('GraphAxes__AxisContainer', 0), { states: D, pad: 6, extra: sub({ label: 'GraphAxes__AxisLabel', icon: 'GraphAxes__AxisIcon', line: 'GraphAxes__AxisLine' }) })] },
  { key: 'graph-axis-x', group: 'Graph', name: 'Graph axis caption, horizontal', desc: 'The horizontal caption along the bottom edge ("More recently published").',
    targets: [T('sm', sc('GraphAxes__AxisContainer', 1), { states: D, pad: 6, extra: sub({ label: 'GraphAxes__AxisLabel', icon: 'GraphAxes__AxisIcon', line: 'GraphAxes__AxisLine' }) })] },
  { key: 'graph-controls', group: 'Graph', name: 'Graph toolbar', desc: 'Five 32px icon buttons stacked at the bottom right of the graph: pointer, recentre, zoom in, zoom out and layout settings.',
    targets: [T('sm', sc('GraphControls__Container'), { states: D, extra: `(el) => __m.kids(el, 'button')` }), T('sp', sc('GraphControls__Container'), { as: 'split', states: D }), T('lm', sc('GraphControls__Container'), { as: 'library', states: D })] },
  { key: 'graph-control-button', group: 'Graph', name: 'Graph toolbar button', desc: 'One toolbar button. The first (pointer) is the active tool.',
    targets: [T('sm', sc('GraphControls__StyledButton', 0), { as: 'pointer', states: ALL, crop: sc('GraphControls__Container') }), T('sm', sc('GraphControls__StyledButton', 1), { as: 'recentre', states: ALL, crop: sc('GraphControls__Container') }), T('sm', sc('GraphControls__StyledButton', 2), { as: 'zoom-in', states: HOV, crop: sc('GraphControls__Container') }), T('sm', sc('GraphControls__StyledButton', 4), { as: 'settings', states: ALL, crop: sc('GraphControls__Container') })] },
  { key: 'graph-resize-handle', group: 'Graph', name: 'Panel resize handle', desc: 'Invisible 8px strip at the edge of the graph with a 4px display bar; drag resizes the list or the panel.',
    targets: [T('sp', sc('ResizeHandle__Handle', 0), { states: HOV, crop: false, extra: sub({ display: 'ResizeHandle__HandleDisplay' }) })] },
  { key: 'positions-moved', group: 'Graph', name: 'Positions moved pill', desc: 'Replaces the axes captions once a node has been dragged: a peach pill with an icon, in the bottom left of the graph. It opens a one-item menu.',
    targets: [T('lm-moved', sc('GraphBrokenAxes__BrokenAxesDropdown'), { states: ALL, pad: 10 }), T('lm-reset', sc('GraphBrokenAxes__BrokenAxesDropdown'), { as: 'open', states: D, pad: 10 })] },
  { key: 'reset-menu', group: 'Graph', name: 'Reset positions menu', desc: 'White menu card above the Positions moved pill with one row, Reset.',
    targets: [T('lm-reset', sc('Dropdown__Content'), { states: D, pad: 14, extra: sub({ item: 'Dropdown__Item', icon: 'Dropdown__LeftSpace' }) }), T('lm-reset', sc('Dropdown__Item'), { as: 'item', states: HOV, pad: 10, crop: sc('Dropdown__Content') })] },

  // ============================================================ article list
  { key: 'list-column', group: 'Article list', name: 'Result list column', desc: 'The 400px column of result cards at the left of the split view, with a thin loading line on top and a pager at the bottom.',
    targets: [T('sp', sc('ExploreStep__ListContainer'), { states: D, pad: 0, extra: sub({ viewport: 'ScrollContainer__Viewport', loadline: 'LoadLine__Container' }) })] },
  { key: 'list-card', group: 'Article list', name: 'Result card', desc: 'A white card per article: author and year, title, journal in italics, a selection circle at the top right, then a rule and the abstract. The tinted variant is the card the pointer was over when its snapshot was taken (it stays tinted and its node is highlighted in the graph).',
    targets: [T('sp', sc('ListItemContainer', 0), { states: HOV, focus: sc('ListItemArticleDetails__Container', 0), extra: sub({ details: 'ListItemArticleDetails__Container', nickname: 'ListItemArticleDetails__Nickname', title: 'ListItemArticleDetails__Title', journal: 'ListItemArticleDetails__Journal', rule: 'ListItem__HR', abstract: 'ListItemArticleVerbose__Abstract', side: 'ListItemSideButton__StyledButton', tick: 'SelectionTick__Container' }) }),
      T('sp', sc('ListItemContainer', 1), { as: 'second', states: D }),
      T('sp-hover-list-card', `[...document.querySelectorAll('[class*="ListItemContainer-sc-"]')].find((c) => getComputedStyle(c).backgroundColor !== getComputedStyle(document.querySelectorAll('[class*="ListItemContainer-sc-"]')[0]).backgroundColor) || ${sc('ListItemContainer', 1)}`, { as: 'tinted', states: D }),
      T('sl', sc('ListItemContainer', 0), { as: 'list-view', states: HOV }),
      T('ll', sc('ListItemContainer', 0), { as: 'library', states: HOV })] },
  { key: 'list-card-focus', group: 'Article list', name: 'Result card, focus ring', desc: 'The card body is a button; this is its keyboard focus ring, measured on the button itself.',
    targets: [T('sp', sc('ListItemArticleDetails__Container', 0), { states: ['focus-visible'], crop: sc('ListItemContainer', 0) })] },
  { key: 'list-card-side', group: 'Article list', name: 'Result card side button', desc: 'Full-height 36px strip at the right of a card; holds the selection circle.',
    targets: [T('sp', sc('ListItemSideButton__StyledButton', 0), { states: ALL, crop: sc('ListItemContainer', 0), extra: sub({ tick: 'SelectionTick__Container', icon: 'SelectionTick__SelectionTickIcon' }) })] },
  { key: 'list-pager', group: 'Article list', name: 'List pager', desc: 'Previous and next chevrons around a "1 - 20 of 686" label at the foot of the list.',
    targets: [T('sp', sc('Button__SharedStyles', 0), { as: 'prev', states: ALL, crop: `__m.sc('Button__SharedStyles', 0).parentElement`, pad: 6 }), T('sp', sc('Button__SharedStyles', 1), { as: 'next', states: ALL, crop: `__m.sc('Button__SharedStyles', 0).parentElement`, pad: 6 })] },
  { key: 'list-scrollbar', group: 'Article list', name: 'List scrollbar', desc: 'Custom 12px scrollbar track with a thumb; visible on hover in the list.',
    targets: [T('sp-hover-list-card', sc('ScrollContainer__Scrollbar'), { states: D, pad: 4, extra: sub({ thumb: 'ScrollContainer__Thumb' }) })] },
  { key: 'list-state-chip', group: 'Article list', name: 'Library folder chip', desc: 'Outlined chip under a library card title naming the collection the article is in.',
    targets: [T('ll', sc('ArticleState__Container', 0), { states: HOV, extra: `(el) => __m.kids(el, 'svg, p, button')` })] },

  // ============================================================ next search
  { key: 'next-search', group: 'Next Search panel', name: 'Next Search panel', desc: 'The right-hand column when nothing is selected: header, a dismissible tip, an empty state with art, and the black Search Settings drawer at the foot.',
    targets: [T('sp', sc('ExploreBuilder__Container'), { states: D })] },
  { key: 'next-search-header', group: 'Next Search panel', name: 'Next Search header', desc: 'Title at the left, the black "Auto-save to..." pill at the right.',
    targets: [T('sp', sc('ExploreBuilder__HeaderContainer'), { states: D, extra: `(el) => __m.kids(el, 'h1, h2, h3, h4, p, span, button')` })] },
  { key: 'autosave-button', group: 'Next Search panel', name: 'Auto-save button', desc: 'Black pill with a disk icon.',
    targets: [T('sp', btn('Auto-save to...'), { states: ALL })] },
  { key: 'tip-banner', group: 'Next Search panel', name: 'Tip banner', desc: 'Turquoise strip with the rabbit, a line of help and a close button.',
    targets: [T('sp', `__m.up(__m.byText('Select articles to help'), 2)`, { states: D, extra: `(el) => __m.kids(el, 'img, svg, p, button')` })] },
  { key: 'tip-close', group: 'Next Search panel', name: 'Tip close button', desc: '32px icon button that dismisses the tip.',
    targets: [T('sp', at(1392, 188), { states: ALL, crop: `__m.up(__m.byText('Select articles to help'), 2)` })] },
  { key: 'empty-state', group: 'Next Search panel', name: 'Next Search empty state', desc: 'Centred heading "Grow and go!", an italic line, the illustration and a "Find out how it works" link.',
    targets: [T('sp', sc('ExploreBuilder__EmptyContainer'), { states: D, extra: `(el) => __m.kids(el, 'h1, h2, h3, h4, p, a, img')` })] },
  { key: 'empty-state-link', group: 'Next Search panel', name: 'Find out how it works link', desc: 'Underlined link under the illustration.',
    targets: [T('sp', `__m.sc('ExploreBuilder__EmptyContainer').querySelector('a')`, { states: ALL })] },
  { key: 'drawer', group: 'Next Search panel', name: 'Search Settings drawer', desc: 'Black rounded sheet pinned to the foot of the right panel: a head row with a chevron, a rule, then a summary line and the grey Search button. The article panel reuses it as "Dive deeper on this article".',
    targets: [T('sp', `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement`, { as: 'search-settings', states: D, extra: sub({ head: 'FilterableSearchActions__TrayHeadButton', title: 'FilterableSearchActions__Title', chevron: 'FilterableSearchActions__Chevron', summary: 'ExploreActionsMain__SearchSummary', emph: 'ExploreActionsMain__SummaryEmph' }) }),
      T('sm-inspect', `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement`, { as: 'dive-deeper', states: D, extra: sub({ title: 'FilterableSearchActions__Title' }) })] },
  { key: 'drawer-head', group: 'Next Search panel', name: 'Drawer head button', desc: 'The title row of the drawer; pressing it opens and closes the sheet.',
    targets: [T('sp', sc('FilterableSearchActions__TrayHeadButton'), { as: 'search-settings', states: ALL, crop: `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement` }), T('sm-inspect', sc('FilterableSearchActions__TrayHeadButton'), { as: 'dive-deeper', states: HOV, crop: `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement` })] },
  { key: 'drawer-search-button', group: 'Next Search panel', name: 'Drawer Search button', desc: 'Grey pill button at the right of the drawer summary.',
    targets: [T('sp', btn('Search', `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement`), { states: ALL, crop: `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement` })] },

  // ============================================================ article detail
  { key: 'inspector', group: 'Article detail panel', name: 'Article detail panel', desc: 'The right column when a node or card is selected: a header (counts, close, sticker and nickname, action icons), the title, journal, authors, library buttons, folder chip and abstract, with the "Dive deeper" drawer at the foot.',
    targets: [T('sm-inspect', sc('InspectorStyles__Content'), { states: D, extra: sub({ header: 'InspectorStyles__Header', body: 'InspectorStyles__Body', nav: 'ArticleDetailsDisplay__NavContainer', nickname: 'ArticleDetailsDisplay__Nickname', title: 'ArticleTitle__Title', journal: 'ArticleDetailsDisplay__Journal', authors: 'ArticleAuthors__Container', abstract: 'ArticleAbstract__AbstractParagraph' }) }), T('sp-inspect', sc('InspectorStyles__Content'), { as: 'split', states: D })] },
  { key: 'inspector-nav', group: 'Article detail panel', name: 'Article navigation', desc: 'Previous and next article arrows with a count.',
    targets: [T('sm-inspect', sc('ArticleDetailsDisplay__NavContainer'), { states: D, extra: `(el) => __m.kids(el, '[class*="ArticleDetailsDisplay__NavItemContainer-sc-"], [class*="ArticleDetailsDisplay__NavItemCount-sc-"], svg')` }), T('sm-inspect', sc('ArticleDetailsDisplay__NavItemContainer', 0), { as: 'item', states: ALL, crop: sc('ArticleDetailsDisplay__NavContainer') })] },
  { key: 'inspector-close', group: 'Article detail panel', name: 'Article panel close button', desc: '24px X at the top right of the panel.',
    targets: [T('sm-inspect', sc('InspectorHeader__CloseButton'), { states: ALL, crop: sc('InspectorStyles__Header') })] },
  { key: 'inspector-sticker', group: 'Article detail panel', name: 'Sticker button', desc: '34px square button at the left of the nickname (the sticker icon).',
    targets: [T('sm-inspect', sc('StickerButton__Button'), { states: ALL, crop: sc('ArticleDetailsDisplay__NicknameContainer'), extra: sub({ emoji: 'StickerButton__EmojiDisplay', icon: 'StickerButton__StyledSticker' }) })] },
  { key: 'inspector-nickname-row', group: 'Article detail panel', name: 'Nickname row', desc: 'Author and year heading ("Raghavendra, 2026") with the evaluation dot and action icons.',
    targets: [T('sm-inspect', sc('ArticleDetailsDisplay__NicknameContainer'), { states: D, extra: sub({ nickname: 'ArticleDetailsDisplay__Nickname', dot: 'ArticleEvaluation__NotificationDot', tick: 'SelectionTick__Container' }) })] },
  { key: 'inspector-icon-button', group: 'Article detail panel', name: 'Article action icon button', desc: '24px icon buttons in the nickname row.',
    targets: [T('sm-inspect', at(1340, 198), { as: 'first', states: ALL, crop: sc('ArticleDetailsDisplay__NicknameContainer') }), T('sm-inspect', sc('Button__SharedStyles', 0), { as: 'second', states: ALL, crop: sc('ArticleDetailsDisplay__NicknameContainer') })] },
  { key: 'inspector-title', group: 'Article detail panel', name: 'Article title', desc: 'The paper title, a link to the source.',
    targets: [T('sm-inspect', `${sc('ArticleTitle__Title')}.querySelector('a')`, { states: ALL, crop: sc('ArticleTitle__Title'), extra: `(el) => ({ heading: __m.box(el.closest('h5')) })` })] },
  { key: 'inspector-authors', group: 'Article detail panel', name: 'Author chips', desc: 'Authors as inline buttons; the rest collapse into a "+13" button.',
    targets: [T('sm-inspect', sc('ArticleAuthors__Container'), { states: D, extra: `(el) => __m.kids(el, 'button')` }), T('sm-inspect', sc('ArticleAuthors__AuthorButton', 0), { as: 'author', states: ALL, crop: sc('ArticleAuthors__Container') }), T('sm-inspect', sc('ArticleAuthors__MoreButton'), { as: 'more', states: ALL, crop: sc('ArticleAuthors__Container') })] },
  { key: 'inspector-library-row', group: 'Article detail panel', name: 'Add to library row', desc: 'A "Library" label with the Collection and Reading List buttons.',
    targets: [T('sm-inspect', `${btn('Collection')}.parentElement.parentElement`, { states: D, extra: `(el) => __m.kids(el, 'h5, button, svg')` }), T('sm-inspect', btn('Collection'), { as: 'collection', states: ALL, crop: `${btn('Collection')}.parentElement.parentElement` }), T('sm-inspect', btn('Reading List'), { as: 'reading-list', states: ALL, crop: `${btn('Collection')}.parentElement.parentElement` })] },
  { key: 'inspector-folder-chip', group: 'Article detail panel', name: 'Folder chip', desc: 'The collection the article is already in, with a remove button.',
    targets: [T('sm-inspect', sc('ArticleFolders__FolderContainer'), { states: HOV, extra: sub({ icon: 'ArticleFolders__StyledFolder', label: 'ArticleFolders__FolderLabel', remove: 'ArticleFolders__RemoveButton' }) }), T('sm-inspect', sc('ArticleFolders__RemoveButton'), { as: 'remove', states: ALL, crop: sc('ArticleFolders__FolderContainer') })] },
  { key: 'inspector-abstract', group: 'Article detail panel', name: 'Abstract text', desc: 'Abstract paragraphs in the scrolling body of the panel.',
    targets: [T('sm-inspect', sc('ArticleAbstract__AbstractParagraph'), { states: D, crop: sc('ScrollContainer__Root') })] },
  { key: 'inspector-chips', group: 'Article detail panel', name: 'Dive deeper chips', desc: 'Three outlined chips in the drawer: Similar, Refs and Cited By, each with a count. The drawer is always shown on this panel; the "Dive deeper on this article" title above them is the drawer head.',
    targets: [T('sm-inspect', btn('Similar 148'), { as: 'similar', states: ALL, crop: `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement` }), T('sm-inspect', btn('Refs 41'), { as: 'refs', states: HOV, crop: `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement` }), T('sm-inspect', btn('Cited By 7'), { as: 'cited-by', states: HOV, crop: `${sc('FilterableSearchActions__TrayHeadButton')}.parentElement` })] },

  // ============================================================ layout settings
  { key: 'layout-panel', group: 'Layout settings', name: 'Layout settings panel', desc: 'The right column opened by the graph toolbar: four tabs (X Axis, Y Axis, Size, Advanced) with a close button, then option cards, and Reset to defaults at the foot.',
    targets: [['sm-x', 'x-axis'], ['sm-y', 'y-axis'], ['sm-size', 'size'], ['sm-adv', 'advanced']].map(([p, as]) => T(p, sc('LayoutSettings__Container'), { as, states: D, extra: p === 'sm-x' ? sub({ tabs: 'LayoutSettings__NavContainer' }) : undefined }))},
  { key: 'layout-tabs', group: 'Layout settings', name: 'Layout tabs', desc: 'Text tabs across the top of the panel; the current tab is a black pill with white text.',
    targets: [T('sm-x', sc('LayoutSettings__NavContainer'), { states: D, extra: `(el) => __m.kids(el, '[class*="LayoutSettings__NavItemContainer-sc-"], [class*="LayoutSettings__NavItemLabel-sc-"]')` }), T('sm-y', sc('LayoutSettings__NavContainer'), { as: 'y-axis', states: D })] },
  { key: 'layout-tab', group: 'Layout settings', name: 'Layout tab', desc: 'One tab, current and not current.',
    targets: [T('sm-x', sc('LayoutSettings__NavItemContainer', 0), { as: 'current', states: ALL, crop: sc('LayoutSettings__NavContainer'), extra: sub({ label: 'LayoutSettings__NavItemLabel' }) }), T('sm-x', sc('LayoutSettings__NavItemContainer', 1), { as: 'other', states: ALL, crop: sc('LayoutSettings__NavContainer'), extra: sub({ label: 'LayoutSettings__NavItemLabel' }) })] },
  { key: 'layout-close', group: 'Layout settings', name: 'Layout panel close button', desc: 'X at the top right of the panel.',
    targets: [T('sm-x', `${sc('LayoutSettings__Container')}.querySelector('[class*="Button__SharedStyles-sc-"]')`, { states: ALL, crop: sc('LayoutSettings__NavContainer'), pad: 12 })] },
  { key: 'layout-option', group: 'Layout settings', name: 'Layout option card', desc: 'A bordered card per choice (for the Y axis: Cite Count, Ref Count, Publication Date). The chosen card is tinted blue, shows a tick and opens its sub-settings; the others are white with a hint line.',
    targets: [T('sm-y', OPT_CHOSEN, { as: 'chosen', states: D, extra: sub({ header: 'LayoutSettingsGeneric__OptionHeader', hint: 'LayoutSettingsGeneric__Hint', label: 'LayoutStyles__SettingLabel' }) }), T('sm-y', OPT_OTHER, { as: 'other', states: HOV, extra: sub({ header: 'LayoutSettingsGeneric__OptionHeader', hint: 'LayoutSettingsGeneric__Hint' }) }), T('sm-x', OPT_CHOSEN, { as: 'x-chosen', states: D }), T('sm-size', OPT_CHOSEN, { as: 'size-chosen', states: D })] },
  { key: 'layout-select', group: 'Layout settings', name: 'Layout select', desc: 'Grey rounded select with a chevron ("Logarithmic", "4").',
    targets: [T('sm-y', sc('Select__Trigger', 0), { states: ALL, crop: sc('LayoutSettingsGeneric__OptionContainer', 0), extra: sub({ value: 'Select__Value' }) }), T('sm-y', sc('Select__Trigger', 1), { as: 'small', states: HOV, crop: sc('LayoutSettingsGeneric__OptionContainer', 0) }), T('sm-adv', sc('Select__Trigger', 0), { as: 'advanced', states: HOV })] },
  { key: 'layout-toggle', group: 'Layout settings', name: 'Layout toggle', desc: 'Checkbox-like 20px button for the on and off options (Compact, Reverse).',
    targets: [T('sm-x', TOG('checked'), { as: 'checked', states: ALL, crop: `${TOG('checked')}.closest('[class*="LayoutSettingsGeneric__OptionContainer-sc-"]')` }), T('sm-x', TOG('unchecked'), { as: 'unchecked', states: ALL, crop: `${TOG('unchecked')}.closest('[class*="LayoutSettingsGeneric__OptionContainer-sc-"]')` })] },
  { key: 'layout-help', group: 'Layout settings', name: 'Setting help icon', desc: 'Small question-mark icon beside a setting label.',
    targets: [T('sm-y', sc('LayoutSettingControlHint__StyledQuestion'), { states: HOV, crop: `${sc('LayoutSettingControlHint__StyledQuestion')}.parentElement`, pad: 8 })] },
  { key: 'layout-reset', group: 'Layout settings', name: 'Reset to defaults button', desc: 'Plain text button at the foot of the layout panel.',
    targets: [T('sm-x', btn('Reset to defaults'), { states: ALL })] },

  // ============================================================ library
  { key: 'library-sidebar', group: 'Library', name: 'Library sidebar', desc: 'A 250px column of white cards: three fixed lists (Recently Found, All Articles, Reading List) with counts, then Collections with its tools and the folder list, then BibTeX and Zotero at the foot.',
    targets: [T('lm', sc('Library__SidebarContainer'), { states: D, pad: 0 })] },
  { key: 'library-list-row', group: 'Library', name: 'Library list row', desc: 'A fixed list entry with an icon, a name and a count badge.',
    targets: [T('lm', sc('LibrarySidebar__ClickableSectionContainer', 0), { as: 'recently-found', states: ALL, extra: sub({ title: 'LibrarySidebar__ClickableSectionTitle', count: 'LibrarySidebar__CountContainer' }) }), T('lm', sc('LibrarySidebar__ClickableSectionContainer', 1), { as: 'all-articles', states: HOV }), T('lm', sc('LibrarySidebar__ClickableSectionContainer', 2), { as: 'reading-list', states: HOV })] },
  { key: 'library-collections-title', group: 'Library', name: 'Collections heading', desc: 'The "Collections" heading with three 24px tool buttons (sort, filter, add).',
    targets: [T('lm', sc('LibrarySidebar__SectionTitle'), { states: D, crop: sc('LibrarySidebar__SectionContainer', 0), pad: 4 }), T('lm', sc('Button__SharedStyles', 0), { as: 'tool-sort', states: ALL, crop: `${sc('LibrarySidebar__SectionTitle')}.parentElement`, pad: 6 }), T('lm', sc('Button__SharedStyles', 2), { as: 'tool-add', states: HOV, crop: `${sc('LibrarySidebar__SectionTitle')}.parentElement`, pad: 6 })] },
  { key: 'library-folder', group: 'Library', name: 'Collection row', desc: 'A collection in the sidebar: folder icon in the collection colour, name, and a hover chevron. The current collection has a black outline.',
    targets: [T('lm', sc('NestedFolders__FolderContainer'), { states: HOV, extra: sub({ icon: 'NestedFolders__FolderIcon', label: 'NestedFolders__FolderLabel', overlay: 'NestedFolders__FolderSelectionOverlay', chevron: 'NestedFolders__TwiddleChevronRight' }) }), T('lm', sc('NestedFolders__HoverInlineButton', 0), { as: 'chevron', states: ALL, crop: sc('NestedFolders__FolderContainer') })] },
  { key: 'library-footer-button', group: 'Library', name: 'BibTeX and Zotero buttons', desc: 'Two text buttons with icons at the foot of the sidebar (import).',
    targets: [T('lm', btn('BibTeX'), { as: 'bibtex', states: ALL, crop: sc('LibrarySidebarFooter__Container') }), T('lm', btn('Zotero'), { as: 'zotero', states: HOV, crop: sc('LibrarySidebarFooter__Container') })] },
  { key: 'collection-header', group: 'Library', name: 'Collection header', desc: 'White banner: a 64px tile in the collection colour with a folder icon, the name, the article count, then Share, settings, add and Search from Collection at the right.',
    targets: [T('lm', sc('LibraryStyles__HeaderContainer'), { states: D, extra: sub({ tile: 'LibraryStyles__IconContainer', name: 'LibraryStyles__LibraryHeaderName', info: 'LibraryStyles__InfoContainer', children: 'LibraryStyles__HeaderChildren' }) })] },
  { key: 'collection-share', group: 'Library', name: 'Share button', desc: 'Peach pill button with a people icon.',
    targets: [T('lm', btn('Share'), { states: ALL, crop: sc('LibraryStyles__HeaderContainer') })] },
  { key: 'collection-icon-button', group: 'Library', name: 'Collection icon button', desc: '24px round icon buttons beside Share: settings and add.',
    targets: [T('lm', at(1360, 111), { as: 'settings', states: ALL, crop: sc('LibraryStyles__HeaderContainer') }), T('lm', at(1392, 111), { as: 'add', states: HOV, crop: sc('LibraryStyles__HeaderContainer') })] },
  { key: 'collection-search-button', group: 'Library', name: 'Search from Collection button', desc: 'Black pill under the header buttons.',
    targets: [T('lm', btn('Search from Collection'), { states: ALL, crop: sc('LibraryStyles__HeaderContainer') })] },
  { key: 'selection-bar', group: 'Library', name: 'Selection bar', desc: 'A row under the header: Select all at the left, then Reading, Delete, Save, Export and Search, greyed until something is selected.',
    targets: [T('lm', sc('ListSelectionBar__Container'), { states: D, extra: `(el) => __m.kids(el, 'button')` }), T('lm', btn('Select all'), { as: 'select-all', states: ALL, crop: sc('ListSelectionBar__Container') }), T('lm', btn('Reading', sc('ListSelectionBar__Container')), { as: 'action', states: ALL, crop: sc('ListSelectionBar__Container') })] },
  { key: 'filter-bar', group: 'Library', name: 'Library filter bar', desc: 'Grey row inside the list card: "Showing 9 Articles" at the left, then sort, filter, search and the four view buttons at the right.',
    targets: [T('ll', sc('ListFilterBar__Container'), { states: D, extra: `(el) => __m.kids(el, 'p, button, input, svg')` }), T('lm', sc('ListFilterBar__Container'), { as: 'map', states: D })] },
  { key: 'filter-bar-button', group: 'Library', name: 'Library filter bar controls', desc: 'The sort select, the filter button, the search field and the view buttons (current and not).',
    targets: [T('ll', sc('Select__Trigger'), { as: 'sort', states: ALL, crop: sc('ListFilterBar__Container') }), T('ll', sc('Button__SharedStyles', 3), { as: 'filter', states: ALL, crop: sc('ListFilterBar__Container') }), T('ll', sc('FilterInput__StyledInput'), { as: 'search', states: ALL, crop: sc('ListFilterBar__Container') }), T('ll', sc('ViewSelection__Button', 0), { as: 'view-current', states: ALL, crop: sc('ListFilterBar__Container') }), T('ll', sc('ViewSelection__Button', 1), { as: 'view-other', states: ALL, crop: sc('ListFilterBar__Container') })] },

  // ============================================================ home
  { key: 'home-hero', group: 'Home', name: 'Home hero', desc: 'An illustration at the left, then a heading, a subtitle, a wide search field with its Search button, a tip line and Browse Library.',
    targets: [T('home', sc('DashboardSearch__Container'), { states: D, extra: sub({ title: 'DashboardSearch__Title', subtitle: 'DashboardSearch__Subtitle', bar: 'SearchBar__Container', tip: 'DashboardSearch__Tip', or: 'DashboardSearch__Or', image: 'Dashboard__Image' }) })] },
  { key: 'home-search-field', group: 'Home', name: 'Home search field', desc: 'The 53px search input with a magnifier icon.',
    targets: [T('home', sc('SearchBar__StyledInput'), { states: ALL, crop: sc('SearchBar__Container'), pad: 12, extra: sub({}) })] },
  { key: 'home-search-button', group: 'Home', name: 'Home Search button', desc: 'Black pill inside the right end of the field.',
    targets: [T('home', sc('SearchBar__SearchButton'), { states: ALL, crop: sc('SearchBar__Container'), pad: 12 })] },
  { key: 'home-browse-library', group: 'Home', name: 'Browse Library button', desc: 'Light pill with a library icon next to the field.',
    targets: [T('home', btn('Browse Library'), { states: ALL, crop: sc('DashboardSearch__Container'), pad: 4 })] },
  { key: 'home-section', group: 'Home', name: 'Home section card', desc: 'Three white cards: recent articles, your collections and getting started. Each has a header with title and description.',
    targets: [T('home', sc('DashboardStyles__Section', 0), { as: 'recent', states: D, extra: sub({ header: 'DashboardStyles__SectionHeader', title: 'DashboardStyles__SectionTitle', desc: 'DashboardStyles__SectionDesc' }) }), T('home', sc('DashboardStyles__Section', 1), { as: 'collections', states: D }), T('home', sc('DashboardStyles__Section', 2), { as: 'guides', states: D })] },
  { key: 'home-article-row', group: 'Home', name: 'Compact article row', desc: 'A row in the recent lists: author and year, folder icon, a one-line title and two 36px buttons at the right (search from this article, open).',
    targets: [T('home', sc('ListItemArticleDetailsCompact__Container', 0), { states: ALL, extra: sub({ nickname: 'ListItemArticleDetailsCompact__Nickname', folders: 'ListItemArticleDetailsCompact__FoldersContainer', title: 'ListItemArticleDetailsCompact__Title' }), crop: `${sc('ListItemArticleDetailsCompact__Container', 0)}.parentElement` }), T('home', sc('ListItemSideButton__StyledButton', 0), { as: 'side-button', states: ALL, crop: `${sc('ListItemArticleDetailsCompact__Container', 0)}.parentElement` })] },
  { key: 'home-folder-row', group: 'Home', name: 'Home collection row', desc: 'A collection link with a folder icon in its colour and an arrow.',
    targets: [T('home', sc('DashboardFolders__ItemContainer'), { states: ALL, extra: sub({ icon: 'DashboardFolders__FolderIcon', label: 'DashboardFolders__Label', arrow: 'DashboardFolders__StyledArrowRight' }) })] },
  { key: 'home-guide-card', group: 'Home', name: 'Guide card', desc: 'A linked card with a 180px image over a title and a short description.',
    targets: [T('home', sc('DashboardNew__ContentContainer', 0), { states: ALL, extra: sub({ image: 'DashboardNew__ContentImageContainer', body: 'DashboardNew__ContentBody', title: 'DashboardNew__Title', desc: 'DashboardNew__Desc' }) })] },
];

// ---------------------------------------------------------------- page helpers (run in the page)

const HELPERS = () => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = {
      tag: el.tagName.toLowerCase(),
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(',')[0].replace(/"/g, '')}`,
      color: cs.color,
    };
    const add = (k, v, skip) => { if (v !== skip && v !== undefined) o[k] = v; };
    add('text', norm(el.innerText).slice(0, 60) || undefined, undefined);
    add('letterSpacing', cs.letterSpacing, 'normal');
    add('fontStyle', cs.fontStyle, 'normal');
    add('bg', cs.backgroundColor, 'rgba(0, 0, 0, 0)');
    add('bgImage', cs.backgroundImage === 'none' ? undefined : cs.backgroundImage.replace(/url\("data:[^)]{40,}\)/g, 'url(data:...)').slice(0, 160));
    add('padding', cs.padding, '0px');
    add('margin', cs.margin, '0px');
    add('gap', cs.gap, 'normal');
    add('radius', cs.borderRadius, '0px');
    add('boxShadow', cs.boxShadow, 'none');
    add('opacity', cs.opacity, '1');
    add('display', cs.display);
    const b = ['Top', 'Right', 'Bottom', 'Left'].map((s) => (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' ? `${s[0]}:${cs[`border${s}Width`]} ${cs[`border${s}Style`]} ${cs[`border${s}Color`]}` : '')).filter(Boolean);
    if (b.length) o.border = b.join(' | ');
    if (el instanceof SVGElement) { o.fill = cs.fill; o.stroke = cs.stroke; }
    return o;
  };
  const S = (n) => (/^(?:[A-Z][A-Za-z0-9_]*|[A-Za-z0-9]+__[A-Za-z0-9]+)$/.test(n) ? `[class^="${n}-sc-"],[class*=" ${n}-sc-"]` : n);
  const scAll = (n) => [...document.querySelectorAll(S(n))];
  window.__m = {
    box,
    sc: (n, i = 0) => scAll(n)[i] || null,
    q: (sel, i = 0) => document.querySelectorAll(sel)[i] || null,
    at: (x, y, tag = 'button') => { const e = document.elementFromPoint(x, y); return e ? e.closest(tag) : null; },
    up: (el, n = 1) => { for (let i = 0; el && i < n; i++) el = el.parentElement; return el; },
    byText: (t) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (w.currentNode.nodeValue.includes(t) && w.currentNode.parentElement.getBoundingClientRect().width > 0) return w.currentNode.parentElement;
      return null;
    },
    btn: (t, scope) => [...(scope || document).querySelectorAll('button, a, [role=button]')].find((e) => norm(e.innerText) === t && e.getBoundingClientRect().width > 0) || null,
    sub: (el, map) => {
      const out = {};
      for (const [k, n] of Object.entries(map)) { const e = el.querySelector(S(n)); if (e) out[k] = box(e); }
      return out;
    },
    kids: (el, sel) => ({ container: box(el), children: [...el.querySelectorAll(sel)].filter((c) => c.getBoundingClientRect().width > 1).slice(0, 16).map((c) => ({ label: c.getAttribute('aria-label') || (c.innerText || '').trim().slice(0, 30) || c.tagName.toLowerCase(), ...box(c) })) }),
    // Authored state rules (hover, active, focus, data-state) that match this element.
    rules: (el) => {
      const out = [];
      const STATE = /:hover|:active|:focus-visible|:focus-within|:focus|::?before|::?after|\[data-state[^\]]*\]|\[aria-[a-z]+[^\]]*\]/g;
      const TEST = /:hover|:active|:focus|data-state|aria-(selected|current|expanded|pressed|checked)/;
      const walk = (rules, media) => {
        for (const r of rules) {
          if (r.cssRules && !r.selectorText) { walk(r.cssRules, r.conditionText || media); continue; }
          const s = r.selectorText;
          if (!s || !TEST.test(s)) continue;
          for (const part of s.split(',')) {
            if (!TEST.test(part)) continue;
            const bare = part.replace(STATE, '').trim();
            let hit = false;
            try { hit = !!bare && el.matches(bare); } catch { hit = false; }
            if (hit) { out.push((media ? `@media ${media} ` : '') + r.cssText.replace(/\s+/g, ' ').replace(/(\.[A-Za-z0-9_-]{5,})/g, '.x').slice(0, 360)); break; }
          }
          if (out.length >= 12) return;
        }
      };
      for (const ss of document.styleSheets) { try { walk(ss.cssRules, ''); } catch { /* cross-origin sheet */ } }
      return out;
    },
  };
  // No link, button or form in a snapshot may leave the file.
  document.addEventListener('click', (e) => e.preventDefault(), true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);
};

const PROPS = [
  'display', 'position', 'boxSizing', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gap', 'rowGap', 'columnGap', 'flexDirection', 'alignItems', 'justifyContent', 'flexWrap', 'gridTemplateColumns',
  'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRightWidth', 'borderRightStyle', 'borderRightColor',
  'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor', 'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'backgroundColor', 'backgroundImage', 'boxShadow', 'backdropFilter', 'filter',
  'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'whiteSpace',
  'color', 'textDecorationLine', 'textDecorationColor', 'textUnderlineOffset',
  'transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
  'cursor', 'opacity', 'transform', 'overflowX', 'overflowY', 'zIndex', 'pointerEvents',
];

// Computed style of the element, its ::before and ::after when they paint,
// the layers painted in its subtree, the first text node's type, the first svg
// icon, and a focus ring or fill painted by an ancestor. Class names are
// reported as the styled-components display name, without the generated hash.
async function styleOf(locator) {
  return locator.evaluate((el, props) => {
    const dn = (n) => { const c = typeof n.className === 'string' ? n.className : (n.className && n.className.baseVal) || ''; const m = c.split(/\s+/).find((x) => /-sc-/.test(x)); return m ? m.replace(/-sc-.*$/, '') : ''; };
    const nm = (n) => n.tagName.toLowerCase() + (dn(n) ? '.' + dn(n) : '');
    const pick = (cs) => { const o = {}; for (const p of props) o[p] = cs[p]; return o; };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const out = {
      tag: el.tagName.toLowerCase(),
      component: dn(el),
      text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      style: pick(cs),
    };
    const dataState = el.getAttribute('data-state');
    if (dataState) out.dataState = dataState;
    for (const pe of ['::before', '::after']) {
      const p = getComputedStyle(el, pe);
      if (p.content && p.content !== 'none' && p.content !== 'normal') {
        out[pe] = { content: p.content.slice(0, 40), width: p.width, height: p.height, position: p.position, backgroundColor: p.backgroundColor, backgroundImage: p.backgroundImage.slice(0, 200), boxShadow: p.boxShadow, borderTopWidth: p.borderTopWidth, borderTopStyle: p.borderTopStyle, borderTopColor: p.borderTopColor, borderRadius: p.borderRadius, inset: `${p.top} ${p.right} ${p.bottom} ${p.left}`, opacity: p.opacity, transition: p.transition };
      }
    }
    const paint = [];
    for (const n of [el, ...el.querySelectorAll('*')].slice(0, 300)) {
      if (paint.length >= 10) break;
      if (n.closest('svg') && n.tagName.toLowerCase() !== 'svg') continue;
      for (const pe of [null, '::before', '::after']) {
        const c = getComputedStyle(n, pe);
        if (pe && (c.content === 'none' || c.content === 'normal')) continue;
        const bw = ['Top', 'Right', 'Bottom', 'Left'].map((sd) => (parseFloat(c[`border${sd}Width`]) > 0 && c[`border${sd}Style`] !== 'none' ? `${sd[0]}:${c[`border${sd}Width`]} ${c[`border${sd}Style`]} ${c[`border${sd}Color`]}` : '')).filter(Boolean);
        const bg = c.backgroundColor !== 'rgba(0, 0, 0, 0)' ? c.backgroundColor : '';
        const bgi = c.backgroundImage !== 'none' && !/^url\("?https?:/.test(c.backgroundImage) ? c.backgroundImage.replace(/url\("data:[^)]{40,}\)/g, 'url(data:...)').slice(0, 200) : '';
        const sh = c.boxShadow !== 'none' ? c.boxShadow : '';
        const ol = c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 ? `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor} offset ${c.outlineOffset}` : '';
        if (!(bw.length || bg || bgi || sh || ol)) continue;
        if (n.tagName === 'IMG' && !bw.length && !sh) continue;
        const rr = n.getBoundingClientRect();
        paint.push({ node: nm(n) + (pe || ''), size: pe ? `${c.width}x${c.height}` : `${rr.width.toFixed(1)}x${rr.height.toFixed(1)}`, border: bw.join(' | ') || undefined, bg: bg || undefined, bgImage: bgi || undefined, shadow: sh || undefined, outline: ol || undefined, radius: c.borderRadius !== '0px' ? c.borderRadius : undefined });
      }
    }
    if (paint.length) out.paint = paint;
    const anc = [];
    for (let n = el.parentElement, i = 0; n && i < 3; n = n.parentElement, i++) {
      const c = getComputedStyle(n);
      if ((i < 1 && c.backgroundColor !== 'rgba(0, 0, 0, 0)') || c.boxShadow !== 'none' || (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0)) {
        anc.push({ up: i + 1, node: nm(n), shadow: c.boxShadow !== 'none' ? c.boxShadow : undefined, outline: c.outlineStyle !== 'none' ? `${c.outlineWidth} ${c.outlineStyle} ${c.outlineColor}` : undefined, radius: c.borderRadius, bg: c.backgroundColor });
      }
    }
    if (anc.length) out.ancestors = anc;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent.trim() && t.parentElement && t.parentElement.getBoundingClientRect().width > 1 && getComputedStyle(t.parentElement).visibility !== 'hidden' ? 1 : 3) });
    const tn = walker.nextNode();
    if (tn && tn.parentElement !== el) {
      const t = tn.parentElement;
      const tc = getComputedStyle(t);
      out.textStyle = { node: nm(t), text: tn.textContent.trim().slice(0, 40), fontFamily: tc.fontFamily, fontSize: tc.fontSize, lineHeight: tc.lineHeight, fontWeight: tc.fontWeight, fontStyle: tc.fontStyle, letterSpacing: tc.letterSpacing, color: tc.color, textDecorationLine: tc.textDecorationLine, textTransform: tc.textTransform };
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const ph = getComputedStyle(el, '::placeholder');
      out.placeholder = { color: ph.color, opacity: ph.opacity, fontSize: ph.fontSize };
    }
    const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
    if (svg) {
      const sr = svg.getBoundingClientRect();
      const scs = getComputedStyle(svg);
      out.icon = { w: +sr.width.toFixed(2), h: +sr.height.toFixed(2), fill: scs.fill, stroke: scs.stroke, color: scs.color };
    }
    return out;
  }, PROPS);
}

// ---------------------------------------------------------------- run

function quantize(files) {
  if (!files.length) return;
  const code = [
    'import sys',
    'from PIL import Image',
    'for f in sys.argv[1:]:',
    '    im = Image.open(f).convert("RGB")',
    '    if im.width > 1600: im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)',
    '    im.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)',
  ].join('\n');
  execFileSync('python3', ['-c', code, ...files], { maxBuffer: 1 << 26 });
}

async function run() {
  const pw = await import(process.env.PLAYWRIGHT || 'playwright');
  const { chromium } = pw.default ?? pw;

  let snapDir = process.env.SNAP_DIR;
  let tmp = null;
  if (!snapDir) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-snap-'));
    for (const name of Object.values(PAGES)) {
      for (const ext of ['html', 'json']) fs.writeFileSync(path.join(tmp, `${name}.${ext}`), zlib.gunzipSync(fs.readFileSync(path.join(ARCHIVE, `${name}.${ext}.gz`))));
    }
    snapDir = tmp;
  }

  const prev = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')) : {};
  const out = { _meta: prev._meta || {}, pages: prev.pages || {}, components: prev.components || {} };
  Object.assign(out._meta, {
    read: '2026-10-04',
    source: 'static, redacted DOM snapshots of signed-in app.researchrabbit.ai pages (stylesheets inlined from the CSSOM, scripts stripped, the graph canvas replaced by an image of its bitmap)',
    viewport: '1440x900 at 2x, headless Chromium (Playwright), file:// URLs',
    states: {
      default: 'at rest, as captured',
      hover: 'real mouse hover, 450ms settle; `hovered` says whether :hover matched',
      'focus-visible': 'real keyboard focus (focus, Shift+Tab, Tab); `focus.ok` and `focus.matches` say whether it took',
      other: 'another element or snapshot captured in that state, named by the `as` label',
    },
    crops: 'components/crops/{component}-{state}.png at 2x, 256 colours, halved when wider than 1600px; a state whose pixels equal the default crop has `sameAsDefault` and no file of its own',
  });
  fs.mkdirSync(CROPS, { recursive: true });
  const hasMeta = (name) => JSON.parse(fs.readFileSync(path.join(snapDir, `${name}.json`), 'utf8'));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' });
  await ctx.addInitScript(HELPERS);
  await ctx.route('**/*', (route) => {
    const req = route.request();
    const u = req.url();
    if (u.startsWith('file:') || u.startsWith('data:')) return route.continue();
    if (req.isNavigationRequest()) return route.abort();
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return route.continue();
    if (req.resourceType() === 'image' && /^https:\/\/app\.researchrabbit\.ai\/assets\//.test(u)) return route.continue();
    return route.abort();
  });

  const pageKeys = Object.keys(PAGES).filter((p) => !ONLY_PAGES.length || ONLY_PAGES.includes(p));
  const specs = SPECS.filter((s) => !ONLY_KEYS || ONLY_KEYS.includes(s.key));
  const defaultHash = new Map(); // component -> state-prefix -> sha of default pixels

  for (const pkey of pageKeys) {
    const name = PAGES[pkey];
    const targets = specs.flatMap((s) => s.targets.filter((t) => t.page === pkey).map((t) => ({ spec: s, t })));
    const meta = hasMeta(name);
    out.pages[pkey] = { name, url: String(meta.url).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>'), scrollY: meta.scrollY, viewport: `${meta.w}x${meta.h}` };
    if (!targets.length) continue;
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    log('open', pkey, name);
    await page.goto(`file://${snapDir}/${name}.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '*{caret-color:transparent!important}' });

    out.pages[pkey].regions = await page.evaluate(() => Object.fromEntries(['Navigation__Container', 'Scaffold__Main', 'Scaffold__Header', 'Scaffold__Body', 'Scaffold__Actions', 'ExploreStep__ListContainer', 'ExploreGraph__Container', 'Graph__Container', 'Library__SidebarContainer', 'LibraryFolder__Container', 'DashboardSearch__Container'].map((n) => [n, window.__m.box(window.__m.sc(n))]).filter(([, v]) => v).map(([k, v]) => [k, { x: v.rect.x, y: v.rect.y, w: v.rect.w, h: v.rect.h, bg: v.bg, radius: v.radius, boxShadow: v.boxShadow }])));

    const reset = async () => {
      await page.mouse.up().catch(() => {});
      await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      await page.mouse.move(2, 450);
      await page.waitForTimeout(200);
    };
    const tag = async (expr, id) => {
      if (!expr) return null;
      const h = await page.evaluateHandle(`(() => { try { return ${expr}; } catch (e) { return null; } })()`);
      const el = h.asElement();
      if (!el) return null;
      await el.evaluate((e, n) => e.setAttribute(`data-mt-${n}`, ''), id);
      return page.locator(`[data-mt-${id}]`).first();
    };
    const untag = () => page.evaluate(() => document.querySelectorAll('*').forEach((n) => { for (const a of [...n.attributes]) if (a.name.startsWith('data-mt-')) n.removeAttribute(a.name); }));
    const centre = async (loc) => {
      await loc.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })).catch(() => {});
      await page.waitForTimeout(250);
    };
    const pointOf = (loc) => loc.evaluate((el) => {
      const r = [...el.getClientRects()].find((x) => x.width > 0 && x.height > 0) || el.getBoundingClientRect();
      return { x: r.x + Math.min(r.width / 2, 40), y: r.y + Math.min(r.height / 2, 20) };
    });
    const kbFocus = async (loc) => {
      await loc.evaluate((el) => el.focus());
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      let ok = await loc.evaluate((el) => document.activeElement === el);
      if (!ok) { await page.keyboard.press('Shift'); await loc.evaluate((el) => el.focus()); ok = await loc.evaluate((el) => document.activeElement === el); }
      await page.waitForTimeout(350);
      return { ok, matches: await loc.evaluate((el) => el.matches(':focus-visible')) };
    };

    const pending = [];
    for (const { spec, t } of targets) {
      const comp = (out.components[spec.key] ??= { states: {} });
      Object.assign(comp, { group: spec.group, name: spec.name, description: spec.desc });
      comp.pages = [...new Set([...(comp.pages || []), pkey])];
      const states = t.states || D;
      for (const st of states) {
        const state = t.as ? (st === 'default' ? t.as : `${t.as}-${st}`) : st;
        const id = `${spec.key}-${state}`;
        try {
          await reset();
          const loc = await tag(t.find, 'a');
          if (!loc) throw new Error('element not found');
          const hoverLoc = (t.hover && (await tag(t.hover, 'h'))) || loc;
          const focusLoc = (t.focus && (await tag(t.focus, 'f'))) || loc;
          if (t.crop !== false) await centre(loc);
          let via = 'at rest';
          let hovered;
          let focusInfo;
          if (st === 'hover') {
            const hp = await pointOf(hoverLoc);
            await page.mouse.move(hp.x, hp.y, { steps: 4 });
            await page.waitForTimeout(450);
            via = 'mouse hover';
            hovered = await loc.evaluate((el) => el.matches(':hover') || el.closest(':hover') !== null || !!el.querySelector(':hover'));
          } else if (st === 'focus-visible') {
            focusInfo = await kbFocus(focusLoc);
            via = 'keyboard: focus(), Shift+Tab, Tab';
          }
          const s = await styleOf(loc);
          if (hovered !== undefined) s.hovered = hovered;
          if (focusInfo) s.focus = focusInfo;
          if (t.extra && st === 'default') s.extra = await loc.evaluate((el, src) => (0, eval)(`(${src})`)(el), t.extra);
          if (st === 'default') s.rules = await loc.evaluate((el) => window.__m.rules(el));
          if (t.crop !== false) {
            const cl = t.crop ? (await tag(t.crop, 'c')) || loc : loc;
            const box = await cl.boundingBox();
            if (!box) throw new Error('no box');
            const pad = t.pad ?? 8;
            const vp = page.viewportSize();
            const x0 = Math.max(0, box.x - pad);
            const y0 = Math.max(0, box.y - pad);
            const clip = { x: x0, y: y0, width: Math.min(vp.width, box.x + box.width + pad) - x0, height: Math.min(vp.height, box.y + box.height + pad) - y0 };
            if (clip.width <= 0 || clip.height <= 0) throw new Error('off screen');
            const buf = await page.screenshot({ clip, animations: 'allow' });
            const hash = crypto.createHash('sha1').update(buf).digest('hex');
            const prefix = t.as || '';
            const dh = defaultHash.get(spec.key + '|' + prefix);
            if (st === 'default') defaultHash.set(spec.key + '|' + prefix, hash);
            if (st !== 'default' && dh === hash) {
              s.crop = `components/crops/${spec.key}-${t.as || 'default'}.png`;
              s.sameAsDefault = true;
            } else {
              const file = path.join(CROPS, `${id}.png`);
              fs.writeFileSync(file, buf);
              pending.push(file);
              s.crop = path.relative(REF, file);
            }
          }
          s.via = via;
          comp.states[state] = s;
          log('  ', id, `${s.rect.w}x${s.rect.h}`, via);
        } catch (e) {
          comp.states[state] = { error: String(e.message || e).slice(0, 200) };
          log('  !', id, String(e.message || e).slice(0, 120));
        } finally {
          await page.mouse.move(2, 450).catch(() => {});
          await untag();
        }
      }
    }
    quantize(pending);
    await page.close();
    save(out);
  }
  await browser.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

// The learner's own name for the workspace is redacted in the snapshots; if it ever shows up in a
// reading, the write is refused. The word is assembled here so this file never spells it out.
const REDACTED = new RegExp(['intern', 'bench'].join(''), 'i');

// Stable output: components in SPECS order, pages in PAGES order, states in
// default, hover, focus-visible order within each label.
function save(out) {
  const comps = {};
  for (const s of SPECS) {
    const c = out.components[s.key];
    if (!c) continue;
    const labels = [];
    for (const t of s.targets) for (const st of t.states || D) labels.push(t.as ? (st === 'default' ? t.as : `${t.as}-${st}`) : st);
    const states = {};
    for (const l of labels) if (c.states[l]) states[l] = c.states[l];
    for (const l of Object.keys(c.states)) if (!states[l]) states[l] = c.states[l];
    const pages = Object.keys(PAGES).filter((p) => (c.pages || []).includes(p));
    comps[s.key] = { group: c.group, name: c.name, description: c.description, pages, states };
  }
  const pages = {};
  for (const p of Object.keys(PAGES)) if (out.pages[p]) pages[p] = out.pages[p];
  const text = JSON.stringify({ _meta: out._meta, pages, components: comps }, null, 1) + '\n';
  if (REDACTED.test(text)) throw new Error('refusing to write: a redacted string survived in the measurements');
  fs.writeFileSync(OUT_JSON, text);
}

await run();
log('done', OUT_JSON);
