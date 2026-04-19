import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/react";
import { createNotebookSDK } from "../notebook-sdk";

function doc(...content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}
function p(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function heading(level: number, text: string): JSONContent {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

/**
 * Regression coverage for the empty-markdown guard on the AI-facing SDK.
 *
 * The guard rejects calls where the markdown argument is empty or
 * whitespace-only. It is intentionally conservative — it does NOT inspect
 * parsed AST shape. A traversal-based "is the parsed content meaningful"
 * check produced false positives in production against legitimate headings
 * such as `"## Test Note \u2605"`, so we only reject inputs that are always
 * wrong (empty / whitespace-only).
 */
describe("notebook SDK — empty-markdown guard", () => {
  it("valid heading replacement works (including emoji)", () => {
    const { sdk, destroy } = createNotebookSDK(doc(heading(2, "Test Note"), p("quack")));
    try {
      const h = sdk.find({ type: "heading", text: "Test Note" })[0];
      sdk.replace(h, "## Test Note \u{1F986}");
      const blocks = sdk.getBlocks();
      expect(blocks[0]).toMatchObject({
        type: "heading",
        level: 2,
        text: "Test Note \u{1F986}",
      });
      expect(blocks[1]).toMatchObject({ type: "paragraph", text: "quack" });
    } finally {
      destroy();
    }
  });

  it("valid heading replacement with star / non-ASCII passes the guard", () => {
    const { sdk, destroy } = createNotebookSDK(doc(heading(2, "Test Note"), p("quack")));
    try {
      const h = sdk.find({ type: "heading", text: "Test Note" })[0];
      expect(() => sdk.replace(h, "## Test Note \u2605")).not.toThrow();
    } finally {
      destroy();
    }
  });

  it("replace rejects empty string input", () => {
    const { sdk, getResult, destroy } = createNotebookSDK(doc(p("before"), p("after")));
    try {
      const b = sdk.find({ type: "paragraph", text: "before" })[0];
      expect(() => sdk.replace(b, "")).toThrow(/empty or whitespace-only/);
      expect(getResult()).toEqual(doc(p("before"), p("after")));
    } finally {
      destroy();
    }
  });

  it("replace rejects whitespace-only input", () => {
    const { sdk, getResult, destroy } = createNotebookSDK(doc(p("before"), p("after")));
    try {
      const b = sdk.find({ type: "paragraph", text: "before" })[0];
      expect(() => sdk.replace(b, "   \n  ")).toThrow(/empty or whitespace-only/);
      expect(getResult()).toEqual(doc(p("before"), p("after")));
    } finally {
      destroy();
    }
  });

  it("append / prepend reject empty input", () => {
    const { sdk, destroy } = createNotebookSDK(doc(p("existing")));
    try {
      expect(() => sdk.append("")).toThrow(/notebook\.append\(\)/);
      expect(() => sdk.append("   ")).toThrow(/empty or whitespace-only/);
      expect(() => sdk.prepend("")).toThrow(/notebook\.prepend\(\)/);
    } finally {
      destroy();
    }
  });

  it("insertAfter / insertBefore reject empty input", () => {
    const { sdk, destroy } = createNotebookSDK(doc(p("first"), p("second")));
    try {
      const b = sdk.find({ type: "paragraph", text: "first" })[0];
      expect(() => sdk.insertAfter(b, "")).toThrow(/notebook\.insertAfter\(\)/);
      expect(() => sdk.insertBefore(b, "   ")).toThrow(/notebook\.insertBefore\(\)/);
    } finally {
      destroy();
    }
  });

  it("structural nodes (horizontalRule) pass the guard", () => {
    const { sdk, destroy } = createNotebookSDK(doc(p("before"), p("after")));
    try {
      const b = sdk.find({ type: "paragraph", text: "before" })[0];
      expect(() => sdk.replace(b, "---")).not.toThrow();
      const blocks = sdk.getBlocks();
      expect(blocks[0]).toMatchObject({ type: "horizontalRule" });
    } finally {
      destroy();
    }
  });

  it("replace heading preserving level via template literal works", () => {
    const { sdk, destroy } = createNotebookSDK(doc(heading(2, "Test Note"), p("quack")));
    try {
      const h = sdk.find({ type: "heading", text: "Test Note" })[0];
      const hashes = "#".repeat(h.level ?? 1);
      sdk.replace(h, `${hashes} ${h.text} \u{1F986}`);
      const blocks = sdk.getBlocks();
      expect(blocks[0]).toMatchObject({
        type: "heading",
        level: 2,
        text: "Test Note \u{1F986}",
      });
    } finally {
      destroy();
    }
  });
});
