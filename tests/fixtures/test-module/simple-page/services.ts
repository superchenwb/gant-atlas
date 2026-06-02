import { request } from 'procomponents';

export const simplePageFindListApi = (params: any) => {
  return request('/simplePage/findList', {
    method: 'POST',
    data: params,
  });
};

export const simplePageSaveApi = (params: any) => {
  return request('/simplePage/save', {
    method: 'POST',
    data: params,
  });
};

// 非 Api 后缀，应该被忽略
export function helperFunction(data: any) {
  return data;
}
