import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';

export interface CustomYmlConfig {
  pageTitle?: string;
  pageType?: string;
  route?: string;
  pageFunction?: string;
  files?: {
    main?: string;
    search?: string;
    grid?: string;
    button?: string;
  };
}

export function loadCustomYml(pagePath: string): CustomYmlConfig | null {
  const customPath = join(pagePath, 'custom.yml');
  try {
    const raw = readFileSync(customPath, 'utf-8');
    return yaml.load(raw) as CustomYmlConfig;
  } catch {
    return null;
  }
}

export async function loadCustomYmlAsync(pagePath: string): Promise<CustomYmlConfig | null> {
  const customPath = join(pagePath, 'custom.yml');
  try {
    const raw = await readFile(customPath, 'utf-8');
    return yaml.load(raw) as CustomYmlConfig;
  } catch {
    return null;
  }
}
