-- 麻雀リーグ戦アプリ 初期スキーマ
-- 仕様: Guidebook/src/content/docs/spec/data-model.mdx
--
-- PRAGMA は書かない。D1 が管理しており、外部キーは既定で常時ONになる。
-- pt / rank はカラムに持たない（素点だけ保存し、都度計算する）。

CREATE TABLE leagues (
  id           INTEGER PRIMARY KEY,
  name         TEXT    NOT NULL,
  start_point  INTEGER NOT NULL DEFAULT 25000,
  return_point INTEGER NOT NULL DEFAULT 30000,
  uma_1st      INTEGER NOT NULL DEFAULT  30,
  uma_2nd      INTEGER NOT NULL DEFAULT  10,
  uma_3rd      INTEGER NOT NULL DEFAULT -10,
  uma_4th      INTEGER NOT NULL DEFAULT -30,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- ゼロサムの成立条件。leagues は運営が SQL を直接流すテーブルで
  -- アプリのバリデーションを通らないため、CHECK が唯一の防衛線になる
  CHECK (uma_1st + uma_2nd + uma_3rd + uma_4th = 0),
  CHECK (start_point  % 100 = 0),
  CHECK (return_point % 100 = 0),
  -- オカ = (返し点 − 持ち点) × 4 / 1000。負のオカは意味を成さない（オカなしは 返し = 持ち）
  CHECK (return_point >= start_point)
) STRICT;

CREATE TABLE members (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;

CREATE TABLE teams (
  id        INTEGER PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  name      TEXT    NOT NULL,
  UNIQUE (league_id, id)   -- league_members の複合外部キーの参照先として必要
) STRICT;

CREATE TABLE league_members (
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  team_id   INTEGER NOT NULL,
  PRIMARY KEY (league_id, member_id),
  -- team_id が「同じリーグの」チームであることまで強制する。
  -- 単独の REFERENCES teams(id) だとチームだけ別リーグの所属行が作れてしまい、
  -- 別リーグのチームIDで 2-2 固定が成立するサイレント破損になる（この複合FKが包含する）
  FOREIGN KEY (league_id, team_id) REFERENCES teams(league_id, id)
) STRICT;

CREATE TABLE games (
  id         INTEGER PRIMARY KEY,
  league_id  INTEGER NOT NULL REFERENCES leagues(id),
  played_on  TEXT    NOT NULL,
  memo       TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at TEXT,
  -- YYYY-MM-DD の実在日付だけを許す。3条件すべてが必要:
  --   GLOB だけだと '2026-13-99' が通る（形式は合うが実在しない）
  --   date(x) = x だけだと 'banana' が通る（date('banana') は NULL を返し、
  --     CHECK は式が NULL のとき拒否しないため素通りする）
  --   IS NOT NULL を足して初めて塞がる
  CHECK (
    played_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(played_on) IS NOT NULL
    AND date(played_on) = played_on
  )
) STRICT;

CREATE TABLE game_results (
  id        INTEGER PRIMARY KEY,
  game_id   INTEGER NOT NULL REFERENCES games(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  -- SQLite の % はゼロ方向丸めなので、箱下（負の素点）でも正しく判定される
  raw_score INTEGER NOT NULL CHECK (raw_score % 100 = 0),
  UNIQUE (game_id, member_id)
) STRICT;

CREATE INDEX idx_games_league_played  ON games(league_id, played_on);
CREATE INDEX idx_results_game         ON game_results(game_id);
CREATE INDEX idx_results_member       ON game_results(member_id);
