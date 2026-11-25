import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'

// Short error code of a failed Edge Function call: the { "error": "<code>" } of the body; "not_deployed" when the
// function does not exist (404) or does not answer at all; otherwise the fallback.
export async function functionErrorCode(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    let code: unknown
    try {
      code = (await err.context.json()).error
    } catch {
      // no JSON body
    }
    return typeof code === 'string' ? code : err.context.status === 404 ? 'not_deployed' : fallback
  }
  if (err instanceof FunctionsFetchError || err instanceof FunctionsRelayError) return 'not_deployed'
  return fallback
}
