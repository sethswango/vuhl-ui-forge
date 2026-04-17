import { convertHtmlToAngular } from "./index";

describe("convertHtmlToAngular", () => {
  test("simple button with onclick becomes (click) binding and stubs handler", () => {
    const { template, componentTs, imports } = convertHtmlToAngular(
      `<button onclick="handleClick()" class="bg-blue-500 text-white">Click me</button>`,
      { componentName: "ButtonDemoComponent" },
    );

    expect(template).toBe(
      `<button (click)="handleClick()" class="bg-blue-500 text-white">\n  Click me\n</button>`,
    );
    expect(template).not.toMatch(/onclick/);
    expect(componentTs).toContain("angular-convert heuristics: onclick-to-click");
    expect(componentTs).toContain("handleClick(_event?: Event): void");
    expect(componentTs).toContain(
      "selector: 'app-button-demo'",
    );
    expect(imports).toEqual(["@angular/core"]);
  });

  test("plain unordered list is folded into an @for block with items array", () => {
    const { template, componentTs } = convertHtmlToAngular(
      `<ul class="space-y-2"><li>One</li><li>Two</li><li>Three</li></ul>`,
    );

    expect(template).toContain(`<ul class="space-y-2">`);
    expect(template).toContain(`@for (item of items; track $index) {`);
    expect(template).toContain(`<li>\n      {{ item }}\n    </li>`);
    expect(template).toContain(`}`);
    expect(componentTs).toContain(`items = ["One", "Two", "Three"];`);
    expect(componentTs).toContain("angular-convert heuristics");
    expect(componentTs).toContain("list-to-for");
  });

  test("data-if becomes an @if wrapper and seeds a boolean field", () => {
    const { template, componentTs } = convertHtmlToAngular(
      `<div data-if="showError" class="text-red-500" role="alert">Something broke</div>`,
    );

    expect(template).toContain(`@if (showError) {`);
    expect(template).toContain(`<div class="text-red-500" role="alert">`);
    expect(template).toContain(`Something broke`);
    expect(template).not.toMatch(/data-if/);
    expect(componentTs).toContain("showError = false;");
    expect(componentTs).toContain("data-if-to-if");
  });

  test("input with onchange becomes (change) binding and preserves aria/tailwind attrs", () => {
    const { template, componentTs } = convertHtmlToAngular(
      `<input type="text" onchange="onNameChange($event)" aria-label="Name" data-testid="name-input" class="border rounded px-2" />`,
    );

    expect(template).toBe(
      `<input type="text" (change)="onNameChange($event)" aria-label="Name" data-testid="name-input" class="border rounded px-2" />`,
    );
    expect(template).not.toMatch(/onchange=/);
    expect(componentTs).toContain("onNameChange(_event?: Event): void");
    expect(componentTs).toContain("onchange-to-change");
  });

  test("signals mode wraps seeded fields in signal()", () => {
    const { componentTs } = convertHtmlToAngular(
      `<div data-if="isOpen"><span>Hi</span></div>`,
      { useSignals: true },
    );

    expect(componentTs).toContain("import { Component, signal } from '@angular/core';");
    expect(componentTs).toContain("isOpen = signal(false);");
  });

  test("non-list siblings are left untransformed", () => {
    const { template, componentTs } = convertHtmlToAngular(
      `<section><h1>Hi</h1><p>Body</p></section>`,
    );

    expect(template).toContain("<h1>\n    Hi\n  </h1>");
    expect(template).toContain("<p>\n    Body\n  </p>");
    expect(template).not.toContain("@for");
    expect(componentTs).toContain("no heuristics fired");
  });
});
