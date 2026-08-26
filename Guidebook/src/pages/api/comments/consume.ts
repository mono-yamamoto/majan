import type { APIRoute } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
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
      .map((line) => {
        const r = JSON.parse(line) as Partial<CommentRecord>;
        return {
          id: String(r.id ?? ''),
          timestamp: String(r.timestamp ?? ''),
          page: String(r.page ?? ''),
          pageTitle: typeof r.pageTitle === 'string' ? r.pageTitle : null,
          section: r.section ?? null,
          body: String(r.body ?? ''),
          sent: Boolean(r.sent),
          read: Boolean(r.read),
          author: r.author === 'claude' ? 'claude' : 'user',
          replyTo: typeof r.replyTo === 'string' ? r.replyTo : null,
        };
      });
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
  const all = await loadAll();
  const unread = all.filter((c) => c.sent && !c.read);

  if (unread.length === 0) {
    return new Response(
      JSON.stringify({ comments: [], consumedCount: 0 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  const unreadIds = new Set(unread.map((c) => c.id));
  const updated = all.map((c) => (unreadIds.has(c.id) ? { ...c, read: true } : c));
  await saveAll(updated);

  return new Response(
    JSON.stringify({ comments: unread, consumedCount: unread.length }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
