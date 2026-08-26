-- 名簿とチーム分けの「形を示すテンプレート」。名前はすべてプレースホルダ（決定 D-10）。
--
-- **何度でも流せる。** 開幕前にチーム分けが決まるまで、このファイルを直して
-- 流し直すことを想定している。db/seed.sql（一発勝負）とは扱いが逆なので、
-- 理由は seed.sql の冒頭コメントを読むこと。
--
-- ---------------------------------------------------------------------------
-- ★ 開幕後（半荘を1つでも登録した後）は流さないこと
--
-- チーム合計 pt は「**現在の**所属メンバーの pt 総和」で計算している。
-- 所属を変えると、**過去に打った半荘の pt も新しいチームに移る**。
-- 開幕前に確定させる前提の設計。
--
-- どうしても途中で変える必要が出たら、**過去の所属を記録する設計**
-- （game_results に team_id を持つ等）への変更が要る。マイグレーションの
-- 追加になるので、勝手に流さずに相談すること。
-- ---------------------------------------------------------------------------
--
-- 運営の手順:
--   1. cp db/roster.sql db/roster.local.sql
--   2. roster.local.sql の名前を実名に、team_id をチーム分けに書き換える
--      （id と件数は変えない。team_id は seed.sql の teams と対応させる）
--   3. wrangler d1 execute majan --local  --file=./db/roster.local.sql
--      wrangler d1 execute majan --remote --file=./db/roster.local.sql   # 本番
--   4. チーム分けが変わったら 2 に戻って直し、もう一度 3 を流すだけ
--   5. 確認（チームごとの人数と、所属がリーグをまたいでいないこと）
--        wrangler d1 execute majan --remote --command \
--          "SELECT t.name, COUNT(*) AS n, SUM(t.league_id <> lm.league_id) AS wrong_league \
--           FROM league_members lm JOIN teams t ON t.id = lm.team_id GROUP BY t.id;"
--
-- ★ 実名は roster.local.sql に書く。このファイルは編集しない。
--    roster.local.sql は .gitignore 済みなので、実名が git 履歴に残らない
--    （決定 D-10 / D-11。seed.local.sql と同じ扱い）。

-- INSERT OR REPLACE にしている理由:
--   - members は id で、league_members は PK (league_id, member_id) で衝突するので、
--     **同じ人の行だけが置き換わる**。他の人には触らない。
--   - 名前の打ち間違いも、チーム分けの変更も、このファイルを直して流し直すだけで済む。
--
-- ★ REPLACE は「削除して入れ直す」なので、子を持つ行に使うと危ない。
--   いまは game_results / league_members の外部キーに ON DELETE CASCADE が
--   無いので、members を置き換えても子は消えない（実測確認済み）。
--   **もし将来 ON DELETE CASCADE を足すなら、このファイルを
--   `ON CONFLICT(...) DO UPDATE SET ...` に書き換えること。**
--   そのままだと、流し直した瞬間に過去の対戦成績が消える。

INSERT OR REPLACE INTO members (id, name) VALUES
  (1,'山田'), (2,'佐藤'), (3,'鈴木'), (4,'田中'), (5,'高橋'),
  (6,'伊藤'), (7,'渡辺'), (8,'中村'), (9,'小林'), (10,'加藤');

-- league_id, member_id, team_id
-- team_id は seed.sql の teams と対応（1 = チームA / 2 = チームB）。
-- チーム分けを変えるときは、この team_id だけを書き換える。
INSERT OR REPLACE INTO league_members (league_id, member_id, team_id) VALUES
  (1,1,1), (1,2,1), (1,3,1), (1,4,1), (1,5,1),   -- チームA
  (1,6,2), (1,7,2), (1,8,2), (1,9,2), (1,10,2);  -- チームB
