import { useEffect, useState } from 'react';
import { simplePageFindListApi, simplePageSaveApi } from './services';

export function useSimplePageData() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    simplePageFindListApi({}).then((res) => {
      setList(res.data || []);
      setLoading(false);
    });
  }, []);

  return { list, loading };
}

export function useDeleteItem() {
  const handleDelete = (record: any) => {
    if (confirm('确认删除？')) {
      simplePageSaveApi({ id: record.id, deleted: true });
    }
  };

  return { handleDelete };
}
