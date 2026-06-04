export const searchSchema = {
  materialCode: {
    title: tr('物料编码'),
    componentType: 'Input',
    required: true,
  },
  status: {
    title: tr('状态'),
    componentType: 'CodeList',
    options: {
      codeType: 'MATERIAL_STATUS',
    },
  },
  createDate: {
    title: tr('创建日期'),
    componentType: 'DatePicker',
  },
  dateRange: {
    title: tr('日期范围'),
    componentType: 'RangePicker',
  },
  orgId: {
    title: tr('组织'),
    componentType: 'TreeSelect',
    options: {
      treeType: 'ORG',
      multiple: true,
    },
  },
  userId: {
    title: tr('负责人'),
    componentType: 'UserSelect',
  },
  supplierId: {
    title: tr('供应商'),
    componentType: 'LoupeSelect',
    options: {
      searchField: 'supplierName',
    },
  },
  keyword: {
    title: tr('关键词'),
    componentType: 'AutoComplete',
    options: {
      dataSource: 'history_keywords',
    },
  },
  unknownField: {
    title: tr('未知组件'),
    componentType: someVariable,
  },
};

export const gridSchema = [
  {
    fieldName: 'materialCode',
    title: tr('物料编码'),
    width: 120,
    componentType: 'Input',
  },
  {
    fieldName: 'status',
    title: tr('状态'),
    componentType: 'CodeList',
    options: {
      codeType: 'MATERIAL_STATUS',
    },
  },
  {
    fieldName: 'createDate',
    title: tr('创建日期'),
    width: 180,
  },
];
