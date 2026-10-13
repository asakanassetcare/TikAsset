Deno.serve(() => new Response(JSON.stringify({ status: "ok" }), {
  headers: { "Content-Type": "application/json" },
}))
