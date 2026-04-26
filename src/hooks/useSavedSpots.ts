/**
 * useSavedSpots — 저장된 스팟 관리 훅
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { SavedType } from '@/types';

interface UseSavedSpotsReturn {
  saveSpot: (spotId: string, savedType: SavedType) => Promise<void>;
  unsaveSpot: (spotId: string) => Promise<void>;
  toggleSave: (spotId: string, currentType: SavedType | null) => Promise<void>;
  isSaving: boolean;
  error: string | null;
}

export function useSavedSpots(): UseSavedSpotsReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeDog = useAppStore(s => s.activeDog);

  const saveSpot = useCallback(async (spotId: string, savedType: SavedType) => {
    if (!activeDog?.dog_id) return;

    setIsSaving(true);
    setError(null);

    try {
      const { error: upsertError } = await supabase
        .from('saved_spots')
        .upsert(
          {
            dog_id: activeDog.dog_id,
            spot_id: spotId,
            saved_type: savedType,
          },
          { onConflict: 'dog_id,spot_id' }
        );

      if (upsertError) throw upsertError;
    } catch (err: any) {
      setError('저장에 실패했어요');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [activeDog]);

  const unsaveSpot = useCallback(async (spotId: string) => {
    if (!activeDog?.dog_id) return;

    setIsSaving(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('saved_spots')
        .delete()
        .eq('dog_id', activeDog.dog_id)
        .eq('spot_id', spotId);

      if (deleteError) throw deleteError;
    } catch (err: any) {
      setError('저장 취소에 실패했어요');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [activeDog]);

  const toggleSave = useCallback(async (spotId: string, currentType: SavedType | null) => {
    if (currentType) {
      await unsaveSpot(spotId);
    } else {
      await saveSpot(spotId, 'want_to_go');
    }
  }, [saveSpot, unsaveSpot]);

  return { saveSpot, unsaveSpot, toggleSave, isSaving, error };
}
