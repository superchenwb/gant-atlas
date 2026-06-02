/**
 * 业务知识图谱核心类型定义
 *
 * 描述 feature-docs 中可提取的所有业务实体及其关系
 */

// ─────────────────────────────────────────
// 基础实体
// ─────────────────────────────────────────

export interface Page {
  id: string;
  module: string;
  pageName: string;
  pageTitle: string;
  pageType?: string;
  route?: string;
  pageFunction?: string;
}

export interface Field {
  id: string;
  pageId: string;
  fieldLabel: string;
  fieldName: string;
  componentType: string;
  required: boolean;
  defaultValue?: string;
}

export interface GridColumn {
  id: string;
  pageId: string;
  columnTitle: string;
  fieldName?: string;
  displayContent: string;
  editable: boolean;
  width?: number;
  sortable?: boolean;
  dataType?: string;
  align?: 'left' | 'center' | 'right';
}

export interface Button {
  id: string;
  pageId: string;
  buttonName: string;
  scope: string;
  position: string;
  displayCondition: string;
  disabledCondition: string;
  clickResult: string;
  confirmRequired: boolean;
}

export interface API {
  id: string;
  name: string;
  description?: string;
}

// ─────────────────────────────────────────
// 关系边
// ─────────────────────────────────────────

export interface PageHasField {
  pageId: string;
  fieldId: string;
}

export interface PageHasColumn {
  pageId: string;
  columnId: string;
}

export interface PageHasButton {
  pageId: string;
  buttonId: string;
}

export interface FieldCallsAPI {
  fieldId: string;
  apiId: string;
}

export interface PageHasAPI {
  pageId: string;
  apiId: string;
}

export interface ButtonTriggersModal {
  buttonId: string;
  modalName: string;
}

// ─────────────────────────────────────────
// 解析结果
// ─────────────────────────────────────────

export interface ParsedFeatureDoc {
  page: Page;
  fields: Field[];
  columns: GridColumn[];
  buttons: Button[];
  apis: API[];
  relations: {
    pageHasFields: PageHasField[];
    pageHasColumns: PageHasColumn[];
    pageHasButtons: PageHasButton[];
    pageHasApis: PageHasAPI[];
    fieldCallsApis: FieldCallsAPI[];
    buttonTriggersModals: ButtonTriggersModal[];
  };
}

// ─────────────────────────────────────────
// MCP Tool 输入/输出
// ─────────────────────────────────────────

export interface SearchPagesInput {
  keyword: string;
  module?: string;
}

export interface SearchPagesOutput {
  results: Page[];
  total: number;
}

export interface GetPageInput {
  pageId: string;
}

export interface GetPageOutput {
  page: Page;
  fields: Field[];
  columns: GridColumn[];
  buttons: Button[];
  apis: API[];
}

export interface AnalyzeImpactInput {
  apiName?: string;
  fieldName?: string;
  pageId?: string;
}

export interface AnalyzeImpactOutput {
  target: string;
  affectedPages: Page[];
  affectedFields: Field[];
  affectedButtons: Button[];
}

export interface CheckConsistencyInput {
  pageId?: string;
}

export interface CheckConsistencyOutput {
  issues: Array<{
    type: 'missing_doc' | 'doc_outdated' | 'orphan_api';
    description: string;
    suggestion: string;
  }>;
}
