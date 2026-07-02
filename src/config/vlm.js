export const DEFAULT_VLM_BASE_URL = "https://api.siliconflow.cn/v1";
export const DEFAULT_VLM_MODEL_NAME = "Qwen/Qwen3-VL-8B-Instruct";

export const normalizeVlmBaseUrl = url => {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "");
};

export const getVlmChatCompletionsUrl = baseUrl => {
  const normalized = normalizeVlmBaseUrl(baseUrl);
  if (!normalized) return "";
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
};
