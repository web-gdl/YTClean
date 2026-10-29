export interface CspOptions {
  connect?: string;
  img?: string;
  media?: string;
  noUpgrade?: boolean;
}
export const EMBED_ORIGIN: string;
export function buildMetaCsp(opts?: CspOptions): string;
export function buildHeaderCsp(opts?: CspOptions): string;
export const SECURITY_HEADERS: Record<string, string>;
export function cspOptionsFromEnv(env?: NodeJS.ProcessEnv): CspOptions;
