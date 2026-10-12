// Shared web modules read Vite's import.meta.env; on the phone those modules are swapped (see metro.config.js),
// this only lets the type checker follow them.
interface ImportMeta { readonly env: Record<string, string | undefined> }
