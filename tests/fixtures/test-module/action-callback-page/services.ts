import { request } from 'procomponents';

export const deleteByIdAPI = (params: { id: string }) =>
  request('/api/delete', { method: 'POST', params });

export const updateVehicleStatusAPI = (params: { id: string; status: string }) =>
  request('/api/archive', { method: 'POST', params });
