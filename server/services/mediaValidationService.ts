/**
 * Allowed media types for V1 Video Editor
 * Sensible constraints:
 * - Video: MP4, WebM, QuickTime (MOV)
 * - Audio: MP3, WAV, AAC, OGG
 * - Images: PNG, JPEG, WebP, SVG
 * 
 * Maximum upload size: 500MB for video/audio, 20MB for images
 */

export interface MediaTypeRule {
  category: 'video' | 'audio' | 'image';
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxSizeBytes: number;
}

export const MEDIA_VALIDATION_RULES: Record<'video' | 'audio' | 'image', MediaTypeRule> = {
  video: {
    category: 'video',
    allowedMimeTypes: [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-matroska',
    ],
    allowedExtensions: ['mp4', 'webm', 'mov', 'mkv'],
    maxSizeBytes: 500 * 1024 * 1024, // 500 MB
  },
  audio: {
    category: 'audio',
    allowedMimeTypes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
    ],
    allowedExtensions: ['mp3', 'wav', 'aac', 'ogg', 'webm'],
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB
  },
  image: {
    category: 'image',
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
    ],
    allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
    maxSizeBytes: 25 * 1024 * 1024, // 25 MB
  },
};

export interface ValidationResult {
  isValid: boolean;
  category?: 'video' | 'audio' | 'image';
  extension?: string;
  error?: string;
  statusCode?: number;
}

export function validateMediaUploadRequest(params: {
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
}): ValidationResult {
  const { filename, mimeType, fileSizeBytes } = params;

  if (!filename || typeof filename !== 'string') {
    return { isValid: false, error: 'Filename is required and must be a string.', statusCode: 400 };
  }

  if (!mimeType || typeof mimeType !== 'string') {
    return { isValid: false, error: 'MIME type is required and must be a string.', statusCode: 400 };
  }

  if (typeof fileSizeBytes !== 'number' || fileSizeBytes <= 0 || !Number.isFinite(fileSizeBytes)) {
    return { isValid: false, error: 'File size must be a positive integer in bytes.', statusCode: 400 };
  }

  // Extract extension
  const extMatch = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!extMatch) {
    return { isValid: false, error: 'File must have a valid extension (e.g. .mp4, .mp3, .png).', statusCode: 400 };
  }
  const extension = extMatch[1];

  // Determine category by matching MIME type or extension
  let matchedRule: MediaTypeRule | null = null;
  const normalizedMime = mimeType.toLowerCase();

  for (const rule of Object.values(MEDIA_VALIDATION_RULES)) {
    if (rule.allowedMimeTypes.includes(normalizedMime) || rule.allowedExtensions.includes(extension)) {
      matchedRule = rule;
      break;
    }
  }

  if (!matchedRule) {
    return {
      isValid: false,
      error: `Unsupported media format: MIME type "${mimeType}" and extension ".${extension}" are not allowed. Supported formats: MP4, WebM, MOV, MP3, WAV, AAC, PNG, JPEG, WebP.`,
      statusCode: 400,
    };
  }

  // Verify extension matches category
  if (!matchedRule.allowedExtensions.includes(extension)) {
    return {
      isValid: false,
      error: `File extension ".${extension}" does not match the declared MIME type "${mimeType}".`,
      statusCode: 400,
    };
  }

  // Verify file size limit
  if (fileSizeBytes > matchedRule.maxSizeBytes) {
    const maxMb = Math.floor(matchedRule.maxSizeBytes / (1024 * 1024));
    return {
      isValid: false,
      error: `File size exceeds the ${maxMb}MB limit for ${matchedRule.category} files.`,
      statusCode: 413,
    };
  }

  return {
    isValid: true,
    category: matchedRule.category,
    extension,
  };
}
