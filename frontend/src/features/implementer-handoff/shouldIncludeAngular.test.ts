import { shouldIncludeAngular } from "./frameworkGate";

describe("shouldIncludeAngular", () => {
  it("defaults to true when no framework is detected", () => {
    expect(shouldIncludeAngular(null)).toBe(true);
    expect(shouldIncludeAngular("")).toBe(true);
    expect(shouldIncludeAngular("unknown")).toBe(true);
    expect(shouldIncludeAngular("UNKNOWN")).toBe(true);
  });

  it("is true for Angular projects (case-insensitive)", () => {
    expect(shouldIncludeAngular("angular")).toBe(true);
    expect(shouldIncludeAngular("Angular")).toBe(true);
  });

  it("skips the Angular scaffold for React and Vue projects", () => {
    expect(shouldIncludeAngular("react")).toBe(false);
    expect(shouldIncludeAngular("next")).toBe(false);
    expect(shouldIncludeAngular("vue")).toBe(false);
    expect(shouldIncludeAngular("svelte")).toBe(false);
  });
});
