/**
 * Transcript Parser — WebinarPulse
 *
 * Parses transcript text in SRT, VTT, YouTube text, or plain text formats.
 * Returns an array of segments: [{ start_seconds, end_seconds, text }]
 */

/**
 * Auto-detect format and parse transcript
 * @param {string} raw - Raw transcript text
 * @param {number} videoDurationSeconds - Video duration for plain text fallback
 * @returns {{ format: string, segments: Array<{start_seconds: number, end_seconds: number, text: string}> }}
 */
export function parseTranscript(raw, videoDurationSeconds = 0) {
  const trimmed = raw.trim();

  if (!trimmed) return { format: "plain", segments: [] };

  // Detect format
  if (trimmed.startsWith("WEBVTT")) {
    return { format: "vtt", segments: parseVTT(trimmed) };
  }

  if (/^\d+\r?\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(trimmed)) {
    return { format: "srt", segments: parseSRT(trimmed) };
  }

  if (/^\d{1,2}:\d{2}(:\d{2})?\s+\S/m.test(trimmed)) {
    return { format: "youtube_text", segments: parseYouTubeText(trimmed) };
  }

  // Fallback: plain text
  return { format: "plain", segments: parsePlainText(trimmed, videoDurationSeconds) };
}

/**
 * Parse SRT format
 * Example:
 *   1
 *   00:00:01,000 --> 00:00:05,500
 *   Hello world
 */
function parseSRT(text) {
  const segments = [];
  // Split into blocks separated by blank lines
  const blocks = text.split(/\r?\n\r?\n/).filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length < 3) continue;

    // Line 1: index (skip)
    // Line 2: timecodes
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!timeMatch) continue;

    const start = srtTimeToSeconds(timeMatch[1]);
    const end = srtTimeToSeconds(timeMatch[2]);
    // Lines 3+: text
    const text_content = lines.slice(2).join(" ").trim();

    if (text_content) {
      segments.push({ start_seconds: start, end_seconds: end, text: text_content });
    }
  }

  return segments;
}

/**
 * Parse VTT format (WebVTT)
 * Same as SRT but starts with "WEBVTT" header
 */
function parseVTT(text) {
  // Remove WEBVTT header and any metadata
  const body = text.replace(/^WEBVTT[^\n]*\n(NOTE[^\n]*\n)*\n?/i, "");
  const segments = [];
  const blocks = body.split(/\r?\n\r?\n/).filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);

    // Find the timecode line
    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/\d{2}:\d{2}[:.]\d{3}\s*-->/.test(lines[i])) {
        timeLineIdx = i;
        break;
      }
    }
    if (timeLineIdx === -1) continue;

    const timeMatch = lines[timeLineIdx].match(
      /(\d{2}:\d{2}:\d{2}[:.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[:.]\d{3})/
    );
    if (!timeMatch) continue;

    const start = srtTimeToSeconds(timeMatch[1]);
    const end = srtTimeToSeconds(timeMatch[2]);
    const text_content = lines.slice(timeLineIdx + 1).join(" ").replace(/<[^>]+>/g, "").trim();

    if (text_content) {
      segments.push({ start_seconds: start, end_seconds: end, text: text_content });
    }
  }

  return segments;
}

/**
 * Parse YouTube Studio text format
 * Example:
 *   0:00 Hello world
 *   0:05 Another line
 *   1:23:45 Optional hours
 */
function parseYouTubeText(text) {
  const segments = [];
  const lines = text.split(/\r?\n/).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/);
    if (!match) continue;

    const start = youtubeTimeToSeconds(match[1]);
    const content = match[2].trim();

    // End time = start of next segment, or +5s for the last one
    let end;
    if (i + 1 < lines.length) {
      const nextMatch = lines[i + 1].match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
      end = nextMatch ? youtubeTimeToSeconds(nextMatch[1]) : start + 5;
    } else {
      end = start + 5;
    }

    if (content) {
      segments.push({ start_seconds: start, end_seconds: end, text: content });
    }
  }

  return segments;
}

/**
 * Parse plain text (no timecodes)
 * Splits into N equal segments based on video duration
 */
function parsePlainText(text, videoDurationSeconds) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (!sentences.length) return [];

  const duration = videoDurationSeconds || sentences.length * 10;
  const segmentDuration = duration / sentences.length;

  return sentences.map((sentence, i) => ({
    start_seconds: Math.round(i * segmentDuration),
    end_seconds: Math.round((i + 1) * segmentDuration),
    text: sentence,
  }));
}

// --- Time helpers ---

function srtTimeToSeconds(time) {
  // Handles "HH:MM:SS,mmm" or "HH:MM:SS.mmm"
  const parts = time.replace(",", ".").split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseFloat(parts[2]);
  return Math.round(h * 3600 + m * 60 + s);
}

function youtubeTimeToSeconds(time) {
  // Handles "M:SS" or "H:MM:SS"
  const parts = time.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parts[0] * 60 + parts[1];
}
