-- リーグとチームの「箱」を作る。**一番最初に1回だけ**流す。
--
-- 名簿（メンバーと所属）は db/roster.sql の方。分けている理由は下の
-- 「二重投入の扱いが逆になっている理由」を読むこと。
--
-- 運営の手順:
--   1. cp db/seed.sql db/seed.local.sql
--      （リーグ名・チーム名を変えるなら編集する。id と件数は変えない）
--   2. wrangler d1 execute majan --local  --file=./db/seed.local.sql
--      wrangler d1 execute majan --remote --file=./db/seed.local.sql   # 本番
--   3. 続けて db/roster.sql の手順へ
--
-- ---------------------------------------------------------------------------
-- 二重投入の扱いが逆になっている理由（seed.sql と roster.sql）
--
--   seed.sql  : id を明示していて、**二重投入すると UNIQUE constraint failed で落ちる**。
--               リーグやチームを二重に作る事故は、あとから気づいても直しにくい
--               （半荘がぶら下がっている可能性がある）。落ちる方が安全。
--               INSERT OR IGNORE や ON CONFLICT には**しないこと**。
--
--   roster.sql: **何度でも流せる**（INSERT OR REPLACE）。
--               チーム分けは開幕前に確定するので、決まるまで
--               「直して流し直す」ができる必要がある。
--
-- 目的が違うので挙動も違う。片方に合わせないこと。
-- ---------------------------------------------------------------------------

INSERT INTO leagues (id, name, start_point, return_point, uma_1st, uma_2nd, uma_3rd, uma_4th)
VALUES (1, '2026 秋リーグ', 25000, 30000, 30, 10, -10, -30);

INSERT INTO teams (id, league_id, name) VALUES
  (1, 1, 'チームA'),
  (2, 1, 'チームB');
