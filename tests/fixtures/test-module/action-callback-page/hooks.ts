import { useCallback } from 'react';
import { deleteByIdAPI, updateVehicleStatusAPI } from './services';
import { useModalOpen } from 'procomponents';

export function useRowActions(onRefresh: () => void) {
  const onDelete = useCallback(
    async (data: any) => {
      await deleteByIdAPI({ id: data.id });
      onRefresh();
    },
    [onRefresh]
  );

  const onArchive = useCallback(
    async (data: any) => {
      await updateVehicleStatusAPI({ id: data.id, status: 'ARCHIVED' });
      onRefresh();
    },
    [onRefresh]
  );

  const { onItemClick: onPreview } = useModalOpen();

  return { onDelete, onArchive, onPreview };
}
