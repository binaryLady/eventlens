// ============================================
// EVENT PHOTO ANALYZER
// Google Apps Script + Gemini API
// ============================================
//
// SETUP:
// 1. Create a Google Sheet
// 2. Extensions > Apps Script > paste this
// 3. Click "+" next to Services > add "Drive API" (v3)
// 4. Set your constants below
// 5. Run > analyzeEventPhotos
// 6. Authorize when prompted
//
// OUTPUT: Sheet with columns:
//   Filename | Drive URL | Folder | Visible Text | People Descriptions | Scene | Face Count | Processed At
// ============================================

const FOLDER_ID = '1iK2WDmcmSaXEhv9k-PpagcR17LLiAV40';      // From Drive folder URL after /folders/
const GEMINI_API_KEY = 'AIzaSyCqjWIzPnF5IaV0ZczLnv8uJlSOi97UCX8';    // From aistudio.google.com/apikey
const MODEL = 'gemini-2.5-pro';
const BATCH_SIZE = 100;                        // Process N images per run (avoid timeout)
const NOTIFY_EVERY = 500;                      // Email you every N images (0 = only on completion)

/**
 * Main function — run this.
 * Processes images from Drive folder, analyzes with Gemini, writes to active sheet.
 * Safe to re-run: skips already-processed files.
 * Safe to cancel: rows are written immediately, next run resumes where you left off.
 */
function analyzeEventPhotos() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Set up headers if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Filename',
      'Drive URL',
      'Folder',
      'Visible Text',
      'People Descriptions',
      'Scene Description',
      'Face Count',
      'Processed At'
    ]);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  }

  // Get already-processed files to skip (folder+filename as key, exclude errors for retry)
  const processedFiles = new Set();
  if (sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    for (const row of rows) {
      const filename = row[0];
      const folder = row[2];
      const visibleText = String(row[3]);
      // Skip errors so they get retried next run
      if (!visibleText.startsWith('ERROR:')) {
        processedFiles.add(folder + '/' + filename);
      }
    }
  }

  // List image files in folder AND all subfolders (recursive)
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  const files = [];

  function collectImages(parentFolder) {
    const folderName = parentFolder.getName();

    const fileIterator = parentFolder.getFiles();
    while (fileIterator.hasNext()) {
      const file = fileIterator.next();
      if (imageTypes.includes(file.getMimeType()) && !processedFiles.has(folderName + '/' + file.getName())) {
        files.push({ file: file, folder: folderName });
      }
    }

    const subFolders = parentFolder.getFolders();
    while (subFolders.hasNext()) {
      collectImages(subFolders.next());
    }
  }

  collectImages(folder);

  Logger.log(`Found ${files.length} unprocessed images. Processing ${Math.min(files.length, BATCH_SIZE)}...`);

  // Process in batches to avoid Apps Script 6-minute timeout
  const batch = files.slice(0, BATCH_SIZE);
  for (const { file, folder: folderName } of batch) {
    try {
      const analysis = analyzeImage_(file);
      sheet.appendRow([
        file.getName(),
        file.getUrl(),
        folderName,
        analysis.visible_text || '',
        analysis.people_descriptions || '',
        analysis.scene_description || '',
        analysis.face_count || 0,
        new Date().toISOString()
      ]);

      Logger.log(`✓ ${folderName}/${file.getName()}`);
      // Small delay to respect rate limits
      Utilities.sleep(1000);
    } catch (error) {
      Logger.log(`✗ ${file.getName()}: ${error.message}`);
      sheet.appendRow([
        file.getName(),
        file.getUrl(),
        folderName,
        'ERROR: ' + error.message,
        '', '', 0,
        new Date().toISOString()
      ]);
    }
  }

  // Progress summary
  const totalProcessed = sheet.getLastRow() - 1;
  const remaining = files.length - batch.length;
  const errorCount = sheet.getRange(2, 4, totalProcessed, 1).getValues()
    .flat().filter(v => String(v).startsWith('ERROR')).length;

  const summary = [
    '📸 Event Photo Analyzer Progress',
    `Processed this batch: ${batch.length}`,
    `Total processed so far: ${totalProcessed}`,
    `Remaining: ${Math.max(0, remaining)}`,
    `Errors: ${errorCount}`,
    `Sheet: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`
  ].join('\n');

  Logger.log(summary);

  if (remaining <= 0) {
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: '✅ Event Photo Analysis Complete',
      body: `All images have been processed!\n\n${summary}\n\nThe auto-process trigger has been removed.`
    });
    deleteAutoProcess();
    Logger.log('🎉 All images processed! Trigger removed. Email sent.');
  } else if (NOTIFY_EVERY > 0 && totalProcessed % NOTIFY_EVERY < BATCH_SIZE) {
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: `📸 Photo Analysis Progress: ${totalProcessed} done, ${remaining} remaining`,
      body: summary
    });
  }
}

/**
 * Send a single image to Gemini for analysis.
 * Returns structured JSON with text, people, scene info.
 */
function analyzeImage_(file) {
  const blob = file.getBlob();
  const base64Data = Utilities.base64Encode(blob.getBytes());
  const mimeType = file.getMimeType();

  const prompt = `Analyze this event photo. Return ONLY valid JSON with these fields:
{
  "visible_text": "ALL text visible in the image - banners, signs, screens, t-shirts, lanyards, stickers, name tags. Include everything, even partial text. If no text, return empty string.",
  "people_descriptions": "Describe each person visible. Include: approximate age range, gender presentation, hair color/style, glasses y/n, notable clothing (color of shirt, hoodie, etc), any visible name tag or lanyard text. Separate multiple people with semicolons.",
  "scene_description": "Brief description of what's happening - presentation, networking, coding, panel, etc. Include notable objects like laptops, microphones, whiteboards.",
  "face_count": number_of_faces_visible
}
Be thorough with visible_text - this will be used for search. Return ONLY the JSON, no markdown formatting.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  if (result.error) {
    throw new Error('API: ' + result.error.message);
  }

  if (!result.candidates || !result.candidates[0] || !result.candidates[0].content || !result.candidates[0].content.parts) {
    const reason = result.candidates && result.candidates[0] && result.candidates[0].finishReason
      ? result.candidates[0].finishReason
      : 'unknown';
    throw new Error('Empty response from Gemini (reason: ' + reason + ')');
  }

  let text = result.candidates[0].content.parts[0].text;

  // Clean markdown fences
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // Fix smart quotes that Gemini sometimes outputs
  text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  // Try to extract JSON if there's extra text around it
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Search the analyzed photos for a text query.
 */
function searchPhotos() {
  const query = Browser.inputBox('Search Event Photos', 'Enter search term (e.g., "Hard Mode", "red shirt"):', Browser.Buttons.OK_CANCEL);
  if (query === 'cancel' || !query) return;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const queryLower = query.toLowerCase();
  const matches = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const searchableText = [
      row[0],  // filename
      row[2],  // folder
      row[3],  // visible text
      row[4],  // people descriptions
      row[5]   // scene description
    ].join(' ').toLowerCase();

    if (searchableText.includes(queryLower)) {
      matches.push({
        filename: row[0],
        url: row[1],
        folder: row[2],
        context: getMatchContext_(searchableText, queryLower)
      });
    }
  }

  let resultsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Search Results');
  if (!resultsSheet) {
    resultsSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Search Results');
  }

  resultsSheet.clear();
  resultsSheet.appendRow([`Search: "${query}"`, `${matches.length} results`, new Date().toISOString()]);
  resultsSheet.appendRow(['Filename', 'Drive URL', 'Folder', 'Match Context']);
  resultsSheet.getRange(2, 1, 1, 4).setFontWeight('bold');

  for (const match of matches) {
    resultsSheet.appendRow([match.filename, match.url, match.folder, match.context]);
  }

  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(resultsSheet);
  Browser.msgBox(`Found ${matches.length} photos matching "${query}"`);
}

/**
 * Helper: extract context around matching text
 */
function getMatchContext_(text, query) {
  const idx = text.indexOf(query);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 40);
  return '...' + text.substring(start, end) + '...';
}

/**
 * Utility: count total images in folder (run to check before processing)
 */
function countImages() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  let count = 0;

  function countRecursive(parentFolder) {
    const fileIterator = parentFolder.getFiles();
    while (fileIterator.hasNext()) {
      const file = fileIterator.next();
      if (imageTypes.includes(file.getMimeType())) count++;
    }
    const subFolders = parentFolder.getFolders();
    while (subFolders.hasNext()) {
      countRecursive(subFolders.next());
    }
  }

  countRecursive(folder);
  Logger.log(`Total images in folder + subfolders: ${count}`);
  Browser.msgBox(`Total images in folder + subfolders: ${count}`);
}

/**
 * Set up a time-based trigger to auto-process all images.
 * Runs analyzeEventPhotos every 10 minutes until all are done.
 * Run this once — trigger auto-deletes on completion.
 */
function setupAutoProcess() {
  // Delete any existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'analyzeEventPhotos') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger('analyzeEventPhotos')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log(`Auto-process trigger created. Will process ${BATCH_SIZE} images every 10 minutes.`);
  Logger.log('Trigger auto-removes when all images are done.');
}

function deleteAutoProcess() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'analyzeEventPhotos') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  Logger.log('Auto-process trigger deleted.');
}
