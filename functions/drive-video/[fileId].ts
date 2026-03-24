export const onRequest: PagesFunction<{ GOOGLE_API_KEY: string }> = async (context) => {
    const { env, params } = context;
    let fileId = params.fileId as string;
    const currentApiKey = env.GOOGLE_API_KEY?.trim();

    if (!currentApiKey) {
        return new Response('API Key not configured', { status: 500 });
    }

    // Remove .mp4 if present
    if (fileId.endsWith('.mp4')) {
        fileId = fileId.slice(0, -4);
    }

    try {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${currentApiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
            return new Response('Error fetching from Google Drive', { status: response.status });
        }

        // Create a new response with the same body but custom headers
        const newResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
        });

        newResponse.headers.set('Content-Type', 'video/mp4');
        newResponse.headers.set('Cache-Control', 'public, max-age=3600');
        newResponse.headers.set('Access-Control-Allow-Origin', '*');

        return newResponse;
    } catch (error) {
        console.error(`[Drive Proxy] Proxy error for ${fileId}:`, error);
        return new Response('Internal server error', { status: 500 });
    }
};
