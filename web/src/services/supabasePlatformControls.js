import { supabase } from '../lib/supabase.ts';
import { createPlatformControlAdapter } from './platformControlAdapter.js';

const platformControls = createPlatformControlAdapter(supabase);

export const getSupabasePlatformControl = () => platformControls.getState();
export const setSupabasePlatformControl = request => platformControls.setControl(request);
