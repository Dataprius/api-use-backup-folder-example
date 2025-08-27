// --------------------------------------------------------------------------------------
// Backup from a Dataprius folder to local
// --------------------------------------------------------------------------------------
// Requirements:
// npm install dotenv axios

// --------------------------------------------------------------------------------------
// Required libs
// --------------------------------------------------------------------------------------
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require('dotenv').config();
axios.defaults.maxBodyLength = Infinity;

// --------------------------------------------------------------------------------------
// CONFIG 
// --------------------------------------------------------------------------------------
const API_BASE = "https://api.v2.dataprius.com";

// For security, in a ".env" file set this variables (DP_CLIENT_ID and DP_CLIENT_SECRET).
// Help: In the Dataprius application. In the Desktop window, click on the Home button at the bottom left.
// Start-> Configuration -> Api Keys to get this values
const CLIENT_ID = process.env.DP_CLIENT_ID;
const CLIENT_SECRET = process.env.DP_CLIENT_SECRET;

// The Dataprius folder path you want to backup
const DATAPRIUS_DIR = process.env.DP_FOLDER_DIR || "/TEST";
// Local folder to save backup
const LOCAL_BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, "dataprius_backup");

// --------------------------------------------------------------------------------------
// HELPERS
// --------------------------------------------------------------------------------------
function Log(...args) 
{
	console.log(new Date().toISOString(), ...args);
}

// --------------------------------------------------------------------------------------
// AUTH
// --------------------------------------------------------------------------------------
async function GetAccessToken() 
{
	var token = "";
	// standard OAuth2
	try 
	{
		const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
		var config = 
		{
			method: 'get',
			maxBodyLength: Infinity,
			url: `${API_BASE}/oauth/token`,
			headers: 
			{
				'Authorization': "Basic " + basicAuth,
				'Accept': 'application/json'
			}
		};
	
		token = await axios(config).then(function (response) 
		{
			return response.data.access_token;
		}).catch(function (error) {
			Log(error);
		});
	} 
	catch (err) 
	{
		throw new Error(`Failed to get access token: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
	}
	return token;
}

// --------------------------------------------------------------------------------------
// FOLDER / FILE LIST
// --------------------------------------------------------------------------------------
async function GetFolderIdFromPath(token, folderPath) 
{
	try 
	{
		const res = await axios.post(
			`${API_BASE}/folders/getpath`,
			{ Path: folderPath },
			{ headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
		);
		const id = res.data.data[0].ID;
		if (!id) 
		{
			throw new Error("Can't find folder id in getpath response: " + JSON.stringify(res.data));
		}
		return String(id);
	} 
	catch (err) 
	{
		throw new Error(`GetFolderIdFromPath error: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
	}
}

async function ListSubfolders(token, folderId) 
{
	let page = 1;
	let allFolders = [];

	while (true) 
	{
		const url = `${API_BASE}/folders/list/${encodeURIComponent(folderId)}`;

		const res = await axios.post(
			url,
			{ Page: String(page) },
			{ headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
		);

		const folders = res.data.data;
		allFolders = allFolders.concat(folders);

		const meta = res.data.meta;
		page++;
		if (page > meta.pagination.total_pages) break; // last page reached
	}

  return allFolders;
}

async function ListFilesInFolder(token, folderId) 
{
	let page = 1;
	let allFiles = [];

	while (true) 
	{
		const url = `${API_BASE}/folders/files/${encodeURIComponent(folderId)}`;
		const res = await axios.post(
			url,
			{ Page: String(page) },
			{ headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
		);

		const files = res.data.data;
		allFiles = allFiles.concat(files);

		const meta = res.data.meta;
		page++;
		if (page > meta.pagination.total_pages) break; // last page reached
	}

	return allFiles;
}

// check if local file exists and is up-to-date
function IsFileUpToDate(localFilePath, fileObj) 
{
	if (!fs.existsSync(localFilePath)) return false;
	const stats = fs.statSync(localFilePath);

	// Compare file size
	if (fileObj.Size && stats.size !== fileObj.Size) return false;

	// Compare modification date
	const remoteTime = new Date(fileObj.Modified).getTime();
    const localTime = stats.mtime.getTime();
	
	// Allow a small margin because of timezone/rounding differences
	if (Math.abs(remoteTime - localTime) > 2000) return false;
	return true;
}

async function DownloadFile(token, fileObj, localDir) 
{
	const fileId = fileObj.ID;
	var name = fileObj.Name;
	name = name.normalize("NFC");
	const localFilePath = path.join(localDir, name);
	
	if (IsFileUpToDate(localFilePath, fileObj)) 
	{
		return true;
	}
	
	Log ("Downloading ... " + localFilePath + ", (" + fileId + ")");
	const url = `${API_BASE}/files/download/${encodeURIComponent(fileId)}`;
    //const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, responseType: "arraybuffer" });
	const res = await axios.get(url,
		{
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				Authorization: `Bearer ${token}`,
			},
			responseType: "arraybuffer",
		}
	);
    fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    fs.writeFileSync(localFilePath, res.data);
	
	// Apply remote modification time
	try 
	{
		const mtime = new Date(fileObj.Modified);
		fs.utimesSync(localFilePath, mtime, mtime); // atime, mtime
	} catch (err) {}
}

// --------------------------------------------------------------------------------------
// RECURSIVE BACKUP
// --------------------------------------------------------------------------------------
async function BackupFolderRecursive(token, folderId, localDir) 
{
	Log("Listing localDir:", localDir);
	fs.mkdirSync(localDir, {recursive: true});

	// list files and download them
	const files = await ListFilesInFolder(token, folderId);
	Log(`Found ${files.length} files in folder`);
	
	// Download files
	for (const fileObj of files) 
	{
		try 
		{
			await DownloadFile(token, fileObj, localDir);
		} catch (err) {
			Log(`ERROR downloading file in folder ${folderId}:`, err.message || err);
		}
	}
	
	// list subfolders and recurse
	const subfolders = await ListSubfolders(token, folderId);
	for (const sf of subfolders) 
	{
		await BackupFolderRecursive(token, sf.ID, path.join(localDir, sf.Name));
	}
}

// --------------------------------------------------------------------------------------
// MAIN 
// --------------------------------------------------------------------------------------
(async () => {
	try 
	{
		Log("Getting access token...");
		const token = await GetAccessToken();
		
		Log(`Resolving folder ID for path "${DATAPRIUS_DIR}" ...`);
		const rootFolderId = await GetFolderIdFromPath(token, DATAPRIUS_DIR);
		
		const destination = path.join(LOCAL_BACKUP_DIR, DATAPRIUS_DIR.replace(/^\//, "").replace(/\//g, path.sep) || "root");
		Log("Starting backup in: ", destination);
		await BackupFolderRecursive(token, rootFolderId, destination);

		Log("Backup finished successfully.");
	}
	catch (err) 
	{
		Log("Backup failed:", err.response ? (err.response.data || err.response.statusText) : (err.message || err));
	}
})();