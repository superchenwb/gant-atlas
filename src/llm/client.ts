/**
 * 通用 LLM 客户端
 *
 * 默认实现基于 Anthropic Messages API（与 Kimi / Claude 兼容）。
 * 未配置 ANTHROPIC_API_KEY 时返回 undefined，保证测试与离线环境无感降级。
 */

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmClient {
  complete(messages: LlmMessage[], options?: { system?: string; maxTokens?: number }): Promise<string>;
}

class AnthropicLlmClient implements LlmClient {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
  ) {}

  async complete(messages: LlmMessage[], options?: { system?: string; maxTokens?: number }): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages,
    };
    if (options?.system) {
      body.system = options.system;
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM 请求失败 ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
    };

    if (data.error?.message) {
      throw new Error(`LLM 返回错误: ${data.error.message}`);
    }

    const text = data.content?.[0]?.text;
    if (typeof text !== 'string') {
      throw new Error('LLM 响应格式异常，未找到文本内容');
    }
    return text;
  }
}

/**
 * 根据环境变量创建默认 LLM 客户端。
 *
 * 所需环境变量：
 * - ANTHROPIC_API_KEY
 * - ANTHROPIC_BASE_URL（可选，默认 https://api.anthropic.com）
 * - ANTHROPIC_MODEL（可选，默认 claude-sonnet-4-6）
 */
export function createDefaultLlmClient(): LlmClient | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  const baseUrl = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  return new AnthropicLlmClient(apiKey, baseUrl, model);
}

/**
 * 工厂函数：按名称创建客户端，便于测试注入。
 */
export function createLlmClient(name: 'anthropic', config: { apiKey: string; baseUrl?: string; model?: string }): LlmClient {
  if (name === 'anthropic') {
    return new AnthropicLlmClient(
      config.apiKey,
      (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, ''),
      config.model ?? 'claude-sonnet-4-6',
    );
  }
  throw new Error(`不支持的 LLM 客户端类型: ${name}`);
}
