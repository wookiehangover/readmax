import type { PoolClient } from "pg";
import { sql } from "pg-sql";
import { getPool } from "../pool";

export interface BookChaptersRow {
  userId: string;
  bookId: string;
  chapters: unknown;
  extractedAt: Date;
}

const CHAPTERS_COLUMNS = sql`
  user_id AS "userId",
  book_id AS "bookId",
  chapters,
  extracted_at AS "extractedAt"
`;

function upsertBookChaptersQuery(
  userId: string,
  bookId: string,
  chapters: unknown,
  extractedAt: Date,
) {
  return sql`
    INSERT INTO readmax.book_chapters (user_id, book_id, chapters, extracted_at)
    VALUES (
      ${userId},
      ${bookId},
      ${JSON.stringify(chapters)}::jsonb,
      ${extractedAt.toISOString()}
    )
    ON CONFLICT (user_id, book_id) DO UPDATE
      SET chapters = EXCLUDED.chapters,
          extracted_at = EXCLUDED.extracted_at
    RETURNING ${CHAPTERS_COLUMNS}
  `;
}

async function lockBookChaptersUpload(client: PoolClient, userId: string, bookId: string) {
  await client.query(sql`
    SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${bookId}))
  `);
}

export interface ChapterWithIndex {
  readonly index: number;
}

function hasChapterIndex(value: unknown): value is ChapterWithIndex {
  const index = (value as { index?: unknown } | null)?.index;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0
  );
}

export function mergeChaptersByIndex(
  existingChapters: unknown,
  incomingChapters: readonly ChapterWithIndex[],
): unknown[] {
  const merged = new Map<number, unknown>();

  if (Array.isArray(existingChapters)) {
    for (const chapter of existingChapters) {
      if (hasChapterIndex(chapter)) {
        merged.set(chapter.index, chapter);
      }
    }
  }

  for (const chapter of incomingChapters) {
    merged.set(chapter.index, chapter);
  }

  return [...merged.entries()].sort(([a], [b]) => a - b).map(([, chapter]) => chapter);
}

export async function upsertBookChapters(
  userId: string,
  bookId: string,
  chapters: unknown,
  extractedAt: Date = new Date(),
): Promise<BookChaptersRow | null> {
  const pool = getPool();
  const result = await pool.query<BookChaptersRow>(
    upsertBookChaptersQuery(userId, bookId, chapters, extractedAt),
  );

  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
}

export async function replaceBookChaptersWithLock(
  userId: string,
  bookId: string,
  chapters: unknown,
  extractedAt: Date = new Date(),
): Promise<BookChaptersRow | null> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await lockBookChaptersUpload(client, userId, bookId);
    const result = await client.query<BookChaptersRow>(
      upsertBookChaptersQuery(userId, bookId, chapters, extractedAt),
    );
    await client.query("COMMIT");

    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(console.error);
    throw err;
  } finally {
    client.release();
  }
}

export async function mergeBookChapters(
  client: PoolClient,
  userId: string,
  bookId: string,
  chapters: readonly ChapterWithIndex[],
  extractedAt: Date = new Date(),
): Promise<BookChaptersRow | null> {
  await lockBookChaptersUpload(client, userId, bookId);

  const existing = await client.query<BookChaptersRow>(sql`
    SELECT ${CHAPTERS_COLUMNS}
    FROM readmax.book_chapters
    WHERE user_id = ${userId}
      AND book_id = ${bookId}
    FOR UPDATE
  `);

  const mergedChapters = mergeChaptersByIndex(existing.rows[0]?.chapters, chapters);

  const result = await client.query<BookChaptersRow>(sql`
    INSERT INTO readmax.book_chapters (user_id, book_id, chapters, extracted_at)
    VALUES (
      ${userId},
      ${bookId},
      ${JSON.stringify(mergedChapters)}::jsonb,
      ${extractedAt.toISOString()}
    )
    ON CONFLICT (user_id, book_id) DO UPDATE
      SET chapters = EXCLUDED.chapters,
          extracted_at = EXCLUDED.extracted_at
    RETURNING ${CHAPTERS_COLUMNS}
  `);

  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
}

export async function getBookChaptersForUser(
  userId: string,
  bookId: string,
): Promise<BookChaptersRow | null> {
  const pool = getPool();
  const result = await pool.query<BookChaptersRow>(sql`
    SELECT ${CHAPTERS_COLUMNS}
    FROM readmax.book_chapters
    WHERE user_id = ${userId}
      AND book_id = ${bookId}
  `);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
}
