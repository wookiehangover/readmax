import { describe, it, expect } from "vitest";
import { computeFileHash } from "~/lib/book-hash";

describe("computeFileHash", () => {
  it("returns a 64-character lowercase hex string", async () => {
    const data = new TextEncoder().encode("hello world").buffer as ArrayBuffer;
    const hash = await computeFileHash(data);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known SHA-256 of an empty buffer", async () => {
    const hash = await computeFileHash(new ArrayBuffer(0));
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the known SHA-256 of 'hello world'", async () => {
    const data = new TextEncoder().encode("hello world").buffer as ArrayBuffer;
    const hash = await computeFileHash(data);
    expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });

  it("is deterministic for the same bytes", async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]).buffer as ArrayBuffer;
    const b = new Uint8Array([1, 2, 3, 4, 5]).buffer as ArrayBuffer;
    const [hashA, hashB] = await Promise.all([computeFileHash(a), computeFileHash(b)]);
    expect(hashA).toBe(hashB);
  });

  it("produces different hashes for different bytes", async () => {
    const a = new Uint8Array([1, 2, 3]).buffer as ArrayBuffer;
    const b = new Uint8Array([1, 2, 4]).buffer as ArrayBuffer;
    const [hashA, hashB] = await Promise.all([computeFileHash(a), computeFileHash(b)]);
    expect(hashA).not.toBe(hashB);
  });
});
