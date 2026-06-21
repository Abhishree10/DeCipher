
function doGet(e) {
  var shareId = (e && e.parameter && e.parameter.share) ? e.parameter.share : null;
  var template = HtmlService.createTemplateFromFile('Index');
  template.shareId = shareId;
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
      .setTitle('Translator Workspace')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function analyzeDocument(rawText) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  if (!apiKey || apiKey === 'YOUR_ACTUAL_API_KEY_HERE') {
    return 'Error: GEMINI_API_KEY not set. Go to Project Settings → Script Properties and add it.';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
    Analyze this text and break it down with absolute clarity, precision, and zero conversational fluff: "${rawText}"

    Structure your response clearly with these exact sections:

    URGENCY LEVEL:
    [State High, Medium, or Low directly with a 1-sentence reason]

    QUICK SUMMARY:
    [Provide a direct 1-2 sentence explanation of the core situation and risks]

    CRITICAL DEADLINES:
    [List exact calendar dates extracted from the text]

    ACTION ITEM CHECKLIST:
    [List specific things the user must gather or complete]

    IMMEDIATE NEXT STEPS:
    [List the immediate sequence of actions required]

    SUGGESTED COMMUNICATION SCRIPT:
    [Provide a professional phone script or email draft containing case details, numbers, or emails from the document]

    RECOMMENDED RESOURCES:
    [List specific search keywords or public aid programs relevant to this issue]

    ESCALATION CONTACTS:
    [If urgency is High OR the document involves eviction, medical discharge, benefit termination, legal deadlines, or safety risks — list 2-3 specific hotlines or agencies the user should call immediately, with a one-line description of what each one does. If urgency is Low and no crisis is present, write "No immediate escalation needed."]
  `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());

    if (json.error) {
      return 'API Error: ' + json.error.message;
    }

    if (!json.candidates || !json.candidates[0] || !json.candidates[0].content) {
      return 'Unexpected API response: ' + response.getContentText();
    }

    return json.candidates[0].content.parts[0].text.trim();
  } catch (e) {
    return 'System Processing Error: ' + e.toString();
  }
}

function analyzeImage(base64Data, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  if (!apiKey || apiKey === 'YOUR_ACTUAL_API_KEY_HERE') {
    return 'Error: GEMINI_API_KEY not set. Go to Project Settings → Script Properties and add it.';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
    This is an image of a document. Read all visible text and analyze it with absolute clarity, precision, and zero conversational fluff.

    Structure your response clearly with these exact sections:

    URGENCY LEVEL:
    [State High, Medium, or Low directly with a 1-sentence reason]

    QUICK SUMMARY:
    [Provide a direct 1-2 sentence explanation of the core situation and risks]

    CRITICAL DEADLINES:
    [List exact calendar dates extracted from the text]

    ACTION ITEM CHECKLIST:
    [List specific things the user must gather or complete]

    IMMEDIATE NEXT STEPS:
    [List the immediate sequence of actions required]

    SUGGESTED COMMUNICATION SCRIPT:
    [Provide a professional phone script or email draft containing case details, numbers, or emails from the document]

    RECOMMENDED RESOURCES:
    [List specific search keywords or public aid programs relevant to this issue]

    ESCALATION CONTACTS:
    [If urgency is High OR the document involves eviction, medical discharge, benefit termination, legal deadlines, or safety risks — list 2-3 specific hotlines or agencies the user should call immediately, with a one-line description of what each one does. If urgency is Low and no crisis is present, write "No immediate escalation needed."]
  `;

  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt }
      ]
    }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());

    if (json.error) return 'API Error: ' + json.error.message;
    if (!json.candidates || !json.candidates[0] || !json.candidates[0].content) {
      return 'Unexpected API response: ' + response.getContentText();
    }

    return json.candidates[0].content.parts[0].text.trim();
  } catch (e) {
    return 'System Processing Error: ' + e.toString();
  }
}

/**
 * Saves a Gmail draft with the AI-generated communication script.
 */
function createGmailDraft(scriptText) {
  try {
    GmailApp.createDraft(
      '',
      'Regarding My Case / Documentation Reference',
      scriptText
    );
    return 'Success';
  } catch (e) {
    return 'Gmail Error: ' + e.toString();
  }
}

/**
 * Executes a dynamic OCR extraction using raw HTTP requests.
 */
function uploadAndExtractText(base64Data, mimeType) {
  try {
    const token = ScriptApp.getOAuthToken();
    const boundary = '-------314159265358979323846';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelimiter = '\r\n--' + boundary + '--';

    const metadata = {
      name: 'Temp_OCR_Upload',
      mimeType: 'application/vnd.google-apps.document'
    };

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: ' + mimeType + '\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      closeDelimiter;

    const uploadResponse = UrlFetchApp.fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocr=true&ocrLanguage=en',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        payload: multipartBody,
        muteHttpExceptions: true
      }
    );

    const uploadResult = JSON.parse(uploadResponse.getContentText());
    if (uploadResult.error) throw new Error(uploadResult.error.message);

    const fileId = uploadResult.id;

    const exportResponse = UrlFetchApp.fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      { method: 'GET', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
    );

    const extractedText = exportResponse.getContentText();

    UrlFetchApp.fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (!extractedText || !extractedText.trim()) {
      return "Error: Couldn't extract readable text from the image. Try uploading a clearer photo or paste the text manually.";
    }

    return analyzeDocument(extractedText);

  } catch (e) {
    return 'OCR Error: ' + e.toString() + '\n\nTip: Make sure Drive API access is enabled in your script permissions, or paste the text directly instead.';
  }
}

/**
 * Creates a Google Calendar event with push reminders at
 * 7 days (10080 min), 3 days (4320 min), and 1 day (1440 min) before the deadline.
 */
function createCalendarDeadline(deadlineText) {
  try {
    var cleanText = deadlineText.replace(/[📅✨•]/g, ' ').replace(/\s+/g, ' ').trim();
    var parsedDate = null;
    var m;

    // Pattern 1: YYYY-MM-DD or YYYY/MM/DD
    m = cleanText.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
    if (m) {
      parsedDate = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    }

    // Pattern 2: MM/DD/YYYY or DD/MM/YYYY (numeric only, year last)
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      m = cleanText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
      if (m) {
        parsedDate = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
      }
    }

    // Pattern 3: "Month DD, YYYY" or "Month DD YYYY"  e.g. "June 30, 2025"
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      var monthMap = {
        january:0, february:1, march:2, april:3, may:4, june:5,
        july:6, august:7, september:8, october:9, november:10, december:11,
        jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
      };
      m = cleanText.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})\b/i);
      if (m) {
        parsedDate = new Date(parseInt(m[3]), monthMap[m[1].toLowerCase()], parseInt(m[2]));
      }
    }

    // Pattern 4: "DD Month YYYY"  e.g. "30 June 2025"
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      var monthMap2 = {
        january:0, february:1, march:2, april:3, may:4, june:5,
        july:6, august:7, september:8, october:9, november:10, december:11,
        jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
      };
      m = cleanText.match(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})\b/i);
      if (m) {
        parsedDate = new Date(parseInt(m[3]), monthMap2[m[2].toLowerCase()], parseInt(m[1]));
      }
    }

    // Last resort: tomorrow (with a note in the event description)
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      parsedDate = new Date();
      parsedDate.setDate(parsedDate.getDate() + 1);
      cleanText = cleanText + ' [DATE UNCLEAR — please adjust]';
    }

    var startDate = new Date(parsedDate);
    startDate.setHours(9, 0, 0, 0);

    var endDate = new Date(parsedDate);
    endDate.setHours(10, 0, 0, 0);

    var calendar = CalendarApp.getDefaultCalendar();

    var event = calendar.createEvent(
      '🔴 [DeCipher Deadline] ' + cleanText,
      startDate,
      endDate,
      { description: 'Critical deadline parsed by DeCipher.\n\nOriginal text: ' + deadlineText }
    );

    // Three push reminders: 7 days, 3 days, and 1 day before
    event.addPopupReminder(10080);
    event.addPopupReminder(4320);
    event.addPopupReminder(1440);

    return 'Success';
  } catch (err) {
    return 'Calendar Error: ' + err.toString();
  }
}
