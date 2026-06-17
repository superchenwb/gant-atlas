/**
 * 模拟详情页动态 schema：根据类型返回不同字段。
 */

export const getFormSchema = (type: string) => {
  const base = {
    code: {
      title: tr('编码'),
      componentType: 'Input',
    },
    name: {
      title: tr('名称'),
      componentType: 'Input',
    },
  };

  if (type === 'advanced') {
    return {
      ...base,
      effectiveDate: {
        title: tr('生效日期'),
        componentType: 'DatePicker',
      },
    };
  }

  return base;
};
