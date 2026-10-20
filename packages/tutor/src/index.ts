/**
 * This package has no flat entry point: every module is imported by subpath
 * (`@self-learn/tutor/providers`, `@self-learn/tutor/server/credentials`), so a
 * client component can never pull a database-bound module in by accident.
 */
export {};
