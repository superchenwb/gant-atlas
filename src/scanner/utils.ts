/**
 * Shared scanner utilities.
 */

/**
 * Check whether an identifier looks like an API function name.
 * Matches any casing of the 'Api' suffix (Api, API, api, etc.).
 */
export function isApiFunctionName(name: string): boolean {
  return name.length > 3 && name.toLowerCase().endsWith('api');
}

/**
 * Extract all API function names from a source string using a simple regex.
 * Captures identifiers ending with any casing of 'Api' (e.g. findListApi, deleteByIdAPI).
 */
export function extractApiNamesFromText(text: string): string[] {
  const apis: string[] = [];
  const seen = new Set<string>();
  const regex = /\b([a-zA-Z_]\w*Api)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const name = m[1];
    if (isApiFunctionName(name) && !seen.has(name)) {
      seen.add(name);
      apis.push(name);
    }
  }
  return apis;
}
