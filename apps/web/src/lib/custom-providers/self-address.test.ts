import { describe, expect, it } from "vitest";

import { pointsAtThisApp } from "./self-address";

describe("pointsAtThisApp", () => {
  const app = "http://localhost:3000/api/learner/custom-provider";

  it("refuses the studio runner's port, default or moved, and the app's own", () => {
    expect(pointsAtThisApp("http://127.0.0.1:7250/v1", app, {})).toBe(true);
    expect(pointsAtThisApp("http://localhost:7300", app, { STUDIO_PORT: "7300" })).toBe(true);
    expect(pointsAtThisApp("http://[::1]:3000/v1", app, {})).toBe(true);
    expect(pointsAtThisApp("http://localhost:4000/v1", "http://127.0.0.1:8080/x", { PORT: "4000" })).toBe(true);
    expect(pointsAtThisApp("https://localhost/v1", "https://localhost/api/learner/custom-provider", {})).toBe(true);
  });

  it("lets a local model server and every remote host through", () => {
    expect(pointsAtThisApp("http://localhost:11434/v1", app, {})).toBe(false);
    expect(pointsAtThisApp("http://127.0.0.1:1234/v1", app, {})).toBe(false);
    expect(pointsAtThisApp("https://gw.example:7250/v1", app, {})).toBe(false);
    expect(pointsAtThisApp("not a url", app, {})).toBe(false);
    expect(pointsAtThisApp(undefined, app, {})).toBe(false);
  });
});
