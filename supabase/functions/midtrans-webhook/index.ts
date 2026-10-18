const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(JSON.stringify({
    code: 'PAYMENTS_DISABLED',
    error: 'Pemrosesan pembayaran dinonaktifkan untuk mencegah billing dan biaya transaksi.',
  }), { status: 410, headers: corsHeaders });
});
