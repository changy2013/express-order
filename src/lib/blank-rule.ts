import type { ParseRule } from '@/types';
import type { EditorRule } from '@/app/_components/RuleEditorModal';

/** 空白规则模板（手动新建规则用）—— 导入向导与规则管理页共用 */
export function blankRule(fileType: ParseRule['fileType']): EditorRule {
  const base = { name: '', description: '', fileType, staticValues: {}, defaultValues: {} };
  if (fileType === 'excel') return { ...base, excelConfig: { sheets: 'all', sheetMode: 'merge', specialMode: 'normal', headerRow: 0, dataStartRow: 1, fieldMappings: [] } };
  if (fileType === 'pdf') return { ...base, pdfConfig: { mode: 'table', fieldMappings: [] } };
  return { ...base, wordConfig: { mode: 'table', tableConfig: { headerRow: 0, dataStartRow: 1, fieldMappings: [] } } };
}
