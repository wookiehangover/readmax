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
 * Regression coverage for the empty-content guard on the AI-facing SDK.
 *
 * Repro of the reported bug: the AI wrote `notebook.replace(heading, "## ")`
 * (hashes with no text after), which previously parsed into a heading node
 * with no text content and silently produced an empty heading. The guard
 * now throws so the tool call fails and the notebook is preserved.
 */
describe("notebook SDK — empty content guard", () => {
  it("valid heading replacement still works", () => {
    const { sdk, destroy } = createNotebookSDK(doc(heading(2, "Test Note 2"), p("quack")));
    try {
      const h = sdk.find({ type: "heading", text: "Test Note 2" })[0];
      sdk.replace(h, "## Test Note 2 \u{1F986}");
      const blocks = sdk.getBlocks();
      expect(blocks[0]).toMatchObject({
        type: "heading",
        level: 2,
        text: "Test Note 2 \u{1F986}",
      });
      expect(blocks[1]).toMatchObject({ type: "paragraph", text: "quack" });
    } finally {
      destroy();
    }
  });

  it("replace rejects '## ' (hashes with no text, previously produced empty heading)", () => {
    const { sdk, getResult, destroy } = createNotebookSDK(
      doc(heading(2, "Test Note 2"), p("quack")),
    );
    try {
      const h = sdk.find({ type: "heading", text: "Test Note 2" })[0];
      expect(() => sdk.replace(h, "## ")).toThrow(/parsed to empty content/);
      // Notebook is untouched.
      expect(getResult()).toEqual(doc(heading(2, "Test Note 2"), p("quack")));
    } finally {
      destroy();
    }
  });

  it("replace rejects empty string input", () => {
    const { sdk, getResult, destroy } = createNotebookSDK(doc(p("before"), p("after")));
    try {
      const b = sdk.find({ type: "paragraph", text: "before" })[0];
      expect(() => sdk.replace(b, "")).toThrow(/parsed to empty content/);
      expect(getResult()).toEqual(doc(p("before"), p("after")));
    } finally {
      destroy();
    }
  });

  it("replace rejects whitespace-only input", () => {
    const { sdk, getResult, destroy } = createNotebookSDK(doc(p("before"), p("after")));
    try {
      const b = sdk.find({ type: "paragraph", text: "before" })[0];
      expect(() => sdk.replace(b, "   \n  ")).toThrow(/parsed to empty content/);
      expect(getResult()).toEqual(doc(p("before"), p("after")));
    } finally {
      destroy();
    }
  });

  it("append rejects empty input", () => {
    const { sdk, destroy } = createNotebookSDK(doc(p("existing")));
    try {
      expect(() => sdk.append("")).toThrow(/notebook\.append\(\): markdown/);
      expect(() => sdk.append("   ")).toThrow(/parsed to empty content/);
    } finally {
      destroy();
    }
  });

  it("prepend rejects empty input", () => {
    const { sdk, destroy } = createNotebookSDK(doc(p("existing")));
    try {
      expect(() => sdk.prepend("")).toThrow(/notebook\.prepend\(\): markdown/);
    } finally {
      destroy();
    }
  });

  it("insertAfter / insertBefore reject empty input", () => {
    const { sdk, destroy } = createNotebookSDK(doc(p("first"), p("second")));
    try {
      const b = sdk.find({ type: "paragraph", text: "first" })[0];
      expect(() => sdk.insertAfter(b, "## ")).toThrow(/notebook\.insertAfter\(\)/);
      expect(() => sdk.insertBefore(b, "")).toThrow(/notebook\.insertBefore\(\)/);
    } finally {
      destroy();
    }
  });

  it("structural nodes (horizontalRule) are considered meaningful", () => {
    const { sdk, destroy } = createNotebookSDK(doc(p("before"), p("after")));
    try {
      const b = sdk.find({ type: "paragraph", text: "before" })[0];
      // `---` parses to a horizontalRule — should succeed.
      expect(() => sdk.replace(b, "---")).not.toThrow();
      const blocks = sdk.getBlocks();
      expect(blocks[0]).toMatchObject({ type: "horizontalRule" });
    } finally {
      destroy();
    }
  });

  it("replace heading preserving level via template literal still works", () => {
    const { sdk, destroy } = createNotebookSDK(doc(heading(2, "Test Note 2"), p("quack")));
    try {
      const h = sdk.find({ type: "heading", text: "Test Note 2" })[0];
      const hashes = "#".repeat(h.level ?? 1);
      sdk.replace(h, `${hashes} ${h.text} \u{1F986}`);
      const blocks = sdk.getBlocks();
      expect(blocks[0]).toMatchObject({
        type: "heading",
        level: 2,
        text: "Test Note 2 \u{1F986}",
      });
    } finally {
      destroy();
    }
  });
});
