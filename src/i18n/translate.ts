export type TranslateParams = Record<string, string | number>

export type Translator = (key: string, params?: TranslateParams) => string

function lookup(dict: unknown, key: string): unknown {
  let node: unknown = dict
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

/**
 * Resolve a dot-path key against a dictionary with `{param}` interpolation.
 * Unknown keys return the key itself, which also lets unmigrated legacy
 * English strings pass through `t()` untouched during the i18n rollout.
 */
export function translate(dict: unknown, key: string, params?: TranslateParams): string {
  const raw = lookup(dict, key)
  let value = typeof raw === "string" && raw.length > 0 ? raw : key
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    )
  }
  return value
}
