/**
 * This package has no flat entry point: every module is imported by subpath
 * (`@gnosia/tutor/providers`, `@gnosia/tutor/server/credentials`), so a
 * client component can never pull a database-bound module in by accident.
 */
export {};
