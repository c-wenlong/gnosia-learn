/**
 * The web app's house rules, as ESLint rules (eslint.config.mjs turns them on).
 *
 * Each one used to be a unit test that walked every file under apps/web/src
 * and grepped its text: about thirty walkers, each reading some 450 files on
 * every `npm test`, each with its own regex that a different spelling slipped
 * past, and each reporting at test time instead of at the line in the editor.
 * Here they read the syntax tree ESLint has already parsed, so a comment that
 * names a rule is never a hit and a string split over a `cx(...)` is read as
 * one. Every rule's cases are in gnosia.test.mjs.
 *
 * Where a rule allows a file (the kit that draws the element, the module that
 * owns the question), eslint.config.mjs says so with a reason beside it, so the
 * allowance and its reason sit in one place.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_SRC = path.resolve(HERE, "..", "apps", "web", "src");

// ---------------------------------------------------------------------------
// Helpers

/** A rule that reports every node one of its selectors matches, with that selector's message. */
function syntax(description, selectors) {
  return {
    meta: { type: "problem", docs: { description }, schema: [] },
    create(context) {
      return Object.fromEntries(
        Object.entries(selectors).map(([selector, message]) => [selector, (node) => context.report({ node, message })]),
      );
    },
  };
}

/** One rule out of several, each of whose visitors runs on the same node. */
function combine(description, ...rules) {
  return {
    meta: { type: "problem", docs: { description }, schema: [] },
    create(context) {
      const merged = {};
      for (const rule of rules) {
        for (const [selector, visit] of Object.entries(rule.create(context))) {
          const before = merged[selector];
          merged[selector] = before ? (node) => (before(node), visit(node)) : visit;
        }
      }
      return merged;
    },
  };
}

/** Whether `name` at `node` is the global: no scope around it declares it. */
function isGlobal(context, node, name) {
  for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable && variable.defs.length > 0) return false;
  }
  return true;
}

/** The text of a string literal, or of a template's literal parts joined by a space; null for anything else. */
function literalText(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral") return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(" ");
  return null;
}

/**
 * A rule that tests every string a file holds (string literals, templates,
 * and optionally JSX text) and reports the first test that matches.
 * `tests` is a list of `{ pattern, message }`; a message may use `{{found}}`.
 */
function strings(description, tests, { jsxText = false } = {}) {
  return {
    meta: { type: "problem", docs: { description }, schema: [] },
    create(context) {
      const check = (node, text) => {
        for (const { pattern, message } of tests) {
          const hit = pattern.exec(text);
          if (hit) {
            context.report({ node, message, data: { found: hit[0].trim() } });
            return;
          }
        }
      };
      const visitors = {
        Literal(node) {
          if (typeof node.value === "string") check(node, node.value);
        },
        TemplateLiteral(node) {
          check(node, literalText(node));
        },
      };
      if (jsxText) visitors.JSXText = (node) => check(node, node.value);
      return visitors;
    },
  };
}

/** The name of a JSX attribute or element, as written (`aria-label`, `Dialog`). */
function jsxName(name) {
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
  if (name.type === "JSXMemberExpression") return `${jsxName(name.object)}.${name.property.name}`;
  return "";
}

/** A JSX attribute's value as the literals it can be: `x="a"`, `x={"a"}`, `x={c ? "a" : "b"}`, `x={a ?? "b"}`. */
function literalsOf(node) {
  if (node == null) return [];
  if (node.type === "JSXExpressionContainer") return literalsOf(node.expression);
  if (node.type === "ConditionalExpression") return [...literalsOf(node.consequent), ...literalsOf(node.alternate)];
  if (node.type === "LogicalExpression" || node.type === "BinaryExpression") return [...literalsOf(node.left), ...literalsOf(node.right)];
  const text = literalText(node);
  return text === null ? [] : [text];
}

/** Every string literal and template part anywhere under `node`. */
function allLiterals(node, out = []) {
  if (node == null || typeof node !== "object") return out;
  const text = literalText(node);
  if (text !== null) out.push(text);
  if (node.type === "TemplateLiteral") {
    node.expressions.forEach((child) => allLiterals(child, out));
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    if (Array.isArray(value)) value.forEach((child) => allLiterals(child, out));
    else if (value && typeof value.type === "string") allLiterals(value, out);
  }
  return out;
}

const unwrapTs = (node) => {
  let at = node;
  while (at && (at.type === "TSAsExpression" || at.type === "TSSatisfiesExpression" || at.type === "TSNonNullExpression")) at = at.expression;
  return at;
};

// ---------------------------------------------------------------------------
// The kit's elements: one of each, drawn in components/ui

const kitSelect = syntax("Every dropdown is the kit's Select (a form) or FilterMenu (a filter).", {
  'JSXOpeningElement[name.name="select"]':
    "A native <select> opens the platform's own menu (macOS's blue list among them). Use the kit's Select, or FilterMenu for a filter.",
});

const kitDialog = syntax("Every modal is the kit's Dialog.", {
  'JSXOpeningElement[name.name="dialog"]':
    "Use the kit's Dialog: hand-written <dialog>s drifted apart in their backdrop, border, radius, motion and close beat (#359).",
});

const kitFields = syntax("Every fill-in field is the kit's: Combobox, Textarea, Checkbox.", {
  'JSXOpeningElement[name.name="datalist"]': "A <datalist> opens a list the platform draws. Use the kit's Combobox.",
  'JSXOpeningElement[name.name="textarea"]': "A raw <textarea> is a face drawn by hand. Use the kit's Textarea.",
  'JSXOpeningElement[name.name="input"] > JSXAttribute[name.name="type"][value.value="checkbox"]':
    "A raw checkbox is a face drawn by hand. Use the kit's Checkbox.",
});

const kitDetails = syntax("A menu is a kit Popover, never a <details>.", {
  'JSXOpeningElement[name.name="details"]':
    "A menu is the kit's Popover. A <details> that only folds text away needs its file allowed in eslint.config.mjs, with why.",
});

// A literal role, a role inside a JSX expression (`role={on ? "tab" : "group"}`), and one in spread props (`{ role: "tab" }`).
const ROLES = "/^(radiogroup|radio|tablist|tab)$/";
const kitRoles = syntax("Radio groups and tab rows are SegmentedControl and TabList.", {
  [`JSXAttribute[name.name="role"] Literal[value=${ROLES}]`]:
    "Use SegmentedControl for a choice of one, TabList for a row that switches panels: each hand-drawn copy had its own track, keys and roles (#359).",
  [`Property[key.name="role"] > Literal[value=${ROLES}]`]:
    "Use SegmentedControl for a choice of one, TabList for a row that switches panels: each hand-drawn copy had its own track, keys and roles (#359).",
  [`JSXAttribute[name.name="role"] TemplateLiteral[expressions.length=0] > TemplateElement[value.raw=${ROLES}]`]:
    "Use SegmentedControl for a choice of one, TabList for a row that switches panels: each hand-drawn copy had its own track, keys and roles (#359).",
  [`Property[key.name="role"] > TemplateLiteral[expressions.length=0] > TemplateElement[value.raw=${ROLES}]`]:
    "Use SegmentedControl for a choice of one, TabList for a row that switches panels: each hand-drawn copy had its own track, keys and roles (#359).",
});

const kitPopover = syntax("A popover is shown only through the kit Popover.", {
  'JSXAttribute[name.name="popover"]': "Show a popover through the kit's Popover, which keeps the layer stack and its keys.",
  'CallExpression[callee.property.name="showPopover"]': "Show a popover through the kit's Popover, which keeps the layer stack and its keys.",
});

const kitMenuBox = strings("The menu box (radius, border, face and inset) is drawn once, in classes.ts.", [
  {
    pattern: /^(?=.*\brounded-2xl\b)(?=.*(?:^|\s)border-2(?:\s|$))(?=.*(?:^|\s)bg-surface(?:\s|$))(?=.*(?:^|\s)p-1\.5(?:\s|$))/,
    message: "This is the menu box drawn by hand. Use MENU_PANEL or LIST_PANEL from components/ui/classes.ts.",
  },
]);

/** A file that draws a listbox or a menu takes the kit's box for it. */
const kitMenuPanel = {
  meta: { type: "problem", docs: { description: "Every listbox and menu sits in the kit's box." }, schema: [] },
  create(context) {
    const roles = [];
    let panel = false;
    return {
      'JSXAttribute[name.name="role"][value.value=/^(listbox|menu)$/]'(node) {
        roles.push(node);
      },
      "Identifier[name=/^(MENU_PANEL|LIST_PANEL)$/]"() {
        panel = true;
      },
      "Program:exit"() {
        if (panel) return;
        for (const node of roles) {
          context.report({ node, message: "Draw a listbox or menu in the kit's box: MENU_PANEL or LIST_PANEL from components/ui/classes.ts." });
        }
      },
    };
  },
};

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const kitFocusRing = {
  meta: { type: "problem", docs: { description: "The focus ring is declared once, in classes.ts." }, schema: [] },
  create(context) {
    return {
      VariableDeclarator(node) {
        const init = unwrapTs(node.init);
        if (init?.type === "TemplateLiteral" && init.expressions.length > 0) return;
        if (literalText(init) === FOCUS_RING) {
          context.report({ node, message: "The focus ring is FOCUS in components/ui/classes.ts; import it rather than declaring a copy." });
        }
      },
    };
  },
};

const kitTextLink = strings("Accent text links are linkClasses or TextLink.", [
  {
    pattern: /^(?=.*\btext-accent-text\b)(?=.*\bhover:underline\b)/,
    message: "An accent text link is TextLink, or linkClasses from components/ui/classes.ts.",
  },
]);

const kitGlyph = syntax("The close cross and the menu bars come from Glyph.", {
  'JSXAttribute[name.name="d"] > Literal[value=/^(M5 5l10 10M15 5L?\\s?5 15|M3\\.5 5\\.5h13M3\\.5 10h13)/]':
    "This path is one of Glyph's marks. Draw <Glyph name=...> instead.",
});

const kitNoSvg = syntax("A kit piece takes its marks from Glyph.", {
  'JSXOpeningElement[name.name="svg"]': "Take this piece's mark from Glyph rather than drawing an <svg> of its own.",
});

/** A padding utility, with or without variants: `pt-4`, `md:px-3`, `p-[3px]`. */
const PADDING = /(?:^|[\s:])p[xytrblse]?-(?:\d|\[|px\b)/;
const kitCollapsePadding = {
  meta: { type: "problem", docs: { description: "A Collapse or Reveal carries no padding on its own box." }, schema: [] },
  create(context) {
    return {
      'JSXOpeningElement[name.name=/^(Collapse|Reveal)$/] > JSXAttribute[name.name="className"]'(node) {
        if (allLiterals(node.value).some((text) => PADDING.test(text))) {
          context.report({
            node,
            message: "Padding on a fold's own box holds a shut fold open. Put the padding on a child inside it.",
          });
        }
      },
    };
  },
};

const kitCard = strings("Every card shell is cardClasses.", [
  {
    pattern: /rounded-\[20px\] border-2 border-border bg-surface/,
    message: "This is the card shell drawn by hand. Use Card, or cardClasses from components/ui/classes.ts.",
  },
]);

const kitTypingDots = syntax("One typing indicator, the kit's TypingDots.", {
  'Property[key.name="animationDelay"] > TemplateLiteral > BinaryExpression[operator="*"][right.value=180]':
    "This is the typing indicator drawn again. Use the kit's TypingDots.",
});

const GLOBALS = new Set(["window", "self", "globalThis"]);
/**
 * `window.confirm(...)`, and a chain of globals ending in it
 * (`globalThis.window.confirm`), rooted in a global no local binding shadows.
 * A bare `confirm()` is `no-restricted-globals`, which reads scope the same way.
 */
const kitConfirm = {
  meta: { type: "problem", docs: { description: "Ask in place, never through the browser's confirm()." }, schema: [] },
  create(context) {
    return {
      'CallExpression > MemberExpression.callee[property.name="confirm"]'(node) {
        let owner = node.object;
        while (owner.type === "MemberExpression" && !owner.computed && GLOBALS.has(owner.property.name)) owner = owner.object;
        if (owner.type !== "Identifier" || !GLOBALS.has(owner.name) || !isGlobal(context, owner, owner.name)) return;
        context.report({ node, message: "Ask in place with ConfirmFold or InlineConfirm, never through the browser's confirm()." });
      },
    };
  },
};

const WARN_TINT = /\bbg-warn-tint\b/;
/** A box's radius: a pill (`rounded-full`) or a tag (`rounded-sm`) is not a box. */
const BOX_RADIUS = /\brounded-(?:md|lg|xl|2xl|3xl)\b/;
/** A fixed height is a control (a button, a chip), not a box of words. */
const CONTROL_HEIGHT = /(?:^|\s)h-\d/;
const warnBox = (classes) => WARN_TINT.test(classes) && BOX_RADIUS.test(classes) && !CONTROL_HEIGHT.test(classes);

/**
 * A warn-tinted box is the kit's Callout. Each string is read alone, and each
 * `className={...}` and `cx(...)` whole, so classes split over several literals
 * (`cx("bg-warn-tint", "rounded-xl")`) are read together.
 */
const kitWarnBox = {
  meta: { type: "problem", docs: { description: "A warn-tinted box is the kit's Callout." }, schema: [] },
  create(context) {
    const message = "A warn-tinted box is the kit's Callout (or Notice or Banner): the warn box had been built five ways.";
    const whole = (node, expression) => {
      const texts = allLiterals(expression);
      if (texts.some(warnBox) || warnBox(texts.join(" "))) context.report({ node, message });
    };
    return {
      'JSXAttribute[name.name="className"]'(node) {
        if (node.value?.type === "JSXExpressionContainer") whole(node, node.value.expression);
        else if (warnBox(literalText(node.value) ?? "")) context.report({ node, message });
      },
      'CallExpression[callee.name="cx"]'(node) {
        if (node.parent.type === "JSXExpressionContainer" && node.parent.parent.type === "JSXAttribute" && jsxName(node.parent.parent.name) === "className") return;
        whole(node, { type: "ArrayExpression", elements: node.arguments });
      },
      "Literal, TemplateLiteral"(node) {
        const text = literalText(node);
        if (text === null || !warnBox(text)) return;
        if (context.sourceCode.getAncestors(node).some((a) => (a.type === "JSXAttribute" && jsxName(a.name) === "className") || (a.type === "CallExpression" && a.callee.name === "cx"))) return;
        context.report({ node, message });
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Class lists go through cx

const isClassName = (name) => name === "className" || name.endsWith("ClassName");

/** Why an expression is a class list built by hand, or undefined. Each branch of `? :` and the value side of `&&`, `||`, `??` is read. */
function handBuilt(raw) {
  const node = unwrapTs(raw);
  if (!node) return undefined;
  if (node.type === "ConditionalExpression") return handBuilt(node.consequent) ?? handBuilt(node.alternate);
  if (node.type === "LogicalExpression") {
    if (node.operator === "&&") return handBuilt(node.right);
    return handBuilt(node.left) ?? handBuilt(node.right);
  }
  if (node.type === "TemplateLiteral" && node.expressions.length > 0) return "a template string";
  if (node.type === "BinaryExpression" && node.operator === "+") return "a `+`";
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "join") return "a `.join`";
  return undefined;
}

/**
 * Every class list is built with `cx`, never by hand. `cx` merges (a later
 * class of the same property wins, so a caller's `className` beats a
 * component's own); a template string, a `+` or a `.join` only joins, and then
 * Tailwind's stylesheet order decides. A variable built that way and then used
 * in a className or a `cx(...)` in the same file counts too.
 */
const cxOnly = {
  meta: { type: "problem", docs: { description: "Class lists are built with cx." }, schema: [] },
  create(context) {
    const usedAsClasses = new Set();
    const built = new Map();
    // Only where a name is the value that lands in the list: a branch of `? :`,
    // the right of `&&`, either side of `||`, `??` and `+`, a template's
    // expressions, and an argument of a call whose result is the list.
    const collect = (raw) => {
      const node = unwrapTs(raw);
      if (!node) return;
      switch (node.type) {
        case "Identifier":
          usedAsClasses.add(node.name);
          break;
        case "ConditionalExpression":
          collect(node.consequent);
          collect(node.alternate);
          break;
        case "LogicalExpression":
          if (node.operator !== "&&") collect(node.left);
          collect(node.right);
          break;
        case "BinaryExpression":
          if (node.operator === "+") {
            collect(node.left);
            collect(node.right);
          }
          break;
        case "TemplateLiteral":
          node.expressions.forEach(collect);
          break;
        case "ArrayExpression":
          node.elements.forEach(collect);
          break;
        case "SpreadElement":
          collect(node.argument);
          break;
        case "CallExpression":
          node.arguments.forEach(collect);
          break;
        case "ObjectExpression":
          for (const property of node.properties) if (property.type === "Property") collect(property.value);
          break;
      }
    };
    const report = (node, name, how) => context.report({ node, message: `${name} is ${how}: build a class list with cx(...), which merges, rather than by hand.` });
    return {
      JSXAttribute(node) {
        const name = jsxName(node.name);
        if (!isClassName(name) || node.value?.type !== "JSXExpressionContainer" || node.value.expression.type === "JSXEmptyExpression") return;
        const how = handBuilt(node.value.expression);
        if (how) report(node, name, how);
        collect(node.value.expression);
      },
      Property(node) {
        if (node.computed || node.kind !== "init" || node.method || node.parent.type === "ObjectPattern") return;
        const name = node.key.type === "Identifier" ? node.key.name : typeof node.key.value === "string" ? node.key.value : undefined;
        if (name === undefined || !isClassName(name)) return;
        const how = handBuilt(node.value);
        if (how) report(node, name, how);
        collect(node.value);
      },
      'CallExpression[callee.name="cx"]'(node) {
        node.arguments.forEach(collect);
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || !node.init) return;
        const how = handBuilt(node.init);
        if (how) built.set(node.id.name, { node, how });
      },
      "Program:exit"() {
        for (const [name, { node, how }] of built) {
          if (usedAsClasses.has(name)) report(node, `${name}, used as a class list,`, how);
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Type: no text under 12px, and every <h1> a title role

const SMALL_STRING = [
  { pattern: /text-\[(\d+(?:\.\d+)?)px\]/g, px: (m) => Number(m[1]) },
  { pattern: /text-\[(\d*\.?\d+)rem\]/g, px: (m) => Number(m[1]) * 16 },
  { pattern: /font-size:\s*(\d+(?:\.\d+)?)px/g, px: (m) => Number(m[1]) },
  { pattern: /font-size:\s*(\d*\.?\d+)rem/g, px: (m) => Number(m[1]) * 16 },
];

/**
 * The least size an expression can be, as far as its literals say, or null
 * when they say nothing (a variable, arithmetic on one). `cond ? 12 : 11.5` is
 * 11.5; `Math.max(12, size - 2)` is 12, whatever `size` is.
 */
function leastSize(raw) {
  const node = unwrapTs(raw);
  if (!node) return null;
  if (node.type === "JSXExpressionContainer") return leastSize(node.expression);
  if (node.type === "Literal") {
    if (typeof node.value === "number") return node.value;
    if (typeof node.value === "string" && /^\d+(\.\d+)?$/.test(node.value.trim())) return Number(node.value);
    return null;
  }
  const known = (values) => values.filter((v) => v !== null);
  if (node.type === "ConditionalExpression" || node.type === "LogicalExpression") {
    const sides = known(node.type === "ConditionalExpression" ? [leastSize(node.consequent), leastSize(node.alternate)] : [leastSize(node.left), leastSize(node.right)]);
    return sides.length ? Math.min(...sides) : null;
  }
  if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.object.name === "Math") {
    const args = known(node.arguments.map(leastSize));
    if (args.length === 0) return null;
    const fn = node.callee.property.name;
    if (fn === "max") return Math.max(...args);
    if (fn === "min" || fn === "round" || fn === "floor" || fn === "ceil" || fn === "trunc") return Math.min(...args);
  }
  return null;
}

/**
 * No text under 12px (IMPLEMENTATION.md, "Type roles"): Tailwind's
 * `text-[Npx]` and `text-[Nrem]`, a `font-size` in a string, and a literal
 * `fontSize` in an attribute, a property or a variable. Option `allow`: the
 * exact source of each expression that may stay, which eslint.config.mjs
 * gives with its reason; an entry that matches nothing is reported as stale.
 */
const typeSize = {
  meta: {
    type: "problem",
    docs: { description: "No text under 12px." },
    schema: [{ type: "object", properties: { allow: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
  },
  create(context) {
    const allow = new Set(context.options[0]?.allow ?? []);
    const used = new Set();
    const message = "{{found}} is under 12px, the floor for text in the app (IMPLEMENTATION.md, Type roles).";
    const report = (node, found) => {
      if (allow.has(found)) {
        used.add(found);
        return;
      }
      context.report({ node, message, data: { found } });
    };
    const checkString = (node, text) => {
      for (const { pattern, px } of SMALL_STRING) {
        for (const m of text.matchAll(pattern)) if (px(m) < 12) report(node, m[0]);
      }
    };
    const checkFontSize = (node, value) => {
      const least = value ? leastSize(value) : null;
      if (least !== null && least < 12) report(node, context.sourceCode.getText(node));
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") checkString(node, node.value);
      },
      TemplateLiteral(node) {
        checkString(node, literalText(node));
      },
      'JSXAttribute[name.name="fontSize"]'(node) {
        checkFontSize(node, node.value);
      },
      'Property[key.name="fontSize"]'(node) {
        checkFontSize(node, node.value);
      },
      'VariableDeclarator[id.name="fontSize"]'(node) {
        checkFontSize(node, node.init);
      },
      "Program:exit"(node) {
        for (const entry of allow) {
          if (!used.has(entry)) context.report({ node, message: `The allowance "${entry}" matches nothing here any more; take it out of eslint.config.mjs.` });
        }
      },
    };
  },
};

const TITLE_ROLES = ["PAGE_TITLE", "CONCEPT_TITLE", "CLOSE_TITLE", "COLUMN_TITLE"];

/**
 * Every page title is one of the title constants in classes.ts. Option
 * `allow`: how many `<h1>`s in this file take none, each on purpose, which
 * eslint.config.mjs gives with its reason; a file with fewer than that is
 * reported, so a stale allowance does not hide a new one.
 */
const h1Role = {
  meta: {
    type: "problem",
    docs: { description: "Every <h1> takes a title role." },
    schema: [{ type: "object", properties: { allow: { type: "integer", minimum: 0 } }, additionalProperties: false }],
  },
  create(context) {
    const allow = context.options[0]?.allow ?? 0;
    const bare = [];
    return {
      'JSXOpeningElement[name.name="h1"]'(node) {
        const text = context.sourceCode.getText(node);
        if (!TITLE_ROLES.some((role) => text.includes(role))) bare.push(node);
      },
      "Program:exit"(program) {
        if (bare.length > allow) {
          for (const node of bare.slice(allow)) {
            context.report({ node, message: `Give this <h1> a title role (${TITLE_ROLES.join(", ")}) from components/ui/classes.ts.` });
          }
        } else if (bare.length < allow) {
          context.report({
            node: program,
            message: `eslint.config.mjs allows ${allow} <h1> without a title role here, and the file has ${bare.length}; lower the allowance.`,
          });
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Dialog headers, the IME, the tab keys

const dialogCloseMark = syntax("Only DialogHeader marks a Close with data-dialog-close.", {
  'JSXAttribute[name.name="data-dialog-close"]': "Only the kit's DialogHeader marks its Close with data-dialog-close. Draw a DialogHeader.",
  'Property[key.value="data-dialog-close"]': "Only the kit's DialogHeader marks its Close with data-dialog-close. Draw a DialogHeader.",
  'CallExpression[callee.property.name="setAttribute"][arguments.0.value="data-dialog-close"]':
    "Only the kit's DialogHeader marks its Close with data-dialog-close. Draw a DialogHeader.",
});

/** A file that renders the kit's Dialog (or DialogHeader) draws no Close of its own: that is a header built by hand. */
const dialogHeader = {
  meta: { type: "problem", docs: { description: "A dialog's Close is DialogHeader's." }, schema: [] },
  create(context) {
    let dialog = false;
    const closes = [];
    return {
      "JSXOpeningElement[name.name=/^(Dialog|DialogHeader)$/]"() {
        dialog = true;
      },
      'JSXOpeningElement[name.name="IconButton"] > JSXAttribute[name.name="label"]'(node) {
        if (literalsOf(node.value).includes("Close")) closes.push(node);
      },
      'JSXOpeningElement[name.name="button"] > JSXAttribute[name.name="aria-label"]'(node) {
        if (literalsOf(node.value).includes("Close")) closes.push(node);
      },
      "Program:exit"() {
        if (!dialog) return;
        for (const node of closes) {
          context.report({ node, message: "A dialog's Close is DialogHeader's (closeSize=\"sm\" for a row of small tools); this one is drawn by hand." });
        }
      },
    };
  },
};

const ime = syntax("composer-keys is the one place that asks about the IME.", {
  'MemberExpression[property.name="isComposing"]:not(CallExpression > MemberExpression.callee)':
    "Ask composerKey or isImeKey from components/ui/composer-keys.ts, the one place the IME is asked about.",
  'BinaryExpression[operator=/^[!=]==?$/][right.value=229]':
    "Ask composerKey or isImeKey from components/ui/composer-keys.ts, the one place the IME is asked about.",
});

const rovingKeys = syntax("A tab row moves by tabKeyIndex.", {
  'BinaryExpression[operator="%"][left.type="BinaryExpression"][left.operator=/^[+-]$/]':
    "Move with tabKeyIndex from components/ui/roving.ts rather than wrapping the index by hand.",
});

/**
 * One mapper from a save's state to LiveStatus's words and tone, in
 * save-status.ts. Only a file that draws a status line (LiveStatus, or a
 * FormRow's status) is read; a mapper is a state's `kind` tied to a tone, as a
 * ternary or as a `case` returning one.
 */
const saveStatus = {
  meta: { type: "problem", docs: { description: "One save-status mapper, SaveStatus." }, schema: [] },
  create(context) {
    let drawsStatus = false;
    const mappers = [];
    return {
      "Identifier[name=/^(LiveStatus|FormRow)$/], JSXIdentifier[name=/^(LiveStatus|FormRow)$/]"() {
        drawsStatus = true;
      },
      'ConditionalExpression:has(MemberExpression[property.name="kind"]):has(Literal[value=/^(ok|danger)$/])'(node) {
        if (node.parent.type !== "ConditionalExpression") mappers.push(node);
      },
      'SwitchCase > ReturnStatement > ObjectExpression > Property[key.name="tone"]'(node) {
        mappers.push(node);
      },
      "Program:exit"() {
        if (!drawsStatus) return;
        for (const node of mappers) {
          context.report({ node, message: "Map a save's state to LiveStatus's words and tone with SaveStatus (components/ui/save-status.ts)." });
        }
      },
    };
  },
};

const IMAGE_NAME = "/(img|image|picture|poster|thumb|cover|photo)/i";
const imageReveal = syntax("The complete-before-onLoad check is written once, in use-image-reveal.", {
  [`MemberExpression[property.name="complete"][object.name=${IMAGE_NAME}]`]:
    "Use useImageReveal (components/ui/use-image-reveal.ts) for a picture that may be complete before onLoad.",
  [`MemberExpression[property.name="complete"][object.property.name=${IMAGE_NAME}]`]:
    "Use useImageReveal (components/ui/use-image-reveal.ts) for a picture that may be complete before onLoad.",
  'MemberExpression[property.name="complete"][object.property.name="current"]':
    "Use useImageReveal (components/ui/use-image-reveal.ts) for a picture that may be complete before onLoad.",
  'LogicalExpression:has(MemberExpression[property.name="complete"]):has(MemberExpression[property.name="naturalWidth"]):not(LogicalExpression > LogicalExpression)':
    "Use useImageReveal (components/ui/use-image-reveal.ts) for a picture that may be complete before onLoad.",
});

const plainClick = syntax("isPlainClick is the one test of a modified click.", {
  'LogicalExpression:has(MemberExpression[property.name="button"]):has(MemberExpression[property.name=/^(metaKey|ctrlKey)$/]):not(LogicalExpression > LogicalExpression)':
    "Ask isPlainClick (lib/plain-click.ts) whether a click is the main button with no modifier.",
});

const motion = syntax("lib/motion.ts is the one place that asks whether to keep still.", {
  "Literal[value=/^\\(\\s*prefers-reduced-motion/]":
    "Ask prefersReducedMotion() (lib/motion.ts), which reads Settings' choice as well as the device's.",
  "TemplateElement[value.raw=/^\\(\\s*prefers-reduced-motion/]":
    "Ask prefersReducedMotion() (lib/motion.ts), which reads Settings' choice as well as the device's.",
  'Property[key.name="behavior"][value.value="smooth"]': "A hard-coded smooth scroll ignores reduced motion; use scrollBehavior() (lib/motion.ts).",
  'ConditionalExpression[consequent.value="auto"][alternate.value="smooth"]': "Choose the scroll's behaviour with scrollBehavior() (lib/motion.ts).",
  'FunctionDeclaration[id.name="reducedMotion"], VariableDeclarator[id.name="reducedMotion"]':
    "A wrapper over prefersReducedMotion is a second name for one question; call prefersReducedMotion().",
});

const clientCookie = syntax("One way to write a cookie from the browser, writeCookie.", {
  'AssignmentExpression[left.object.name="document"][left.property.name="cookie"]': "Write a cookie with writeCookie (lib/client-cookie.ts).",
});

/**
 * Records keyed by a slug someone else chose are read through ownValue, since a
 * bare `record[key]` reaches `constructor` and the rest through the prototype.
 * Option `names`: the records this file holds.
 */
const ownKey = {
  meta: {
    type: "problem",
    docs: { description: "Slug-keyed records are read through ownValue." },
    schema: [{ type: "object", properties: { names: { type: "array", items: { type: "string" } } }, additionalProperties: false }],
  },
  create(context) {
    const names = new Set(context.options[0]?.names ?? []);
    return {
      "MemberExpression[computed=true]"(node) {
        if (node.object.type !== "Identifier" || !names.has(node.object.name)) return;
        if (node.property.type === "Literal" && typeof node.property.value === "number") return;
        context.report({ node, message: `Read ${node.object.name} through ownValue (lib/own-key.ts): a bare index reaches the prototype.` });
      },
    };
  },
};

// ---------------------------------------------------------------------------
// The studio

const studioJobState = syntax("A job's state is printed only through jobStateLabel.", {
  'JSXElement > JSXExpressionContainer > MemberExpression[property.name="state"]':
    "This prints a state's enum value on screen; print jobStateLabel(...) (lib/studio-job-state.ts).",
});

const SHADOWING = "/^(Button|ButtonLink|Chip|ChipLink)$/";
const studioExports = syntax("The studio exports none of the kit's names.", {
  [`ExportNamedDeclaration > FunctionDeclaration[id.name=${SHADOWING}]`]: "The studio uses the kit's Button, ButtonLink, Chip and ChipLink; do not export its own.",
  [`ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=${SHADOWING}]`]:
    "The studio uses the kit's Button, ButtonLink, Chip and ChipLink; do not export its own.",
  [`ExportSpecifier[exported.name=${SHADOWING}]`]: "The studio uses the kit's Button, ButtonLink, Chip and ChipLink; do not export its own.",
});
const studioKit = combine(
  "The studio's controls are the kit's.",
  studioExports,
  strings("A small bordered control is the kit's.", [
    {
      pattern: /^(?=.*(?:^|\s)h-[5-9](?:\s|$))(?=.*(?:^|\s)rounded-md(?:\s|$))(?=.*(?:^|\s)border(?:\s|$))/,
      message: "This is a small bordered control drawn by hand; use the kit's Button or Chip at the studio's density.",
    },
  ]),
);

/** `requireStudio()` or `await requireStudio()` as a statement. */
const isGate = (statement) => {
  if (statement?.type !== "ExpressionStatement") return false;
  const call = statement.expression.type === "AwaitExpression" ? statement.expression.argument : statement.expression;
  return call.type === "CallExpression" && call.callee.type === "Identifier" && call.callee.name === "requireStudio" && call.arguments.length === 0;
};

/**
 * D11's gate: production, where STUDIO_ENABLED is unset, serves 404 for every
 * studio surface. Every exported function of a studio entry point (a page, a
 * layout, a route handler, `generateMetadata`, each server action, each its
 * own endpoint) calls `requireStudio()` as its first statement, before it
 * awaits or reads anything. eslint.config.mjs applies this to every such file
 * under app/(app)/studio, so a new route is held to it the day it lands.
 */
const studioGate = {
  meta: { type: "problem", docs: { description: "Every studio entry point calls requireStudio() first." }, schema: [] },
  create(context) {
    let entries = 0;
    const check = (fn, name, node) => {
      entries += 1;
      if (fn.body.type !== "BlockStatement" || !isGate(fn.body.body[0])) {
        context.report({ node, message: `${name} must call requireStudio() as its first statement, so a disabled studio is a 404 before anything runs (D11).` });
      }
    };
    const exported = (declaration, node) => {
      if (!declaration) return;
      if (declaration.type === "FunctionDeclaration" || declaration.type === "ArrowFunctionExpression" || declaration.type === "FunctionExpression") {
        check(declaration, declaration.id?.name ?? "The default export", node);
      } else if (declaration.type === "VariableDeclaration") {
        for (const d of declaration.declarations) {
          const init = unwrapTs(d.init);
          if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") check(init, d.id.name, d);
        }
      }
    };
    /** A function this module declares at its top level, by name: `function f`, or `const f = () => {}`. */
    const local = (name) => {
      for (const statement of context.sourceCode.ast.body) {
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type === "FunctionDeclaration" && declaration.id?.name === name) return declaration;
        if (declaration?.type === "VariableDeclaration") {
          for (const d of declaration.declarations) if (d.id.type === "Identifier" && d.id.name === name) return unwrapTs(d.init);
        }
      }
      return null;
    };
    const byName = (name, exportedAs, node) => {
      const fn = local(name);
      if (fn && (fn.type === "FunctionDeclaration" || fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression")) check(fn, exportedAs, node);
    };
    return {
      ExportNamedDeclaration(node) {
        if (node.source) context.report({ node, message: "A studio entry point re-exports nothing: write the function here, gated with requireStudio()." });
        exported(node.declaration, node);
        if (!node.source) for (const specifier of node.specifiers) byName(specifier.local.name, specifier.exported.name, specifier);
      },
      ExportDefaultDeclaration(node) {
        if (node.declaration.type === "Identifier") byName(node.declaration.name, "The default export", node);
        else exported(node.declaration, node);
      },
      "Program:exit"(node) {
        if (entries === 0) context.report({ node, message: "No exported function found to hold the studio's gate; every entry point here calls requireStudio() first." });
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Theme tokens

const GLOBALS_CSS = path.join(WEB_SRC, "app", "globals.css");
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/;
const FUNCTIONAL = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
const PALETTE_NAMES =
  "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
// Any palette name and step, with or without a utility before it: `text-red-600`, `dark:hover:bg-amber-950/40`, a bare "red-600".
const PALETTE = new RegExp(`(?<![A-Za-z0-9_])(?:${PALETTE_NAMES})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![A-Za-z0-9_])`);

/**
 * The pre-redesign palette's names, which globals.css kept as aliases until the
 * last old page moved (#359, 2026-10-05). Each was replaced by its token's own
 * name; `--surface-raised` is a token of its own and stays.
 */
export const RETIRED_TOKENS = [
  "background",
  "foreground",
  "muted",
  "muted-strong",
  "surface-hover",
  "sidebar-bg",
  "header-bg",
  "chip-bg",
  "nav-active-bg",
  "accent-strong",
  "warn-bg",
  "warn-border",
  "danger-bg",
  "danger-border",
];
const ALIAS_READ = new RegExp(`var\\(--(?:${RETIRED_TOKENS.join("|")})\\)`);

/** Every colour the `@theme inline` block makes a utility of (`bg-surface2`, `text-text2`), read from globals.css once. */
let bracketed;
function bracketedToken() {
  if (bracketed === undefined) {
    const tokens = [...readFileSync(GLOBALS_CSS, "utf8").matchAll(/--color-([a-z0-9-]+):\s*var\(--\1\)/g)].map((m) => m[1]);
    bracketed = new RegExp(`-\\[var\\(--(?:${tokens.join("|")})\\)\\]`);
  }
  return bracketed;
}

/**
 * Every colour reads a token from app/globals.css: four palettes and six
 * modes (AGENTS.md, "The theme is six modes on two axes"), and a colour typed
 * into a component is right in at most one of them. `black` and `white` are
 * not palette colours and pass, which is what the video chrome uses over a
 * picture that is the same in every mode.
 */
const themeTokens = {
  meta: {
    type: "problem",
    docs: { description: "Every colour is a theme token." },
    schema: [{ type: "object", properties: { colours: { type: "boolean" } }, additionalProperties: false }],
  },
  create(context) {
    // `colours: false`: a file that draws in fixed colours on purpose (the brand
    // pages, pixel art); the retired aliases and bracketed tokens stay banned.
    const colours = context.options[0]?.colours !== false;
    const check = (node, text) => {
      const colour = colours ? (text.match(HEX) ?? text.match(FUNCTIONAL) ?? text.match(PALETTE)) : null;
      if (colour) {
        context.report({ node, message: `${colour[0]} is a colour typed in; read a token from app/globals.css (bg-ok, text-danger, var(--border)).` });
        return;
      }
      const alias = text.match(ALIAS_READ);
      if (alias) {
        context.report({ node, message: `${alias[0]} is a retired alias; read the token it stood for.` });
        return;
      }
      const wrapped = text.match(bracketedToken());
      if (wrapped) context.report({ node, message: `${wrapped[0]}: write the token's own utility (bg-surface2 for bg-[var(--surface2)]), so its name is the one thing to grep.` });
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateLiteral(node) {
        check(node, literalText(node));
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Sentence case

/** A class token that uppercases or tracks out, with any variant prefix. */
export const CASE_CLASSES = [
  { name: "an uppercase class", pattern: /(?:^|[\s"'`])(?:[\w-]+:)*uppercase(?=$|[\s"'`])/ },
  { name: "a text-transform", pattern: /text-transform:\s*uppercase/ },
  { name: "wide tracking", pattern: /(?:^|[\s"'`])(?:[\w-]+:)*tracking-(?:wide|wider|widest)(?=$|[\s"'`])/ },
  { name: "positive tracking", pattern: /(?:^|[\s"'`])(?:[\w-]+:)*tracking-\[\+?0?\.\d+(?:em|rem|px)\]/ },
];

/** No lower-case letter, a word of four capitals or more, and five capitals in all: "PLANNER", not "SVG". */
const SHOUTED = /^(?=[^a-z]*$)(?=.*[A-Z]{4})(?=(?:[^A-Z]*[A-Z]){5})[A-Z0-9 ·:&'-]+$/;

/** Props whose string reaches the reader, on screen or through a screen reader. */
const COPY_PROPS = new Set([
  "label",
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "alt",
  "heading",
  "headline",
  "subtitle",
  "eyebrow",
  "caption",
  "description",
  "meta",
  "hint",
  "short",
  "sendLabel",
  "disabledReason",
]);

/**
 * No all-caps in the interface (AGENTS.md, "Sentence case, and no label that
 * repeats the page"): no uppercase class or positive tracking in a string, no
 * JSX text typed in capitals, and none in a prop that becomes copy or an
 * accessible name. An acronym of four letters or fewer passes.
 */
const sentenceCase = {
  meta: { type: "problem", docs: { description: "Sentence case: no uppercase, no wide tracking, no shouted copy." }, schema: [] },
  create(context) {
    const classes = (node, text) => {
      const rule = CASE_CLASSES.find(({ pattern }) => pattern.test(text));
      if (rule) context.report({ node, message: `This string has ${rule.name}; the interface is sentence case (docs/design/DESIGN.md).` });
    };
    const shouted = (node, values) => {
      if (values.some((value) => SHOUTED.test(value.trim()))) {
        context.report({ node, message: "This copy is typed in capitals; write it in sentence case (docs/design/DESIGN.md)." });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") classes(node, node.value);
      },
      TemplateElement(node) {
        classes(node, node.value.cooked ?? node.value.raw);
      },
      JSXText(node) {
        const value = node.value.trim();
        if (value !== "") shouted(node, [value]);
      },
      JSXAttribute(node) {
        if (COPY_PROPS.has(jsxName(node.name))) shouted(node, literalsOf(node.value));
      },
      "JSXElement > JSXExpressionContainer, JSXFragment > JSXExpressionContainer"(node) {
        shouted(node, literalsOf(node.expression));
      },
    };
  },
};

// ---------------------------------------------------------------------------
// A field's text is 16px

/** Fields that draw no text, so Safari has nothing to zoom for. */
const NO_TEXT = new Set(["hidden", "checkbox", "radio", "range", "file", "submit", "button", "image", "color"]);

/** The first whole class token with no variant prefix and a size under 16px, if any. */
export function smallFieldText(literal) {
  return literal.split(/\s+/).find((token) => {
    if (token === "text-xs" || token === "text-sm") return true;
    const px = /^text-\[([0-9.]+)px\]$/.exec(token);
    if (px) return Number(px[1]) < 16;
    const rem = /^text-\[([0-9.]+)rem\]$/.exec(token);
    return rem ? Number(rem[1]) < 1 : false;
  });
}

/**
 * A form field's text is 16px on anything touched: iOS Safari zooms the page
 * when it focuses a field under 16px and leaves it zoomed. No `<input>`,
 * `<textarea>` or `<select>` carries a bare size under 16px of its own; a
 * class held in a constant is read through the constant, local or imported
 * one module away (Greptile on #245), so keep the size in FIELD_TEXT.
 *
 * Constants are followed with the TypeScript parser, one module away, since
 * ESLint sees one file at a time.
 */
const fieldText = {
  meta: { type: "problem", docs: { description: "A field's text is 16px." }, schema: [] },
  create(context) {
    const parsed = new Map();
    const parse = (file, text) => {
      if (!parsed.has(file)) parsed.set(file, ts.createSourceFile(file, text ?? readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
      return parsed.get(file);
    };
    const resolveModule = (from, specifier) => {
      const base = specifier.startsWith("@/") ? path.join(WEB_SRC, specifier.slice(2)) : specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : undefined;
      if (base === undefined) return undefined;
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        try {
          readFileSync(candidate);
          return candidate;
        } catch {
          /* try the next one */
        }
      }
      return undefined;
    };
    const constInit = (tree, name) => {
      let found;
      const visit = (node) => {
        if (found) return;
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
          found = node.initializer;
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
      return found;
    };
    const declaration = (tree, name) => {
      const local = constInit(tree, name);
      if (local) return { tree, init: local };
      for (const statement of tree.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        const element = bindings.elements.find((e) => e.name.text === name);
        if (!element) continue;
        const file = resolveModule(tree.fileName, statement.moduleSpecifier.text);
        if (!file) return undefined;
        const other = parse(file);
        const init = constInit(other, (element.propertyName ?? element.name).text);
        return init ? { tree: other, init } : undefined;
      }
      return undefined;
    };
    const literals = (node, out) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
      else if (ts.isTemplateExpression(node)) out.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text));
      ts.forEachChild(node, (child) => literals(child, out));
    };
    const fieldLiterals = (tree, node, out, seen = new Set()) => {
      literals(node, out);
      const visit = (child) => {
        if (ts.isIdentifier(child) && child.text !== "FIELD_TEXT") {
          const key = `${tree.fileName}#${child.text}`;
          if (!seen.has(key)) {
            seen.add(key);
            const found = declaration(tree, child.text);
            if (found) fieldLiterals(found.tree, found.init, out, seen);
          }
        }
        ts.forEachChild(child, visit);
      };
      visit(node);
    };
    return {
      Program(program) {
        const text = context.sourceCode.text;
        if (!/<(?:input|textarea|select)\b/.test(text)) return;
        const tree = parse(context.filename, text);
        const visit = (node) => {
          if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag = node.tagName.getText(tree);
            if (tag === "input" || tag === "textarea" || tag === "select") {
              const type = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(tree) === "type")?.initializer;
              const kind = type !== undefined && ts.isStringLiteral(type) ? type.text : "";
              if (!NO_TEXT.has(kind)) {
                const found = [];
                fieldLiterals(tree, node, found);
                for (const literal of found) {
                  const hit = smallFieldText(literal);
                  if (hit) {
                    const start = tree.getLineAndCharacterOfPosition(node.getStart(tree));
                    context.report({
                      node: program,
                      loc: { line: start.line + 1, column: start.character },
                      message: `This <${tag}> sets ${hit}, under 16px, and iOS Safari zooms the page when it is focused. Take the size from FIELD_TEXT.`,
                    });
                  }
                }
              }
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(tree);
      },
    };
  },
};

// ---------------------------------------------------------------------------

const plugin = {
  meta: { name: "gnosia" },
  rules: {
    "kit-select": kitSelect,
    "kit-dialog": kitDialog,
    "kit-fields": kitFields,
    "kit-details": kitDetails,
    "kit-roles": kitRoles,
    "kit-popover": kitPopover,
    "kit-menu-box": kitMenuBox,
    "kit-menu-panel": kitMenuPanel,
    "kit-focus-ring": kitFocusRing,
    "kit-text-link": kitTextLink,
    "kit-glyph": kitGlyph,
    "kit-no-svg": kitNoSvg,
    "kit-collapse-padding": kitCollapsePadding,
    "kit-card": kitCard,
    "kit-typing-dots": kitTypingDots,
    "kit-confirm": kitConfirm,
    "kit-warn-box": kitWarnBox,
    "cx-only": cxOnly,
    "type-size": typeSize,
    "h1-role": h1Role,
    "dialog-close-mark": dialogCloseMark,
    "dialog-header": dialogHeader,
    ime,
    "roving-keys": rovingKeys,
    "save-status": saveStatus,
    "image-reveal": imageReveal,
    "plain-click": plainClick,
    motion,
    "client-cookie": clientCookie,
    "own-key": ownKey,
    "studio-job-state": studioJobState,
    "studio-kit": studioKit,
    "studio-gate": studioGate,
    "theme-tokens": themeTokens,
    "sentence-case": sentenceCase,
    "field-text": fieldText,
  },
};

export default plugin;
