/**
 * Golden Standard 格式定义
 *
 * 人工标注的 "正确" 输出，用于衡量 scanner 的准确率。
 * 为 fixture 页面创建对应的 golden standard 文件（如 simple-page.golden.json）
 */

/** 路由 golden entry */
export interface GoldenRoute {
  path: string;
  component: string;
  title?: string;
}

/** 字段 golden entry */
export interface GoldenField {
  name: string;
  title: string;
  componentType?: string;
  options?: Record<string, unknown>;
}

/** 列 golden entry */
export interface GoldenColumn {
  fieldName: string;
  title: string;
  componentType?: string;
  options?: Record<string, unknown>;
}

/** API golden entry */
export interface GoldenApi {
  name: string;
}

/** 单个页面的 golden standard */
export interface PageGoldenStandard {
  pageId: string;
  pageName: string;
  module: string;
  routes?: GoldenRoute[];
  fields?: GoldenField[];
  columns?: GoldenColumn[];
  apis?: GoldenApi[];
}

/** 整个项目的 golden standard */
export interface ProjectGoldenStandard {
  projectName: string;
  version: string;
  createdAt: string;
  pages: PageGoldenStandard[];
}
