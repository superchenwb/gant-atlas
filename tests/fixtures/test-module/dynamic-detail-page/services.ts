import { request } from '@ibom/core';

export const saveDynamicDetailApi = (data: any) => request.post('/dynamic-detail/save', data);

export const findDynamicDetailApi = (id: string) => request.get(`/dynamic-detail/${id}`);
