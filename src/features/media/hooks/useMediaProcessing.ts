import { useEffect } from 'react';
import { useAuth } from '@/src/features/auth/AuthContext';
import {
  useMediaProcessingStore,
  type MediaOperation,
  type MediaProcessingStatus,
  type MediaJobState,
} from '../stores/useMediaProcessingStore';

export function useMediaProcessing(assetId?: string) {
  const { accessToken } = useAuth();
  const store = useMediaProcessingStore();

  useEffect(() => {
    // Cleanup active polling on unmount or when assetId changes
    return () => {
      if (assetId) {
        useMediaProcessingStore.getState().stopAssetPolling(assetId);
      }
    };
  }, [assetId]);

  const requestJob = async (operation: MediaOperation, targetAssetId?: string) => {
    const id = targetAssetId || assetId;
    if (!id || !accessToken) return null;
    return store.requestProcessing(id, operation, accessToken);
  };

  const getStatus = (operation: MediaOperation, targetAssetId?: string): MediaProcessingStatus => {
    const id = targetAssetId || assetId;
    if (!id) return 'idle';
    return store.getJobState(id, operation).status;
  };

  const getJob = (operation: MediaOperation, targetAssetId?: string): MediaJobState | null => {
    const id = targetAssetId || assetId;
    if (!id) return null;
    return store.getJobState(id, operation);
  };

  return {
    requestJob,
    getStatus,
    getJob,
    store,
  };
}
