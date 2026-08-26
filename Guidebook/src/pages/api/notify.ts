import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

const SIGNAL_FILE = path.join(process.cwd(), '.guidebook-comments.signal');
const COMMENTS_FILE = path.join(process.cwd(), '.guidebook-comments.jsonl');

type CommentRecord = {
  id: string;
  timestamp: string;
  page: string;
  section: { id: string; text: string } | null;
  body: string;
  sent: boolean;
};

async function loadAll(): Promise<CommentRecord[]> {
  try {
    const text = await readFile(COMMENTS_FILE, 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CommentRecord);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function saveAll(records: CommentRecord[]): Promise<void> {
  const content = records.map((r) => JSON.stringify(r)).join('\n');
  await writeFile(COMMENTS_FILE, records.length > 0 ? content + '\n' : '', 'utf8');
}

export const POST: APIRoute = async () => {
  const comments = await loadAll();
  const unsent = comments.filter((c) => !c.sent);

  if (unsent.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: 'no unsent comments' }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    );
  }

  const updated = comments.map((c) => (c.sent ? c : { ...c, sent: true }));
  await saveAll(updated);
  await writeFile(SIGNAL_FILE, new Date().toISOString(), 'utf8');

  return new Response(
    JSON.stringify({ ok: true, sentCount: unsent.length }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  );
};
