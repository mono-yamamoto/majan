-- 初期データの「形を示すテンプレート」。名前はすべてプレースホルダ（決定 D-10）。
--
-- 実際のメンバーの氏名は db/seed.local.sql に書き、そちらを本番へ流す。
-- seed.local.sql は .gitignore 済みで、git 履歴には残らない。
--   cp db/seed.sql db/seed.local.sql   # 名前を実名に書き換えてから流す
--
-- 適用:
--   wrangler d1 execute majan --local  --file=./db/seed.local.sql
--   wrangler d1 execute majan --remote --file=./db/seed.local.sql   # 本番（T11・運営操作）
--
-- id を明示しているので、二重に流すと UNIQUE constraint failed で落ちる。
-- 「投入済みのDBを黙って壊さない」ための安全側の挙動なので、
-- INSERT OR IGNORE や ON CONFLICT には**しないこと**。

INSERT INTO leagues (id, name, start_point, return_point, uma_1st, uma_2nd, uma_3rd, uma_4th)
VALUES (1, '2026 秋リーグ', 25000, 30000, 30, 10, -10, -30);

INSERT INTO teams (id, league_id, name) VALUES
  (1, 1, 'チームA'),
  (2, 1, 'チームB');

INSERT INTO members (id, name) VALUES
  (1,'山田'), (2,'佐藤'), (3,'鈴木'), (4,'田中'), (5,'高橋'),
  (6,'伊藤'), (7,'渡辺'), (8,'中村'), (9,'小林'), (10,'加藤');

INSERT INTO league_members (league_id, member_id, team_id) VALUES
  (1,1,1), (1,2,1), (1,3,1), (1,4,1), (1,5,1),   -- チームA
  (1,6,2), (1,7,2), (1,8,2), (1,9,2), (1,10,2);  -- チームB
