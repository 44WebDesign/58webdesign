export function extractFolderId(input: string): string {
    if (!input) return '';
    const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input.trim();
}

export async function fetchAllVideosFromDrive(currentFolderId: string, currentApiKey: string): Promise<any[]> {
    let allVideos: any[] = [];

    try {
        const query = `'${currentFolderId}'+in+parents+and+mimeType+contains+'video/mp4'+and+trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&key=${currentApiKey}`;
        
        const filesResponse = await fetch(url);
        const filesData: any = await filesResponse.json();
        
        if (filesData.error) {
            console.error(`[Drive Utils] Error fetching files: ${filesData.error.message}`);
            return [];
        }

        if (filesData.files) {
            const folderVideos = filesData.files.map((file: any) => ({
                name: file.name,
                url: `/drive-video/${file.id}.mp4`
            }));
            allVideos = [...allVideos, ...folderVideos];
        }

        const folderQuery = `'${currentFolderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`;
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&key=${currentApiKey}`;
        
        const foldersResponse = await fetch(folderUrl);
        const foldersData: any = await foldersResponse.json();

        if (!foldersData.error && foldersData.files && foldersData.files.length > 0) {
            for (const folder of foldersData.files) {
                const subfolderVideos = await fetchAllVideosFromDrive(folder.id, currentApiKey);
                allVideos = [...allVideos, ...subfolderVideos];
            }
        }
    } catch (error) {
        console.error(`[Drive Utils] Network error:`, error);
    }

    return allVideos;
}

export function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
