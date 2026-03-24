import { extractFolderId } from '../_utils';

export const onRequest: PagesFunction<{ GOOGLE_API_KEY: string; GOOGLE_DRIVE_FOLDER_ID: string }> = async (context) => {
    const { env } = context;
    const currentApiKey = env.GOOGLE_API_KEY?.trim();
    const rawFolderId = env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '';
    const currentFolderId = extractFolderId(rawFolderId);

    let driveError = null;
    let driveFiles = [];
    let driveSubfolders = [];
    let folderMetadata = null;

    try {
        if (currentApiKey && currentFolderId) {
            // Check folder metadata
            const metaUrl = `https://www.googleapis.com/drive/v3/files/${currentFolderId}?fields=id,name,mimeType,trashed&key=${currentApiKey}`;
            const metaResponse = await fetch(metaUrl);
            folderMetadata = await metaResponse.json();

            if (folderMetadata.error) {
                driveError = folderMetadata.error;
            } else {
                // Check files
                const query = `'${currentFolderId}'+in+parents+and+mimeType+contains+'video/mp4'+and+trashed=false`;
                const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&key=${currentApiKey}`;
                const response = await fetch(url);
                const data: any = await response.json();
                if (data.error) {
                    driveError = data.error;
                } else {
                    driveFiles = data.files || [];
                }

                // Check folders
                const folderQuery = `'${currentFolderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`;
                const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&key=${currentApiKey}`;
                const folderResponse = await fetch(folderUrl);
                const folderData: any = await folderResponse.json();
                if (!folderData.error) {
                    driveSubfolders = folderData.files || [];
                }
            }
        } else {
            driveError = 'Missing API Key or Folder ID';
        }
    } catch (e: any) {
        driveError = e.message;
    }

    return new Response(JSON.stringify({
        env: {
            GOOGLE_API_KEY_PRESENT: !!env.GOOGLE_API_KEY,
            GOOGLE_DRIVE_FOLDER_ID_PRESENT: !!env.GOOGLE_DRIVE_FOLDER_ID,
        },
        config: {
            apiKeySet: !!currentApiKey,
            folderIdSet: !!currentFolderId,
            folderIdValue: currentFolderId
        },
        driveStatus: driveError ? 'ERROR' : 'OK',
        driveError: driveError,
        folderMetadata: folderMetadata,
        driveFileCount: driveFiles.length,
        driveSubfolderCount: driveSubfolders.length
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
};
