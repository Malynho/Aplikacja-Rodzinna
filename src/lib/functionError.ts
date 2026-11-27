import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'

// The short error code of a failed Edge Function call plus the JSON body it came with (for extra fields such as a
// limit): the { "error": "<code>" } of the body; "not_deployed" when the function does not exist (404) or does not
// answer at all; otherwise the fallback.
export async function functionErrorDetails(
  err: unknown,
  fallback: string,
): Promise<{ code: string; body: Record<string, unknown> | null }> {
  if (err instanceof FunctionsHttpError) {
    let body: Record<string, unknown> | null = null
    try {
      body = await err.context.json()
    } catch {
      // no JSON body
    }
    const code = body?.error
    return { code: typeof code === 'string' ? code : err.context.status === 404 ? 'not_deployed' : fallback, body }
  }
  if (err instanceof FunctionsFetchError || err instanceof FunctionsRelayError) return { code: 'not_deployed', body: null }
  return { code: fallback, body: null }
}

export async function functionErrorCode(err: unknown, fallback: string): Promise<string> {
  return (await functionErrorDetails(err, fallback)).code
}
