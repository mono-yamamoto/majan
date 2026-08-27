-- 半荘のデータだけを全部消す（本番の開始前に、テストで入れたものを片付ける用）。
--
-- ★ 消えるもの / 消えないもの
--   消える  : games / game_results の**全行**（論理削除 deleted_at 済みのものも含む）
--   消えない: leagues（リーグ名・持ち点・返し点・ウマ）/ teams / members / league_members
--             ＝ 名簿とチーム分けとルールはそのまま残る
--
-- ★ 順番を変えないこと
--   game_results が games を外部キーで参照しているので、**子（game_results）から**消す。
--   逆にすると FOREIGN KEY constraint failed で落ちる。
--   （落ちるだけで壊れはしないが、片方だけ消えた状態にはならない）
--
-- ★ 実行後、id は 1 から振り直される
--   games.id は INTEGER PRIMARY KEY（AUTOINCREMENT ではない）なので、
--   全行消すと次の登録が id=1 になる。開幕前に片付ける用途としてはこれでよい。
--
-- ★ WHERE を付けていないのは意図
--   「テストのぶんだけ」を日付や id で選ぶと、選び漏れ・選びすぎが起きる。
--   開幕前に全部消す用途なので、全消しの方が結果が読める。
--   一部だけ残したいなら reset-games.sql は使わず、手で DELETE を書くこと。

DELETE FROM game_results;
DELETE FROM games;
