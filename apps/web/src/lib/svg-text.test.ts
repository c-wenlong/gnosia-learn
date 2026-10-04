import { describe, expect, it } from "vitest";

import { svgText } from "./svg-text";

describe("svgText", () => {
  it("reads labels from <text> and <foreignObject>, one per line, and drops styles, scripts and defs", () => {
    const svg = `<svg><style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style><defs><g><text>hidden</text></g></defs>
      <script>alert(1)</script><!-- a note --><text x="1"><tspan>u</tspan></text>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><span>The arrow   never moved.</span></div></foreignObject>
      <path d="M0 0L10 10"/><text>[ 2&#8730;2, &#x221A;2 ]</text><text>a &amp; b &lt; c</text></svg>`;
    expect(svgText(svg)).toBe("u\nThe arrow never moved.\n[ 2√2, √2 ]\na & b < c");
  });

  it("keeps the text of a CDATA section, a < inside it included", () => {
    expect(svgText("<svg><text><![CDATA[a < b && c > d]]></text><text>e</text></svg>")).toBe("a < b && c > d\ne");
  });

  it("leaves an unknown or out-of-range entity as written", () => {
    expect(svgText("<text>&bogus; &#99999999;</text>")).toBe("&bogus; &#99999999;");
  });
});
