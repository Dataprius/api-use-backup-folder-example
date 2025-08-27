# api-use-backup-folder-example
Script in node.js to download a folder from your Dataprius account to your hard drive. 
To have a local backup of some cloud folder in your computer, external hard drive or server.

The script use the Dataprius API (https://api.dataprius.org/).

# Requirements
1. Have a Dataprius account (https://dataprius.com/en/downloads.html)
2. Enable your API Keys. (https://dataprius.com/en/api-developers-zone-version-2-0.html)
3. Downloading and installing Node.js and npm.
4. Configure the script values.

# Usage
1. Configure your API access, source and destination folder.
  You only have to configure the .env file with:
```
    DP_CLIENT_ID=your client ID
    DP_CLIENT_SECRET=your secret code
    DP_FOLDER_DIR=/TEST
    BACKUP_DIR=c:\your folder path
```
2. Install node.js dependencies
```
   npm install dotenv axios
```
4. Run the script:
```
   node DatapriusFolderToLocal.js
```

# Recommendation
Install pm2 to schedule the script execution. (https://pm2.keymetrics.io/)
