import { extractFolderId, fetchAllVideosFromDrive, shuffleArray } from '../_utils';

export const onRequest: PagesFunction<{ GOOGLE_API_KEY: string; GOOGLE_DRIVE_FOLDER_ID: string }> = async (context) => {
    const { env } = context;
    const currentApiKey = env.GOOGLE_API_KEY?.trim();
    const rawFolderId = env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '';
    const currentFolderId = extractFolderId(rawFolderId);

    let videos = [];

    if (currentApiKey && currentFolderId) {
        videos = await fetchAllVideosFromDrive(currentFolderId, currentApiKey);
    }

    // Randomize the order
    shuffleArray(videos);

    return new Response(JSON.stringify(videos), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
};
