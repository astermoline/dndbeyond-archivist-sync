import { type CharacterData, type MonsterData, type ItemData, characterToMarkdown } from '@astermoe/dndbeyond-parser';

export const ELIGIBLE_MAGIC_ITEM_RARITIES = [
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact',
];

export function isEligibleMagicItem(rarity?: string | null): boolean {
  if (!rarity) return false;
  const r = rarity.toLowerCase().trim();
  return ELIGIBLE_MAGIC_ITEM_RARITIES.includes(r);
}

/**
 * Detects whether an image URL is a low-resolution cropped/thumbnail version from D&D Beyond.
 * For example: /thumbnails/.../35/35/... or /thumbnails/.../100/100/... or ?width=150
 */
export function isLowResThumbnail(url?: string | null): boolean {
  if (!url) return false;
  return (
    //thumbnails/d+/d+/(?:[1-9]d?|1[0-5]d)/(?:[1-9]d?|1[0-5]d)//.test(url) ||
    /[?&](?:width|height)=(?:[1-9]d?|1[0-5]d)(?:&|$)/i.test(url)
  );
}

/**
 * Formats tabular data into Archivist's native [TABLE] markup syntax.
 * Example output:
 * [TABLE]
 * Columns: STR | DEX | CON | INT | WIS | CHA
 * Row 1: 8 | 15 | 14 | 10 | 12 | 19
 * [/TABLE]
 */
export function formatArchivistTable(columns: string[], rows: (string | number)[][]): string {
  const colLine = `Columns: ${columns.join(' | ')}`;
  const rowLines = rows.map((row, idx) => `Row ${idx + 1}: ${row.join(' | ')}`);
  return `[TABLE]\n${colLine}\n${rowLines.join('\n')}\n[/TABLE]`;
}

/**
 * Formats character or monster ability scores into a single-line string.
 * Example: STR: 8 (-1) | DEX: 13 (+1) | CON: 15 (+2) | INT: 20 (+5) | WIS: 15 (+2) | CHR: 20 (+5)
 */
export function formatAbilityScoresLine(abilities: {
  strength: { score: number; modifier: string };
  dexterity: { score: number; modifier: string };
  constitution: { score: number; modifier: string };
  intelligence: { score: number; modifier: string };
  wisdom: { score: number; modifier: string };
  charisma: { score: number; modifier: string };
}): string {
  return [
    `STR: ${abilities.strength.score} (${abilities.strength.modifier})`,
    `DEX: ${abilities.dexterity.score} (${abilities.dexterity.modifier})`,
    `CON: ${abilities.constitution.score} (${abilities.constitution.modifier})`,
    `INT: ${abilities.intelligence.score} (${abilities.intelligence.modifier})`,
    `WIS: ${abilities.wisdom.score} (${abilities.wisdom.modifier})`,
    `CHR: ${abilities.charisma.score} (${abilities.charisma.modifier})`,
  ].join(' | ');
}

export function formatCharacterStatBlock(char: CharacterData, ddbUrl: string): string {
  const abilitySummary = formatAbilityScoresLine(char.abilities);

  return `### Stat Block

**Level ${char.totalLevel} ${char.species} ${char.classLine}**

- **AC:** ${char.ac.value} | **HP:** ${char.hp.value}/${char.hp.max} | **Speed:** ${char.speed}
- **Ability Scores:** ${abilitySummary}
- **Senses:** ${char.senses.join(', ')}
- **Languages:** ${char.languages.join(', ')}

---
[View on D&D Beyond](${ddbUrl})`;
}

export function formatMonsterStatBlock(monster: MonsterData, ddbUrl: string): string {
  const abilitySummary = formatAbilityScoresLine(monster.abilities);

  const sections: string[] = [];

  if (monster.traits?.length) {
    sections.push(`#### Traits\n` + monster.traits.map((t) => `**${t.name}.** ${t.description}`).join('\n\n'));
  }
  if (monster.actions?.length) {
    sections.push(`#### Actions\n` + monster.actions.map((a) => `**${a.name}.** ${a.description}`).join('\n\n'));
  }
  if (monster.bonusActions?.length) {
    sections.push(`#### Bonus Actions\n` + monster.bonusActions.map((b) => `**${b.name}.** ${b.description}`).join('\n\n'));
  }
  if (monster.reactions?.length) {
    sections.push(`#### Reactions\n` + monster.reactions.map((r) => `**${r.name}.** ${r.description}`).join('\n\n'));
  }
  if (monster.legendaryActions?.length) {
    sections.push(`#### Legendary Actions\n` + monster.legendaryActions.map((l) => `**${l.name}.** ${l.description}`).join('\n\n'));
  }

  const extraSections = sections.length ? '\n\n' + sections.join('\n\n') : '';

  return `### Stat Block

**${monster.size} ${monster.type}, ${monster.alignment}**

- **CR:** ${monster.cr} (${monster.xp} XP)
- **AC:** ${monster.ac.value}${monster.ac.formula ? ` (${monster.ac.formula})` : ''} | **HP:** ${monster.hp.value}${monster.hp.formula ? ` (${monster.hp.formula})` : ''} | **Speed:** ${monster.speed}
- **Ability Scores:** ${abilitySummary}
- **Senses:** ${monster.senses.join(', ')}
- **Languages:** ${monster.languages.join(', ')}${extraSections}

---
[View on D&D Beyond](${ddbUrl})`;
}

export function formatItemDetails(item: ItemData, ddbUrl: string): string {
  const attunement = item.requiresAttunement
    ? `\n*Requires Attunement${item.attunementDescription ? ` (${item.attunementDescription})` : ''}*`
    : '';

  return `### Item Details

**${item.rarity ? `${item.rarity} ` : ''}${item.type}**${attunement}

${item.description}

---
[View on D&D Beyond](${ddbUrl})`;
}

export type StatBlockHeader =
  | '### Stat Block'
  | '### Item Details'
  | '# Stat Block'
  | '# Item Details';

const DNDBEYOND_DIVIDER_REGEX = /(?:(?:\r?\n)?[ \t]*---+[ \t]*)?(?:\[(?:View on )?D&D Beyond[^\]]*\]\([^\s)]+\)|\[[^\]]*\]\(https?:\/\/(?:www\.)?dndbeyond\.com\/[^\s)]+\)|https?:\/\/(?:www\.)?dndbeyond\.com\/[^\s)]+)(?:[ \t]*\r?\n[ \t]*---+)?/i;

/**
 * Merges a newly formatted stat block section into an existing description.
 * Looks for ### Stat Block (or # Stat Block / Item Details) and the D&D Beyond link anywhere in the description.
 * If found, replaces that section in-place, preserving surrounding descriptive text.
 * If not found, adds it to the end of the description.
 */
export function mergeStatBlockIntoDescription(
  existingDescription: string,
  newStatBlockSection: string,
  sectionHeader: StatBlockHeader = '### Stat Block'
): string {
  if (!existingDescription || !existingDescription.trim()) {
    return newStatBlockSection;
  }

  const normalized = existingDescription.replace(/\r\n/g, '\n');
  const label = sectionHeader.replace(/^#+\s*/, '').trim();
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headerRegex = new RegExp(`(?:^|\\n)[ \\t]*(#{1,6}[ \\t]*${escapedLabel}\\b)`, 'i');
  const headerMatch = headerRegex.exec(normalized);

  if (!headerMatch) {
    // No existing stat block: add to the end of existing description
    return `${normalized.trim()}\n\n${newStatBlockSection}`;
  }

  const leadingNewline = headerMatch[0].startsWith('\n') ? 1 : 0;
  const headerStart = headerMatch.index + leadingNewline;

  const afterHeader = normalized.slice(headerStart);
  const dividerMatch = DNDBEYOND_DIVIDER_REGEX.exec(afterHeader);

  if (dividerMatch) {
    // Found both header and divider link! Replace the stat block span in-place
    const beforeBlock = normalized.slice(0, headerStart).trim();
    const afterDivider = afterHeader.slice(dividerMatch.index + dividerMatch[0].length).trim();

    const parts = [
      beforeBlock,
      newStatBlockSection,
      afterDivider,
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  // Header found without divider link: replace from header to end
  const beforeBlock = normalized.slice(0, headerStart).trim();
  const parts = [beforeBlock, newStatBlockSection].filter(Boolean);
  return parts.join('\n\n');
}

/**
 * Extracts only user notes/lore from an Archivist description, stripping out the D&D Beyond stat block section.
 * Returns any text before and/or after the stat block and divider link.
 * Used when syncing back to D&D Beyond Notes -> Backstory.
 */
export function extractUserNotesFromDescription(
  description: string,
  sectionHeader: StatBlockHeader = '### Stat Block'
): string {
  if (!description || !description.trim()) return '';
  const normalized = description.replace(/\r\n/g, '\n');

  const label = sectionHeader.replace(/^#+\s*/, '').trim();
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headerRegex = new RegExp(`(?:^|\\n)[ \\t]*(#{1,6}[ \\t]*${escapedLabel}\\b)`, 'i');
  const headerMatch = headerRegex.exec(normalized);

  if (!headerMatch) {
    return normalized.trim();
  }

  const leadingNewline = headerMatch[0].startsWith('\n') ? 1 : 0;
  const headerStart = headerMatch.index + leadingNewline;
  const beforeBlock = normalized.slice(0, headerStart).trim();

  const afterHeader = normalized.slice(headerStart);
  const dividerMatch = DNDBEYOND_DIVIDER_REGEX.exec(afterHeader);

  if (dividerMatch) {
    const afterDivider = afterHeader.slice(dividerMatch.index + dividerMatch[0].length).trim();
    const parts = [beforeBlock, afterDivider].filter(Boolean);
    return parts.join('\n\n').trim();
  }

  return beforeBlock;
}

/**
 * Converts standard Markdown pipe tables into Archivist's [TABLE]...[/TABLE] syntax.
 */
export function convertMarkdownTablesToArchivist(text: string): string {
  const tableRegex = /((?:^[ 	]*\|?[^\n|]+\|[^\n]+\|?[ 	]*\r?\n)(?:^[ 	]*\|?[ 	]*:?-+:?[ 	]*(?:\|[ 	]*:?-+:?[ 	]*)+\|?[ 	]*\r?\n)(?:^[ 	]*\|?[^\n|]+\|[^\n]+\|?[ 	]*(?:\r?\n|$))+)/gm;

  return text.replace(tableRegex, (match) => {
    const lines = match.trim().split(/\r?\n/);
    if (lines.length < 3) return match;

    const parseCells = (line: string) => {
      const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
      return trimmed.split('|').map((c) => c.trim());
    };

    const header = parseCells(lines[0]);
    const dataRows = lines.slice(2).map(parseCells);

    const colLine = `Columns: ${header.join(' | ')}`;
    const rowLines = dataRows.map((row, idx) => `Row ${idx + 1}: ${row.join(' | ')}`);

    return `[TABLE]\n${colLine}\n${rowLines.join('\n')}\n[/TABLE]\n`;
  });
}

/**
 * Formats a full character sheet for an Archivist journal entry.
 * Strips Obsidian-specific YAML frontmatter, prefixes with a [[Character Name]] wikilink,
 * and converts pipe tables into Archivist's [TABLE] syntax.
 */
export function formatCharacterJournalMarkdown(char: CharacterData): string {
  const rawMd = characterToMarkdown(char);
  const bodyMd = rawMd.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '').trim();
  const archivistMd = convertMarkdownTablesToArchivist(bodyMd);
  return `[\[${char.name}\]\]\n\n${archivistMd}`.trim() + '\n';
}

/**
 * Finds or creates a Journal Folder in Archivist by name.
 */
export async function findOrCreateJournalFolder(
  apiKey: string,
  campaignId: string,
  folderName: string,
  baseUrl = 'https://api.myarchivist.ai'
): Promise<string | null> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const headers = {
    'x-api-key': apiKey,
    Accept: 'application/json',
  };

  // 1. Check existing folders
  try {
    const listRes = await fetch(`${cleanBase}/v1/journal-folders?campaign_id=${encodeURIComponent(campaignId)}`, {
      method: 'GET',
      headers,
    });

    if (listRes.ok) {
      const data = await listRes.json();
      const folders: any[] = Array.isArray(data) ? data : data?.data || data?.folders || [];
      const match = folders.find(
        (f) =>
          f.name?.trim().toLowerCase() === folderName.trim().toLowerCase() ||
          f.path?.trim().toLowerCase() === `/${folderName}`.trim().toLowerCase() ||
          f.path?.trim().toLowerCase() === folderName.trim().toLowerCase()
      );
      if (match?.id) {
        return match.id;
      }
    } else {
      console.warn('[Archives Beyond] Could not list journal folders, status:', listRes.status);
    }
  } catch (err) {
    console.warn('[Archives Beyond] Error listing journal folders:', err);
  }

  // 2. Not found: create the folder
  try {
    const createRes = await fetch(`${cleanBase}/v1/journal-folders`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        worldId: campaignId,
        campaign_id: campaignId,
        name: folderName,
        path: `/${folderName}`,
        parentId: null,
      }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      const folderId =
        created?.id ||
        created?.data?.id ||
        created?.folder?.id ||
        created?.entry?.id ||
        null;
      if (folderId) {
        return folderId;
      }
    } else {
      const errText = await createRes.text().catch(() => '');
      console.warn(`[Archives Beyond] Failed to create journal folder (${createRes.status}):`, errText);
    }
  } catch (err) {
    console.warn('[Archives Beyond] Error creating journal folder:', err);
  }

  // 3. Fallback: re-fetch folders in case creation succeeded or folder existed with alternate path
  try {
    const listRes2 = await fetch(`${cleanBase}/v1/journal-folders?campaign_id=${encodeURIComponent(campaignId)}`, {
      method: 'GET',
      headers,
    });
    if (listRes2.ok) {
      const data2 = await listRes2.json();
      const folders2: any[] = Array.isArray(data2) ? data2 : data2?.data || data2?.folders || [];
      const match2 = folders2.find(
        (f) =>
          f.name?.trim().toLowerCase() === folderName.trim().toLowerCase() ||
          f.path?.trim().toLowerCase() === `/${folderName}`.trim().toLowerCase() ||
          f.path?.trim().toLowerCase() === folderName.trim().toLowerCase()
      );
      if (match2?.id) {
        return match2.id;
      }
    }
  } catch (err) {
    console.warn('[Archives Beyond] Fallback folder listing failed:', err);
  }

  return null;
}

/**
 * Creates or updates a journal entry in Archivist with the given character's full markdown sheet.
 */
export interface LexicalInlineNode {
  [key: string]: any;
}

export function parseInlineMarkdown(
  text: string,
  options: { characterId?: string; characterName?: string } = {}
): LexicalInlineNode[] {
  const nodes: LexicalInlineNode[] = [];
  let remaining = text;

  const inlineRegex =
    /(\[\[([^\]|]+)(?:\|([^\]]+))?\]\])|(\[([^\]]+)\]\(([^)]+)\))|(\*\*\*([^*]+)\*\*\*)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(~~([^~]+)~~)/;

  while (remaining.length > 0) {
    const match = remaining.match(inlineRegex);
    if (!match) {
      nodes.push({
        mode: 'normal',
        text: remaining,
        type: 'text',
        style: '',
        detail: 0,
        format: 0,
        version: 1,
      });
      break;
    }

    const matchIndex = match.index!;
    if (matchIndex > 0) {
      nodes.push({
        mode: 'normal',
        text: remaining.slice(0, matchIndex),
        type: 'text',
        style: '',
        detail: 0,
        format: 0,
        version: 1,
      });
    }

    if (match[1]) {
      // Wikilink: [[Target]] or [[Target|Alias]]
      const target = match[2].trim();
      const alias = (match[3] || target).trim();
      if (
        options.characterId &&
        (target.toLowerCase() === options.characterName?.toLowerCase() ||
          alias.toLowerCase() === options.characterName?.toLowerCase())
      ) {
        nodes.push({
          toId: options.characterId,
          type: 'wikilink',
          alias: alias,
          toType: 'Character',
          version: 1,
          characterKind: 'PC',
        });
      } else {
        nodes.push({
          mode: 'normal',
          text: match[0],
          type: 'text',
          style: '',
          detail: 0,
          format: 0,
          version: 1,
        });
      }
    } else if (match[4]) {
      // Link: [text](url)
      nodes.push({
        type: 'link',
        url: match[6],
        rel: 'noopener noreferrer',
        title: null,
        format: '',
        indent: 0,
        target: '_blank',
        version: 1,
        children: [
          {
            mode: 'normal',
            text: match[5],
            type: 'text',
            style: '',
            detail: 0,
            format: 0,
            version: 1,
          },
        ],
        direction: null,
      });
    } else if (match[7]) {
      // Bold + Italic: format: 3 (1 | 2)
      nodes.push({
        mode: 'normal',
        text: match[8],
        type: 'text',
        style: '',
        detail: 0,
        format: 3,
        version: 1,
      });
    } else if (match[9]) {
      // Bold: format: 1
      nodes.push({
        mode: 'normal',
        text: match[10],
        type: 'text',
        style: '',
        detail: 0,
        format: 1,
        version: 1,
      });
    } else if (match[11]) {
      // Italic: format: 2
      nodes.push({
        mode: 'normal',
        text: match[12],
        type: 'text',
        style: '',
        detail: 0,
        format: 2,
        version: 1,
      });
    } else if (match[13]) {
      // Code: format: 16
      nodes.push({
        mode: 'normal',
        text: match[14],
        type: 'text',
        style: '',
        detail: 0,
        format: 16,
        version: 1,
      });
    } else if (match[15]) {
      // Strikethrough: format: 4
      nodes.push({
        mode: 'normal',
        text: match[16],
        type: 'text',
        style: '',
        detail: 0,
        format: 4,
        version: 1,
      });
    }

    remaining = remaining.slice(matchIndex + match[0].length);
  }

  return nodes.length > 0
    ? nodes
    : [
        {
          mode: 'normal',
          text: '',
          type: 'text',
          style: '',
          detail: 0,
          format: 0,
          version: 1,
        },
      ];
}

export function createLexicalParagraph(children: LexicalInlineNode[]) {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    children,
    direction: null,
    textStyle: '',
    textFormat: 0,
  };
}

export function createLexicalTableCell(children: LexicalInlineNode[], isHeader = false) {
  return {
    type: 'tablecell',
    format: '',
    indent: 0,
    colSpan: 1,
    rowSpan: 1,
    version: 1,
    headerState: isHeader ? 1 : 0,
    backgroundColor: null,
    children: [createLexicalParagraph(children)],
    direction: null,
  };
}

export function createLexicalTable(
  columns: string[],
  rows: string[][],
  options: { characterId?: string; characterName?: string } = {}
) {
  const tableRows: any[] = [];

  if (columns && columns.length > 0) {
    const headerCells = columns.map((col) =>
      createLexicalTableCell(parseInlineMarkdown(col.trim(), options), true)
    );
    tableRows.push({
      type: 'tablerow',
      format: '',
      indent: 0,
      version: 1,
      children: headerCells,
      direction: null,
    });
  }

  for (const row of rows) {
    const cells = row.map((cell) =>
      createLexicalTableCell(parseInlineMarkdown(cell.trim(), options), false)
    );
    tableRows.push({
      type: 'tablerow',
      format: '',
      indent: 0,
      version: 1,
      children: cells,
      direction: null,
    });
  }

  return {
    type: 'table',
    format: '',
    indent: 0,
    version: 1,
    children: tableRows,
    direction: null,
  };
}

/**
 * Converts Markdown (with headings, lists, bold/italic, tables, links, wikilinks)
 * into a Lexical document AST for Archivist rich-text editing.
 */
export function markdownToLexical(
  markdownText: string,
  options: { characterId?: string; characterName?: string } = {}
): { root: any } {
  const lines = markdownText.split(/\r?\n/);
  const children: any[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Skip standalone image tags (e.g. ![Name](url))
    if (/^!\[.*?\]\(.*?\)$/.test(trimmed)) {
      i++;
      continue;
    }

    // Skip horizontal rules
    if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
      i++;
      continue;
    }

    // 1. Archivist [TABLE] ... [/TABLE]
    if (trimmed.startsWith('[TABLE]')) {
      i++;
      let columns: string[] = [];
      const rows: string[][] = [];
      while (i < lines.length && !lines[i].trim().startsWith('[/TABLE]')) {
        const tLine = lines[i].trim();
        if (tLine.toLowerCase().startsWith('columns:')) {
          columns = tLine.slice(8).split('|').map((c) => c.trim());
        } else if (/^row\s+\d+:/i.test(tLine)) {
          const colonIdx = tLine.indexOf(':');
          const rowData = tLine.slice(colonIdx + 1).split('|').map((c) => c.trim());
          rows.push(rowData);
        }
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('[/TABLE]')) {
        i++;
      }
      children.push(createLexicalTable(columns, rows, options));
      continue;
    }

    // 2. Markdown Pipe Tables (| col | col |)
    if (
      /^[ \t]*\|?[^\n|]+\|[^\n]+\|?[ \t]*$/.test(line) &&
      i + 1 < lines.length &&
      /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/.test(lines[i + 1])
    ) {
      const parseCells = (l: string) =>
        l
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const header = parseCells(lines[i]);
      i += 2;
      const dataRows: string[][] = [];
      while (i < lines.length && /^[ \t]*\|?[^\n|]+\|[^\n]+\|?[ \t]*$/.test(lines[i])) {
        dataRows.push(parseCells(lines[i]));
        i++;
      }
      children.push(createLexicalTable(header, dataRows, options));
      continue;
    }

    // 3. Headings (# Heading)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      children.push({
        type: 'heading',
        tag: `h${level}`,
        format: '',
        indent: 0,
        version: 1,
        children: parseInlineMarkdown(headingText, options),
        direction: null,
      });
      i++;
      continue;
    }

    // 4. Bullet lists (- item or * item)
    if (/^[-*]\s+(.+)$/.test(line)) {
      const listItems: any[] = [];
      while (i < lines.length && /^[-*]\s+(.+)$/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*]\s+/, '').trim();
        listItems.push({
          type: 'listitem',
          value: listItems.length + 1,
          format: '',
          indent: 0,
          version: 1,
          children: parseInlineMarkdown(itemText, options),
          direction: null,
        });
        i++;
      }
      children.push({
        type: 'list',
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        format: '',
        indent: 0,
        version: 1,
        children: listItems,
        direction: null,
      });
      continue;
    }

    // 5. Numbered lists (1. item)
    if (/^\d+\.\s+(.+)$/.test(line)) {
      const listItems: any[] = [];
      while (i < lines.length && /^\d+\.\s+(.+)$/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s+/, '').trim();
        listItems.push({
          type: 'listitem',
          value: listItems.length + 1,
          format: '',
          indent: 0,
          version: 1,
          children: parseInlineMarkdown(itemText, options),
          direction: null,
        });
        i++;
      }
      children.push({
        type: 'list',
        listType: 'number',
        start: 1,
        tag: 'ol',
        format: '',
        indent: 0,
        version: 1,
        children: listItems,
        direction: null,
      });
      continue;
    }

    // 6. Blockquote (> quote)
    if (/^>\s*(.*)$/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s*(.*)$/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s*/, '').trim());
        i++;
      }
      children.push({
        type: 'quote',
        format: '',
        indent: 0,
        version: 1,
        children: parseInlineMarkdown(quoteLines.join(' '), options),
        direction: null,
      });
      continue;
    }

    // 7. Regular paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const pLine = lines[i];
      const pTrimmed = pLine.trim();
      if (!pTrimmed) break;
      if (
        pTrimmed.startsWith('#') ||
        pTrimmed.startsWith('[TABLE]') ||
        pTrimmed.startsWith('>') ||
        /^[-*]\s+/.test(pTrimmed) ||
        /^\d+\.\s+/.test(pTrimmed) ||
        /^(?:---|\*\*\*|___)$/.test(pTrimmed) ||
        (/^[ \t]*\|?[^\n|]+\|[^\n]+\|?[ \t]*$/.test(pLine) &&
          i + 1 < lines.length &&
          /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/.test(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(pTrimmed);
      i++;
    }

    if (paraLines.length > 0) {
      children.push(createLexicalParagraph(parseInlineMarkdown(paraLines.join(' '), options)));
    } else {
      i++;
    }
  }

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      children,
      direction: null,
    },
  };
}

/**
 * Creates or updates a journal entry in Archivist with the given character's full markdown sheet.
 * Passes both plain-text/markdown content AND contentRich (Lexical document AST)
 * so the web app's Lexical editor renders rich text while markdown export remains supported.
 */
export async function syncCharacterJournalEntry(
  apiKey: string,
  campaignId: string,
  folderId: string | null,
  characterName: string,
  content: string,
  contentRich?: any,
  baseUrl = 'https://api.myarchivist.ai'
): Promise<{ id: string; action: 'created' | 'updated' }> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const headers = {
    'x-api-key': apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  let existingId: string | null = null;
  try {
    const listRes = await fetch(
      `${cleanBase}/v1/journals?campaign_id=${encodeURIComponent(campaignId)}&size=100&with_links=true&format=markdown`,
      {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          Accept: 'application/json',
        },
      }
    );

    if (listRes.ok) {
      const listData = await listRes.json();
      const entries: any[] = Array.isArray(listData) ? listData : listData?.data || [];
      const match = entries.find(
        (e) => e.title?.trim().toLowerCase() === characterName.trim().toLowerCase()
      );
      if (match?.id) {
        existingId = match.id;
      }
    }
  } catch (err) {
    console.warn('[Archives Beyond] Error searching journals:', err);
  }

  if (existingId) {
    const putPayload: any = {
      id: existingId,
      title: characterName,
      content,
      status: 'published',
    };
    if (folderId) {
      putPayload.folderId = folderId;
    }
    if (contentRich) {
      putPayload.contentRich = contentRich;
    }

    const updateRes = await fetch(`${cleanBase}/v1/journals`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(putPayload),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '');
      throw new Error(`Failed to update journal entry (${updateRes.status}): ${errText}`);
    }

    return { id: existingId, action: 'updated' };
  } else {
    const postPayload: any = {
      worldId: campaignId,
      title: characterName,
      content,
      status: 'published',
    };
    if (folderId) {
      postPayload.folderId = folderId;
    }
    if (contentRich) {
      postPayload.contentRich = contentRich;
    }

    const createRes = await fetch(`${cleanBase}/v1/journals`, {
      method: 'POST',
      headers,
      body: JSON.stringify(postPayload),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      throw new Error(`Failed to create journal entry (${createRes.status}): ${errText}`);
    }

    const created = await createRes.json();
    const newId = created.id || created.data?.id || '';
    return { id: newId, action: 'created' };
  }
}
