import { describe, it, expect, afterEach, vi } from "vitest";
import { confirm } from "../prompt.js";

const realIsTTY = process.stdin.isTTY;

afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", {
    value: realIsTTY,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe("confirm()", () => {
  it("returns the default (false) immediately when stdin is not a TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    expect(await confirm("Publish?")).toBe(false);
  });

  it("returns the explicit default when stdin is not a TTY and default is true", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    expect(await confirm("Continue?", { default: true })).toBe(true);
  });
});
