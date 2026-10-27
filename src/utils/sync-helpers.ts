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

  try {
    const listRes = await fetch(`${cleanBase}/v1/journal-folders?campaign_id=${encodeURIComponent(campaignId)}`, {
      method: 'GET',
      headers,
    });

    if (listRes.ok) {
      const data = await listRes.json();
      const folders: any[] = Array.isArray(data) ? data : data?.data || [];
      const match = folders.find(
        (f) =>
          f.name?.trim().toLowerCase() === folderName.trim().toLowerCase() ||
          f.path?.trim().toLowerCase() === `/${folderName}`.trim().toLowerCase()
      );
      if (match?.id) {
        return match.id;
      }
    }
  } catch (err) {
    console.warn('[Archives Beyond] Could not list journal folders:', err);
  }

  // Not found: create the folder
  try {
    const createRes = await fetch(`${cleanBase}/v1/journal-folders`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        worldId: campaignId,
        name: folderName,
        path: `/${folderName}`,
      }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      return created.id || created.data?.id || null;
    }
  } catch (err) {
    console.warn('[Archives Beyond] Failed to create journal folder:', err);
  }

  return null;
}

/**
 * Creates or updates a journal entry in Archivist with the given character's full markdown sheet.
 */
export async function syncCharacterJournalEntry(
  apiKey: string,
  campaignId: string,
  folderId: string | null,
  characterName: string,
  content: string,
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
