export interface PresignUploadResponse {
  asset?: {
    id: string;
    userId?: string;
    storageKey?: string;
    originalFilename?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    ingestionStatus?: string;
    createdAt?: string | Date;
  };
  upload?: {
    uploadUrl: string;
    httpMethod?: string;
    headers?: Record<string, string>;
    expiresInSeconds?: number;
    isR2Configured?: boolean;
  };
  // Backwards compatibility with flat structure
  assetId?: string;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
}

export interface ResolvedUploadContract {
  assetId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string> | undefined;
}

/**
 * Parses and validates the presigned upload URL response from /api/media/upload-url.
 * Supports both canonical nested schema ({ asset: { id }, upload: { uploadUrl, headers } })
 * and fallback flat schema ({ assetId, uploadUrl, requiredHeaders }).
 */
export function parsePresignUploadResponse(data: unknown): ResolvedUploadContract {
  if (!data || typeof data !== 'object') {
    throw new Error('Upload authorization failed: invalid response payload from server.');
  }

  const payload = data as PresignUploadResponse;
  const assetId = payload.asset?.id ?? payload.assetId;
  const uploadUrl = payload.upload?.uploadUrl ?? payload.uploadUrl;
  const requiredHeaders = payload.upload?.headers ?? payload.requiredHeaders;

  if (!assetId || typeof assetId !== 'string') {
    throw new Error('Upload authorization failed: server response missing asset ID.');
  }

  if (!uploadUrl || typeof uploadUrl !== 'string') {
    throw new Error('Upload authorization failed: server response missing upload URL.');
  }

  return {
    assetId,
    uploadUrl,
    requiredHeaders: requiredHeaders && typeof requiredHeaders === 'object' ? requiredHeaders : undefined,
  };
}
