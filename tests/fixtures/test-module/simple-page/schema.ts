export const searchSchema = {
  userName: {
    title: tr('用户名'),
    componentType: 'Input',
  },
  status: {
    title: tr('状态'),
    componentType: 'Select',
  },
};

export const gridSchema = [
  {
    fieldName: 'userName',
    title: tr('用户名'),
    flex: 1,
  },
  {
    fieldName: 'status',
    title: tr('状态标签'),
    flex: 1,
  },
];
