import { getSchema, type AnyExtension } from "@tiptap/core";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/react";
import { parseHTML } from "linkedom";
import markdownit from "markdown-it";

const md = markdownit({ html: false, linkify: true, breaks: false });
// Cast is required because pnpm can hoist two copies of @tiptap/core; see
// app/lib/editor/notebook-sdk.ts for the same workaround.
const schema = getSchema([StarterKit as unknown as AnyExtension]);

/**
 * Server-safe markdown → TipTap JSONContent converter.
 *
 * Uses markdown-it to render HTML, linkedom to build a DOM, and ProseMirror's
 * DOMParser with Tiptap's StarterKit schema to produce JSON. Does NOT construct
 * a Tiptap Editor (which requires browser globals like `innerHeight`).
 */
export function markdownToTiptapJsonServer(markdown: string): JSONContent {
  const html = md.render(markdown);
  const { document } = parseHTML("<!DOCTYPE html><html><body>" + html + "</body></html>");
  const pmDoc = PMDOMParser.fromSchema(schema).parse(document.body);
  return pmDoc.toJSON() as JSONContent;
}
