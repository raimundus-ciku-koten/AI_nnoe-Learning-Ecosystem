import { supabase } from '../lib/supabase.ts';

async function responseError(error) {
  let message = error?.message || 'Permintaan AI gagal.';
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      return message;
    }
  }
  return message;
}

export async function jalankanAiUserService(action, body = {}) {
  const functionName = action === 'canva-oauth-start' ? action : 'ai-user-services';
  const payload = action === 'canva-oauth-start' ? {} : { ...body, action };
  const { data, error } = await supabase.functions.invoke(functionName, { body: payload });
  if (error) throw new Error(await responseError(error));
  return data;
}
