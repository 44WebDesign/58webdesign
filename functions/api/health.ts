export const onRequest: PagesFunction = async () => {
    return new Response(JSON.stringify({ status: 'ok', runtime: 'cloudflare-pages' }), {
        headers: { 'Content-Type': 'application/json' }
    });
};
