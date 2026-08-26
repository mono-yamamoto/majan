import type { APIRoute } from 'astro';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const prerender = false;

const COMMENTS_FILE = path.join(process.cwd(), '.guidebook-comments.jsonl');

type CommentRecord = {
  id: string;
  timestamp: string;
  page: string;
  pageTitle: string | null;
  section: { id: string; text: string } | null;
  body: string;
  sent: boolean;
  read: boolean;
  author: 'user' | 'claude';
  replyTo: string | null;
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

function countUnsent(records: CommentRecord[]): number {
  let n = 0;
  for (const r of records) if (!r.sent) n += 1;
  return n;
}

export const GET: APIRoute = async () => {
  const comments = await loadAll();
  return new Response(
    JSON.stringify({ comments, unsentCount: countUnsent(comments) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};

export const POST: APIRoute = async ({ request }) => {
  let data: { page?: unknown; section?: unknown; body?: unknown };
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  if (typeof data?.body !== 'string' || data.body.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'body is required' }), { status: 400 });
  }

  const author: 'user' | 'claude' =
    (data as { author?: unknown }).author === 'claude' ? 'claude' : 'user';
  const replyTo =
    typeof (data as { replyTo?: unknown }).replyTo === 'string'
      ? ((data as { replyTo: string }).replyTo)
      : null;

  const record: CommentRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    page: typeof data.page === 'string' ? data.page : '',
    pageTitle:
      typeof (data as { pageTitle?: unknown }).pageTitle === 'string'
        ? ((data as { pageTitle: string }).pageTitle).trim() || null
        : null,
    section:
      data.section && typeof data.section === 'object'
        ? (data.section as { id: string; text: string })
        : null,
    body: (data.body as string).trim(),
    sent: author === 'claude',
    read: author === 'claude',
    author,
    replyTo,
  };

  await appendFile(COMMENTS_FILE, JSON.stringify(record) + '\n', 'utf8');

  return new Response(JSON.stringify({ ok: true, record }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'id is required' }), { status: 400 });
  }

  const comments = await loadAll();
  const before = comments.length;
  const next = comments.filter((c) => c.id !== id);
  if (next.length === before) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }
  await saveAll(next);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
