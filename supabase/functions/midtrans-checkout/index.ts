const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(JSON.stringify({
    code: 'CHECKOUT_DISABLED',
    error: 'Checkout dinonaktifkan untuk mencegah billing dan biaya transaksi.',
  }), { status: 410, headers: corsHeaders });
});
