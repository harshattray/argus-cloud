/**
 * Ambient declarations for non-code imports.
 *
 * Next handles CSS side-effect imports at build time but ships no ambient
 * module declaration for them, and TypeScript rejects an import it has no
 * type for. `next-env.d.ts` carries a "do not edit" notice, so this lives
 * alongside it instead.
 */
declare module "*.css";
