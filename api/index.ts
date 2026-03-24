import express from 'express';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import 'dotenv/config';

const app = express();
const publicDir = path.join(process.cwd(), 'public');

function extractFolderId(input: string): string {
    if (!input) return '';
    const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : input.trim();
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function fetchAllVideosFromDrive(currentFolderId: string, currentApiKey: string, depth = 0): Promise<any[]> {
    if (depth > 2) return [];
    let allVideos: any[] = [];
    try {
        const query = encodeURIComponent(`'${currentFolderId}' in parents and mimeType contains 'video/' and trashed = false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType)&key=${currentApiKey}`;
        const filesResponse = await fetchWithTimeout(url);
        const filesData: any = await filesResponse.json();
        if (filesData.files) {
            const folderVideos = filesData.files.map((file: any) => ({
                name: file.name,
                url: `/drive-video/${file.id}.mp4`
            }));
            allVideos = [...allVideos, ...folderVideos];
        }
        if (allVideos.length < 50) {
            const folderQuery = encodeURIComponent(`'${currentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
            const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&key=${currentApiKey}`;
            const foldersResponse = await fetchWithTimeout(folderUrl);
            const foldersData: any = await foldersResponse.json();
            if (!foldersData.error && foldersData.files && foldersData.files.length > 0) {
                for (const folder of foldersData.files.slice(0, 5)) {
                    const subfolderVideos = await fetchAllVideosFromDrive(folder.id, currentApiKey, depth + 1);
                    allVideos = [...allVideos, ...subfolderVideos];
                    if (allVideos.length >= 100) break;
                }
            }
        }
    } catch (error) {
        console.error(`[API] Error fetching from folder ${currentFolderId}:`, error);
    }
    return allVideos;
}

function getLocalVideos() {
    try {
        if (!fs.existsSync(publicDir)) return [];
        const files = fs.readdirSync(publicDir);
        return files
            .filter(file => file.toLowerCase().endsWith('.mp4'))
            .map(file => ({
                name: file,
                url: `/${file}`
            }));
    } catch (error) {
        console.error('[API] Error reading local public folder:', error);
        return [];
    }
}

app.get('/api/videos', async (req, res) => {
    const currentApiKey = (process.env.GOOGLE_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY)?.trim();
    const rawFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '';
    const currentFolderId = extractFolderId(rawFolderId);
    let videos = [];
    if (currentApiKey && currentFolderId && currentApiKey !== 'undefined' && currentFolderId !== 'undefined') {
        videos = await fetchAllVideosFromDrive(currentFolderId, currentApiKey);
        if (videos.length === 0) {
            videos = getLocalVideos();
        }
    } else {
        videos = getLocalVideos();
    }
    for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
    }
    res.json(videos);
});

app.get('/drive-video/:fileId.mp4', async (req, res) => {
    const { fileId } = req.params;
    const currentApiKey = (process.env.GOOGLE_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY)?.trim();
    if (!currentApiKey) return res.status(500).send('API Key not configured');
    try {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${currentApiKey}`;
        const response = await fetchWithTimeout(url, 30000);
        if (!response.ok) return res.status(response.status).send('Error fetching from Google Drive');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        if (response.body) {
            if ((Readable as any).fromWeb) {
                (Readable as any).fromWeb(response.body as any).pipe(res);
            } else {
                const reader = (response.body as any).getReader();
                const stream = new Readable({
                    async read() {
                        const { done, value } = await reader.read();
                        if (done) this.push(null);
                        else this.push(Buffer.from(value));
                    }
                });
                stream.pipe(res);
            }
        } else res.status(500).send('No response body');
    } catch (error) {
        res.status(500).send('Internal server error');
    }
});

export default app;
