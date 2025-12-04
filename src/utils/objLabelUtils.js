const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const collapseWhitespace = text => text.replace(/\s+/g, " ").trim();

/**
 * 提取 OBJ 文件中所有 usemtl 行里声明的标签。
 * @param {string} content OBJ 文件内容
 * @returns {Record<string, string>} 基于材质名称的标签映射
 */
export const parseObjLabels = content => {
  if (!content) return {};
  const labels = {};
  const regex = /^\s*usemtl\s+([^\s#]+)(?:[^#]*#\s*label:\s*(.+))?/gim;
  let match;
  while ((match = regex.exec(content))) {
    const materialName = match[1]?.trim();
    const label = match[2]?.trim();
    if (materialName && label) {
      labels[materialName] = collapseWhitespace(label);
    }
  }
  return labels;
};

/**
 * 在 OBJ 内容里更新指定材质的 usemtl 行，使其携带 label 注释。
 * 会处理重复出现的 usemtl 项。
 * @param {string} content OBJ 文件内容
 * @param {string} materialName 材质名称
 * @param {string} labelLabel 要写入的标签
 */
export const ensureObjLabelForMaterial = (content, materialName, labelLabel) => {
  if (!content || !materialName || !labelLabel) {
    return { content, replaced: false };
  }
  const normalizedLabel = collapseWhitespace(labelLabel);
  if (!normalizedLabel) {
    return { content, replaced: false };
  }

  const pattern = `^(\\s*usemtl\\s+)${escapeRegExp(materialName)}(.*)$`;
  const regex = new RegExp(pattern, "gim");
  let replaced = false;
  const updatedContent = content.replace(regex, (match, prefix) => {
    replaced = true;
    return `${prefix}${materialName} # label: ${normalizedLabel}`;
  });
  return { content: replaced ? updatedContent : content, replaced };
};

