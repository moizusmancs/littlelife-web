/** Every backend error response is this shape (api/README.md conventions). `detail` is the raw
 *  go-playground/validator string — debug-only, never render it to an end user directly. */
export interface ApiErrorBody {
  error: string
  detail?: string
}

/** Every ID in the API is a v4 UUID string. Aliased for readability at call sites. */
export type UUID = string

/** Every timestamp is RFC3339 with offset (Go's default time.Time JSON marshaling) — treat as
 *  an opaque ISO-8601 string, parse with date-fns, never hand-roll a parser. */
export type ISODateString = string
