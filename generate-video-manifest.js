import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const publicDir = './public';
const apiKey = process.env.GOOGLE_API_KEY?.trim();
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

async function generateManifest() {
    let videos = [];

    console.log('Environment Keys Available:');
    console.log(Object.keys(process.env).filter(key => !key.includes('SECRET') && !key.includes('KEY') && !key.includes('AUTH')).join(', '));
    // Specifically check for our keys without logging values
    console.log(`- GOOGLE_API_KEY present: ${!!process.env.GOOGLE_API_KEY}`);
    console.log(`- GOOGLE_DRIVE_FOLDER_ID present: ${!!process.env.GOOGLE_DRIVE_FOLDER_ID}`);
    
    // Fallback check for VITE_ prefixed ones just in case
    console.log(`- VITE_GOOGLE_API_KEY present: ${!!process.env.VITE_GOOGLE_API_KEY}`);
    console.log(`- VITE_GOOGLE_DRIVE_FOLDER_ID present: ${!!process.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`);

    const finalApiKey = (process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_API_KEY)?.trim();
    const finalFolderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.VITE_GOOGLE_DRIVE_FOLDER_ID)?.trim();

    if (finalApiKey && finalFolderId && finalApiKey !== 'undefined' && finalFolderId !== 'undefined') {
        console.log(`Fetching videos recursively from Google Drive folder: ${finalFolderId}`);
        // Update the global variables used by fetchAllVideosFromDrive
        // We need to pass them or make them accessible
        videos = await fetchAllVideosFromDrive(finalFolderId, finalApiKey);
        
        if (videos.length === 0) {
            console.warn('No videos found in Google Drive. Check your Folder ID and permissions.');
            console.log('Falling back to local public folder...');
            videos = getLocalVideos();
        } else {
            console.log(`Successfully fetched ${videos.length} videos from Google Drive.`);
        }
    } else {
        console.log('No Google Drive credentials found or they are incomplete. Using local public folder.');
        videos = getLocalVideos();
    }

    fs.writeFileSync(path.join(publicDir, 'videos.json'), JSON.stringify(videos, null, 2));
    console.log(`Manifest updated with ${videos.length} videos.`);
}

async function fetchAllVideosFromDrive(currentFolderId, currentApiKey) {
    let allVideos = [];

    try {
        console.log(`Querying folder: ${currentFolderId}`);
        const query = `'${currentFolderId}'+in+parents+and+mimeType+contains+'video/mp4'+and+trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&key=${currentApiKey}`;
        
        const filesResponse = await fetch(url);
        const filesData = await filesResponse.json();
        
        if (filesData.error) {
            console.error(`Google Drive API Error (Files) for folder ${currentFolderId}: ${filesData.error.message}`);
            return [];
        }

        if (filesData.files) {
            console.log(`Found ${filesData.files.length} videos in folder ${currentFolderId}`);
            const folderVideos = filesData.files.map(file => ({
                name: file.name,
                url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${currentApiKey}`
            }));
            allVideos = [...allVideos, ...folderVideos];
        }

        const folderQuery = `'${currentFolderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`;
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&key=${currentApiKey}`;
        
        const foldersResponse = await fetch(folderUrl);
        const foldersData = await foldersResponse.json();

        if (foldersData.error) {
            console.error(`Google Drive API Error (Folders) for folder ${currentFolderId}: ${foldersData.error.message}`);
        } else if (foldersData.files && foldersData.files.length > 0) {
            console.log(`Found ${foldersData.files.length} subfolders in folder ${currentFolderId}`);
            for (const folder of foldersData.files) {
                const subfolderVideos = await fetchAllVideosFromDrive(folder.id, currentApiKey);
                allVideos = [...allVideos, ...subfolderVideos];
            }
        }
    } catch (error) {
        console.error(`Network or Parsing Error fetching from folder ${currentFolderId}:`, error);
    }

    return allVideos;
}

function getLocalVideos() {
    try {
        const files = fs.readdirSync(publicDir);
        const localVideos = files
            .filter(file => file.toLowerCase().endsWith('.mp4'))
            .map(file => ({
                name: file,
                url: `/${file}`
            }));
        return localVideos;
    } catch (error) {
        console.error('Error reading local public folder:', error);
        return [];
    }
}

generateManifest();
