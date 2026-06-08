import React from 'react';
import { Button, ActionButton } from '@company/components';
import { useSimplePageData, useDeleteItem } from './hooks';

export default function SimplePage() {
  const { list, loading } = useSimplePageData();
  const { handleDelete } = useDeleteItem();

  const handleAdd = () => {
    console.log('add');
  };

  const canDelete = (record: any) => record.status !== 'archived';

  return (
    <div>
      <Button onClick={handleAdd} disabled={loading}>
        新增
      </Button>
      <ActionButton
        onClick={(record) => handleDelete(record)}
        disabled={(record) => !canDelete(record)}
      >
        删除
      </ActionButton>
      <a href="/export">导出</a>
    </div>
  );
}
