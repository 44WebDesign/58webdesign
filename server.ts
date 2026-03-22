import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import 'dotenv/config';

const PORT = 3000;
const publicDir = path.join(process.cwd(), 'public');
const apiKey = process.env.GOOGLE_API_KEY?.trim();
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

async function fetchAllVideosFromDrive(currentFolderId: string, currentApiKey: string): Promise<any[]> {
    let allVideos: any[] = [];

    try {
        console.log(`[Server] Querying Google Drive folder: ${currentFolderId}`);
        const query = `'${currentFolderId}'+in+parents+and+mimeType+contains+'video/mp4'+and+trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&key=${currentApiKey}`;
        
        const filesResponse = await fetch(url);
        const filesData: any = await filesResponse.json();
        
        if (filesData.error) {
            console.error(`[Server] Google Drive API Error (Files) for folder ${currentFolderId}: ${filesData.error.message}`);
            // If it's a permission error, it's likely the folder isn't shared correctly
            if (filesData.error.code === 403 || filesData.error.code === 404) {
                console.warn('[Server] Permission denied. Ensure your Google Drive folder is shared as "Anyone with the link can view".');
            }
            return [];
        }

        if (filesData.files) {
            console.log(`[Server] Found ${filesData.files.length} videos in folder ${currentFolderId}`);
            const folderVideos = filesData.files.map((file: any) => ({
                name: file.name,
                url: `/drive-video/${file.id}.mp4`
            }));
            allVideos = [...allVideos, ...folderVideos];
        }

        const folderQuery = `'${currentFolderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`;
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&key=${currentApiKey}`;
        
        const foldersResponse = await fetch(folderUrl);
        const foldersData: any = await foldersResponse.json();

        if (foldersData.error) {
            console.error(`[Server] Google Drive API Error (Folders) for folder ${currentFolderId}: ${foldersData.error.message}`);
        } else if (foldersData.files && foldersData.files.length > 0) {
            console.log(`[Server] Found ${foldersData.files.length} subfolders in folder ${currentFolderId}`);
            for (const folder of foldersData.files) {
                const subfolderVideos = await fetchAllVideosFromDrive(folder.id, currentApiKey);
                allVideos = [...allVideos, ...subfolderVideos];
            }
        }
    } catch (error) {
        console.error(`[Server] Network or Parsing Error fetching from folder ${currentFolderId}:`, error);
    }

    return allVideos;
}

function getLocalVideos() {
    try {
        const files = fs.readdirSync(publicDir);
        return files
            .filter(file => file.toLowerCase().endsWith('.mp4'))
            .map(file => ({
                name: file,
                url: `/${file}`
            }));
    } catch (error) {
        console.error('[Server] Error reading local public folder:', error);
        return [];
    }
}

function extractFolderId(input: string): string {
    if (!input) return '';
    // If it's a URL like https://drive.google.com/drive/folders/ID
    const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input.trim();
}

async function startServer() {
    const app = express();

    // API Route for videos
    app.get('/api/videos', async (req, res) => {
        const currentApiKey = process.env.GOOGLE_API_KEY?.trim();
        const rawFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '';
        const currentFolderId = extractFolderId(rawFolderId);
        
        console.log(`[Server] GET /api/videos. Drive Config: ${!!currentApiKey}/${!!currentFolderId}`);
        let videos = [];

        if (currentApiKey && currentFolderId && currentApiKey !== 'undefined' && currentFolderId !== 'undefined') {
            videos = await fetchAllVideosFromDrive(currentFolderId, currentApiKey);
            if (videos.length === 0) {
                console.warn('[Server] No videos found in Google Drive. Falling back to local.');
                videos = getLocalVideos();
            }
        } else {
            console.log('[Server] No Google Drive credentials. Using local videos.');
            videos = getLocalVideos();
        }

        // Randomize the order of videos
        for (let i = videos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [videos[i], videos[j]] = [videos[j], videos[i]];
        }

        res.json(videos);
    });

    // Proxy route for Google Drive videos
    app.get('/drive-video/:fileId.mp4', async (req, res) => {
        const { fileId } = req.params;
        const currentApiKey = process.env.GOOGLE_API_KEY?.trim();

        if (!currentApiKey) {
            return res.status(500).send('API Key not configured');
        }

        try {
            const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${currentApiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                return res.status(response.status).send('Error fetching from Google Drive');
            }

            // Set appropriate headers for video streaming
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            // Pipe the response body to the client
            if (response.body) {
                // Node.js fetch response.body is a Web ReadableStream
                // We can use Readable.fromWeb if available, or just iterate
                if ((Readable as any).fromWeb) {
                    (Readable as any).fromWeb(response.body as any).pipe(res);
                } else {
                    // Fallback for older Node versions
                    const reader = (response.body as any).getReader();
                    const stream = new Readable({
                        async read() {
                            const { done, value } = await reader.read();
                            if (done) {
                                this.push(null);
                            } else {
                                this.push(Buffer.from(value));
                            }
                        }
                    });
                    stream.pipe(res);
                }
            } else {
                res.status(500).send('No response body');
            }
        } catch (error) {
            console.error(`[Server] Proxy error for ${fileId}:`, error);
            res.status(500).send('Internal server error');
        }
    });

    // Debug endpoint
    app.get('/api/debug', async (req, res) => {
        const currentApiKey = process.env.GOOGLE_API_KEY?.trim();
        const rawFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '';
        const currentFolderId = extractFolderId(rawFolderId);

        let driveError = null;
        let driveFiles = [];
        let driveSubfolders = [];
        let folderMetadata = null;
        try {
            // Check folder metadata
            const metaUrl = `https://www.googleapis.com/drive/v3/files/${currentFolderId}?fields=id,name,mimeType,trashed&key=${currentApiKey}`;
            const metaResponse = await fetch(metaUrl);
            folderMetadata = await metaResponse.json();

            if (folderMetadata.error) {
                driveError = folderMetadata.error;
            } else {
                // Check files
                const query = `'${currentFolderId}'+in+parents+and+mimeType+contains+'video/mp4'+and+trashed=false`;
                const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&key=${currentApiKey}`;
                const response = await fetch(url);
                const data: any = await response.json();
                if (data.error) {
                    driveError = data.error;
                } else {
                    driveFiles = data.files || [];
                }

                // Check folders
                const folderQuery = `'${currentFolderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`;
                const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&key=${currentApiKey}`;
                const folderResponse = await fetch(folderUrl);
                const folderData: any = await folderResponse.json();
                if (!folderData.error) {
                    driveSubfolders = folderData.files || [];
                }
            }
        } catch (e: any) {
            driveError = e.message;
        }

        res.json({
            env: {
                GOOGLE_API_KEY_PRESENT: !!process.env.GOOGLE_API_KEY,
                GOOGLE_DRIVE_FOLDER_ID_PRESENT: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
                NODE_ENV: process.env.NODE_ENV
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
        });
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Server] Running on http://localhost:${PORT}`);
    });
}

startServer();
