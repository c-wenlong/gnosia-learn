-- The deferred-trigger stand-in. A Postgres completeness rule was a
-- CONSTRAINT TRIGGER … INITIALLY DEFERRED row, armed and disarmed by
-- `catalog flip`; on SQLite a rule `catalog flip --strict` arms is a row
-- here, and `inTransaction` checks it before commit (src/db.ts).
CREATE TABLE `catalog_armed_rule` (
	`name` text PRIMARY KEY NOT NULL
);
