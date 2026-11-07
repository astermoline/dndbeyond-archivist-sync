import { ArchivistClient, type Item } from "@astermoe/archivist-sdk";
import {
  type CharacterData,
  type MonsterData,
  type ItemData,
  type InventoryItemData,
  type FetchCharacterOptions,
  characterToMarkdown,
  fetchCharacterById,
  htmlToMarkdown,
} from '@astermoe/dndbeyond-parser';

export const ELIGIBLE_MAGIC_ITEM_RARITIES = [
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact',
];

export function isEligibleMagicItem(
  rarityOrItem?: string | { rarity?: string | null } | null
): boolean {
  if (!rarityOrItem) return false;
  const rarity = typeof rarityOrItem === 'string' ? rarityOrItem : rarityOrItem.rarity;
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

/**
 * Formats tabular data into standard Markdown pipe table syntax.
 */
export function formatMarkdownTable(columns: string[], rows: (string | number)[][]): string {
  const colLine = `| ${columns.join(' | ')} |`;
  const alignLine = `| ${columns.map(() => ':---:').join(' | ')} |`;
  const rowLines = rows.map((row) => `| ${row.join(' | ')} |`);
  return `${colLine}\n${alignLine}\n${rowLines.join('\n')}`;
}

/**
 * Formats character or monster ability scores into a Markdown table.
 */
export function formatAbilityScoresTable(abilities: {
  strength: { score: number; modifier: string };
  dexterity: { score: number; modifier: string };
  constitution: { score: number; modifier: string };
  intelligence: { score: number; modifier: string };
  wisdom: { score: number; modifier: string };
  charisma: { score: number; modifier: string };
}): string {
  const columns = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const row = [
    `${abilities.strength.score} (${abilities.strength.modifier})`,
    `${abilities.dexterity.score} (${abilities.dexterity.modifier})`,
    `${abilities.constitution.score} (${abilities.constitution.modifier})`,
    `${abilities.intelligence.score} (${abilities.intelligence.modifier})`,
    `${abilities.wisdom.score} (${abilities.wisdom.modifier})`,
    `${abilities.charisma.score} (${abilities.charisma.modifier})`,
  ];
  return formatMarkdownTable(columns, [row]);
}

export function formatCharacterStatBlock(char: CharacterData, ddbUrl: string): string {
  const abilityTable = formatAbilityScoresTable(char.abilities);

  return `### Stat Block

**Level ${char.totalLevel} ${char.species} ${char.classLine}**

- **AC:** ${char.ac.value} | **HP:** ${char.hp.value}/${char.hp.max} | **Speed:** ${char.speed}
- **Senses:** ${char.senses.join(', ')}
- **Languages:** ${char.languages.join(', ')}

#### Ability Scores
${abilityTable}

---
[View on D&D Beyond](${ddbUrl})`;
}

export function formatMonsterStatBlock(monster: MonsterData, ddbUrl: string): string {
  const abilityTable = formatAbilityScoresTable(monster.abilities);

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
- **Senses:** ${monster.senses.join(', ')}
- **Languages:** ${monster.languages.join(', ')}

#### Ability Scores
${abilityTable}${extraSections}

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

function getRawCharacterCustomValue(
  characterValues: any[] | undefined,
  entityId: string | number | undefined | null,
  entityTypeId: string | number | undefined | null,
  typeId: number
): any {
  if (!Array.isArray(characterValues) || entityId === undefined || entityId === null) {
    return undefined;
  }
  const idStr = String(entityId);
  const typeIdStr = entityTypeId !== undefined && entityTypeId !== null ? String(entityTypeId) : null;

  for (let i = characterValues.length - 1; i >= 0; i--) {
    const cv = characterValues[i];
    if (!cv || cv.typeId !== typeId || String(cv.valueId) !== idStr) continue;
    if (typeIdStr !== null && cv.valueTypeId !== undefined && cv.valueTypeId !== null) {
      if (String(cv.valueTypeId) !== typeIdStr) continue;
    }
    if (cv.value !== undefined && cv.value !== null) {
      return cv.value;
    }
  }

  return undefined;
}

/**
 * Applies D&D Beyond `characterValues` overrides (custom names, notes, weight/cost overrides,
 * silvered/adamantine properties, weapon bonuses, spell customizations) and `customItems`
 * idempotently onto a parsed `CharacterData` object.
 */
export function applyCharacterCustomizations(
  char: CharacterData,
  rawCharacterData: any
): CharacterData {
  const d = rawCharacterData?.data || rawCharacterData;
  if (!d || typeof d !== 'object') {
    return char;
  }

  const characterValues: any[] = Array.isArray(d.characterValues) ? d.characterValues : [];
  const rawInventory: any[] = Array.isArray(d.inventory) ? d.inventory : [];
  const rawInventoryById = new Map<string, any>();
  for (const rawItem of rawInventory) {
    const itemId = rawItem?.id ?? rawItem?.definition?.id;
    if (itemId !== undefined && itemId !== null) {
      rawInventoryById.set(String(itemId), rawItem);
    }
  }

  const updatedInventory: InventoryItemData[] = (char.inventory || []).map((invItem) => {
    const rawItem =
      invItem.id !== undefined && invItem.id !== null
        ? rawInventoryById.get(String(invItem.id))
        : undefined;
    if (!rawItem) {
      return invItem;
    }

    const itemId = rawItem.id;
    const entityTypeId = rawItem.entityTypeId;

    const rawCustomName = getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 8);
    const customName =
      typeof rawCustomName === 'string' && rawCustomName.trim() ? rawCustomName.trim() : undefined;
    const name = customName || invItem.name;

    const rawCustomWeight = getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 22);
    const parsedCustomWeight =
      rawCustomWeight !== undefined && rawCustomWeight !== null && rawCustomWeight !== ''
        ? Number(rawCustomWeight)
        : NaN;
    const qty = invItem.quantity ?? 1;
    const weight = !Number.isNaN(parsedCustomWeight) ? parsedCustomWeight : invItem.weight;
    const totalWeight =
      !Number.isNaN(parsedCustomWeight)
        ? parseFloat((qty * parsedCustomWeight).toFixed(1))
        : invItem.totalWeight;

    const rawCustomCost = getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 19);
    const parsedCustomCost =
      rawCustomCost !== undefined && rawCustomCost !== null && rawCustomCost !== ''
        ? Number(rawCustomCost)
        : NaN;
    const cost = !Number.isNaN(parsedCustomCost) ? `${parsedCustomCost} gp` : invItem.cost;

    const notes = invItem.notes ? [...invItem.notes] : [];
    const isSilvered = Boolean(getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 20));
    const isAdamantine = Boolean(
      getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 21)
    );
    if (isSilvered || isAdamantine) {
      const propIdx = notes.findIndex((n) => n.startsWith('Properties: '));
      const existingProps =
        propIdx !== -1
          ? notes[propIdx]
              .slice('Properties: '.length)
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : [];
      if (isSilvered && !existingProps.includes('Silvered')) existingProps.push('Silvered');
      if (isAdamantine && !existingProps.includes('Adamantine')) existingProps.push('Adamantine');
      if (existingProps.length > 0) {
        const propLine = `Properties: ${existingProps.join(', ')}`;
        if (propIdx !== -1) {
          notes[propIdx] = propLine;
        } else {
          notes.unshift(propLine);
        }
      }
    }

    const rawToHitBonus = getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 12);
    if (rawToHitBonus !== undefined && rawToHitBonus !== null && rawToHitBonus !== '') {
      const num = Number(rawToHitBonus);
      if (!Number.isNaN(num) && num !== 0) {
        const entry = `To-Hit Bonus: ${num > 0 ? `+${num}` : num}`;
        if (!notes.includes(entry)) notes.push(entry);
      }
    }

    const rawDamageBonus = getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 10);
    if (rawDamageBonus !== undefined && rawDamageBonus !== null && rawDamageBonus !== '') {
      const num = Number(rawDamageBonus);
      let entry: string | undefined;
      if (!Number.isNaN(num) && num !== 0) {
        entry = `Damage Bonus: ${num > 0 ? `+${num}` : num}`;
      } else if (Number.isNaN(num) && String(rawDamageBonus).trim()) {
        entry = `Damage Bonus: ${String(rawDamageBonus).trim()}`;
      }
      if (entry && !notes.includes(entry)) notes.push(entry);
    }

    let description = invItem.description || '';
    const rawCustomNotes = getRawCharacterCustomValue(characterValues, itemId, entityTypeId, 9);
    if (typeof rawCustomNotes === 'string' && rawCustomNotes.trim()) {
      const cleanedNotes = rawCustomNotes.replace(/\r\n/g, '\n').trim();
      if (cleanedNotes.includes('\n')) {
        const prefix = `**Notes:** ${cleanedNotes}`;
        if (!description.startsWith(prefix)) {
          description = description ? `${prefix}\n\n${description}` : prefix;
        }
      } else {
        const noteEntry = `Notes: ${cleanedNotes}`;
        if (!notes.includes(noteEntry)) notes.push(noteEntry);
      }
    }

    return {
      ...invItem,
      name,
      weight,
      totalWeight,
      cost,
      description,
      notes: notes.length > 0 ? notes : undefined,
    };
  });

  if (Array.isArray(d.customItems)) {
    const existingIds = new Set(
      updatedInventory
        .filter((i) => i.id !== undefined && i.id !== null)
        .map((i) => String(i.id))
    );

    for (const ci of d.customItems) {
      if (!ci || !ci.name) continue;
      if (ci.id !== undefined && ci.id !== null && existingIds.has(String(ci.id))) {
        continue;
      }

      const qty = ci.quantity ?? 1;
      const parsedWt =
        ci.weight !== undefined && ci.weight !== null && ci.weight !== '' ? Number(ci.weight) : 0;
      const wt = !Number.isNaN(parsedWt) ? parsedWt : 0;
      const totalWeight = parseFloat((qty * wt).toFixed(1));

      let cost: string | undefined;
      if (ci.cost !== undefined && ci.cost !== null && ci.cost !== '') {
        const costStr = String(ci.cost).trim();
        if (costStr && Number(costStr) !== 0) {
          cost = /[a-z]/i.test(costStr) ? costStr : `${costStr} gp`;
        }
      }

      const notes: string[] = [];
      let description = htmlToMarkdown(ci.description || '');
      if (typeof ci.notes === 'string' && ci.notes.trim()) {
        const cleanedNotes = ci.notes.replace(/\r\n/g, '\n').trim();
        if (cleanedNotes.includes('\n')) {
          description = description ? `**Notes:** ${cleanedNotes}\n\n${description}` : `**Notes:** ${cleanedNotes}`;
        } else {
          notes.push(`Notes: ${cleanedNotes}`);
        }
      }

      if (ci.id !== undefined && ci.id !== null) {
        existingIds.add(String(ci.id));
      }

      updatedInventory.push({
        id: ci.id,
        name: String(ci.name).trim(),
        type: ci.type || 'Other Gear',
        requiresAttunement: false,
        weight: wt,
        cost,
        description,
        notes: notes.length > 0 ? notes : undefined,
        tags: [],
        quantity: qty,
        equipped: Boolean(ci.equipped),
        totalWeight,
        containerId: ci.containerEntityId || null,
      });
    }
  }

  let updatedSpellcasting = char.spellcasting;
  if (char.spellcasting && characterValues.length > 0) {
    const rawSpells: any[] = [];
    if (Array.isArray(d.classSpells)) {
      for (const cs of d.classSpells) {
        if (Array.isArray(cs?.spells)) rawSpells.push(...cs.spells);
      }
    }
    if (d.spells && typeof d.spells === 'object') {
      for (const key of ['class', 'feat', 'race', 'item', 'background']) {
        if (Array.isArray(d.spells[key])) rawSpells.push(...d.spells[key]);
      }
    }

    const spellOverrides: Array<{
      id: string;
      defName: string;
      customName?: string;
      customNotes?: string;
    }> = [];

    for (const rs of rawSpells) {
      const defName = rs?.definition?.name;
      if (!defName || rs?.id === undefined || rs?.id === null) continue;
      const rawCustomName = getRawCharacterCustomValue(
        characterValues,
        rs.id,
        rs.entityTypeId,
        8
      );
      const rawCustomNotes = getRawCharacterCustomValue(
        characterValues,
        rs.id,
        rs.entityTypeId,
        9
      );
      const customName =
        typeof rawCustomName === 'string' && rawCustomName.trim()
          ? rawCustomName.trim()
          : undefined;
      const customNotes =
        typeof rawCustomNotes === 'string' && rawCustomNotes.trim()
          ? rawCustomNotes.replace(/\r\n/g, '\n').trim()
          : undefined;
      if (customName || customNotes) {
        spellOverrides.push({
          id: String(rs.id),
          defName,
          customName,
          customNotes,
        });
      }
    }

    if (spellOverrides.length > 0) {
      const updatedGroups: Record<number, typeof char.spellcasting.groups[number]> = {};
      for (const [lvlKey, spells] of Object.entries(char.spellcasting.groups)) {
        let renamedInGroup = false;
        const nextSpells = spells.map((spell) => {
          const override = spellOverrides.find(
            (o) =>
              (spell.id !== undefined && String(spell.id) === o.id) ||
              spell.name === o.customName ||
              spell.name === o.defName
          );
          if (!override) return spell;

          const nextName = override.customName || spell.name;
          if (nextName !== spell.name) renamedInGroup = true;

          let nextDesc = spell.description || '';
          if (override.customNotes) {
            const prefix = `**Notes:** ${override.customNotes}`;
            if (!nextDesc.startsWith(prefix)) {
              nextDesc = nextDesc ? `${prefix}\n\n${nextDesc}` : prefix;
            }
          }

          return {
            ...spell,
            name: nextName,
            description: nextDesc,
          };
        });

        if (renamedInGroup) {
          nextSpells.sort((a, b) => a.name.localeCompare(b.name));
        }
        updatedGroups[Number(lvlKey)] = nextSpells;
      }

      updatedSpellcasting = {
        ...char.spellcasting,
        groups: updatedGroups,
      };
    }
  }

  let updatedFeatures = char.features;
  if (Array.isArray(char.features) && char.features.length > 0 && characterValues.length > 0) {
    const rawFeatureDefs: any[] = [];
    if (Array.isArray(d.race?.racialTraits)) {
      for (const t of d.race.racialTraits) {
        if (t?.definition) rawFeatureDefs.push(t.definition);
      }
    }
    if (Array.isArray(d.classes)) {
      for (const cls of d.classes) {
        if (Array.isArray(cls?.classFeatures)) {
          for (const f of cls.classFeatures) {
            if (f?.definition) rawFeatureDefs.push(f.definition);
          }
        }
      }
    }
    if (Array.isArray(d.feats)) {
      for (const f of d.feats) {
        if (f?.definition) rawFeatureDefs.push(f.definition);
      }
    }

    const featureOverrides: Array<{
      defName: string;
      customName?: string;
      customNotes?: string;
    }> = [];

    for (const def of rawFeatureDefs) {
      if (!def?.name || def.id === undefined || def.id === null) continue;
      const rawCustomName = getRawCharacterCustomValue(
        characterValues,
        def.id,
        def.entityTypeId,
        8
      );
      const rawCustomNotes = getRawCharacterCustomValue(
        characterValues,
        def.id,
        def.entityTypeId,
        9
      );
      const customName =
        typeof rawCustomName === 'string' && rawCustomName.trim()
          ? rawCustomName.trim()
          : undefined;
      const customNotes =
        typeof rawCustomNotes === 'string' && rawCustomNotes.trim()
          ? rawCustomNotes.replace(/\r\n/g, '\n').trim()
          : undefined;
      if (customName || customNotes) {
        featureOverrides.push({
          defName: def.name,
          customName,
          customNotes,
        });
      }
    }

    if (featureOverrides.length > 0) {
      updatedFeatures = char.features.map((feat) => {
        const override = featureOverrides.find(
          (o) => feat.name === o.customName || feat.name === o.defName
        );
        if (!override) return feat;
        let nextDesc = feat.description || '';
        if (override.customNotes) {
          const prefix = `**Notes:** ${override.customNotes}`;
          if (!nextDesc.startsWith(prefix)) {
            nextDesc = nextDesc ? `${prefix}\n\n${nextDesc}` : prefix;
          }
        }
        return {
          ...feat,
          name: override.customName || feat.name,
          description: nextDesc,
        };
      });
    }
  }

  return {
    ...char,
    features: updatedFeatures,
    inventory: updatedInventory,
    spellcasting: updatedSpellcasting,
  };
}

/**
 * Fetches a D&D Beyond character by ID or URL and applies sheet customizations
 * (`characterValues` and `customItems`).
 */
export async function fetchCharacterWithCustomizations(
  characterId: string | number,
  options: FetchCharacterOptions = {}
): Promise<CharacterData> {
  let capturedRawData: any = null;
  const baseFetch = options.fetchFn || globalThis.fetch.bind(globalThis);

  const interceptingFetch: typeof fetch = async (input, init) => {
    const res = await baseFetch(input, init);
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (res.ok && urlStr.includes('/character/v5/character/')) {
      try {
        if (typeof res.clone === 'function') {
          const json = await res.clone().json();
          if (json?.data) {
            capturedRawData = json.data;
          }
        } else {
          const json = await res.json();
          if (json?.data) {
            capturedRawData = json.data;
          }
          return {
            ...res,
            json: async () => json,
          } as Response;
        }
      } catch {
        // Ignore clone/json errors and let fetchCharacterById process the response normally
      }
    }

    return res;
  };

  const char = await fetchCharacterById(characterId, {
    ...options,
    fetchFn: interceptingFetch,
  });

  return capturedRawData ? applyCharacterCustomizations(char, capturedRawData) : char;
}

export interface CompendiumItemRef {
  id?: string;
  name: string;
  aliases?: string[];
}

export interface FormatCharacterJournalOptions {
  compendiumItems?: CompendiumItemRef[];
}

/**
 * Wraps an item or spell name in [[wikilink]] syntax if a matching Item record exists
 * in the campaign compendium (matched case-insensitively against item name or aliases).
 */
export function formatCompendiumWikilink(
  name: string,
  compendiumItems?: CompendiumItemRef[]
): string {
  if (!name) return name;
  const trimmed = name.trim();
  if (!trimmed || /^\[\[.+\]\]$/.test(trimmed)) {
    return name;
  }
  if (!compendiumItems || compendiumItems.length === 0) {
    return name;
  }

  const lower = trimmed.toLowerCase();
  const nameMatch = compendiumItems.find(
    (item) => item.name?.trim().toLowerCase() === lower
  );
  if (nameMatch) {
    return `[[${nameMatch.name.trim()}]]`;
  }

  for (const item of compendiumItems) {
    const matchedAlias = item.aliases?.find(
      (alias) => alias?.trim().toLowerCase() === lower
    );
    if (matchedAlias) {
      return `[[${matchedAlias.trim()}]]`;
    }
  }

  return name;
}

/**
 * Fetches all compendium Item records in an Archivist campaign across pages.
 */
export async function listAllCampaignItems(
  client: ArchivistClient,
  campaignId: string
): Promise<Item[]> {
  const allItems: Item[] = [];
  let page = 1;
  const size = 100;
  const maxPages = 20;

  while (page <= maxPages) {
    const res = await client.items.list({
      campaign_id: campaignId,
      page,
      size,
      with_links: true,
    });
    const batch = Array.isArray(res) ? res : res?.data || [];
    allItems.push(...batch);

    const totalPages = !Array.isArray(res) && typeof res?.pages === 'number' ? res.pages : 1;
    if (page >= totalPages || batch.length === 0) {
      break;
    }
    page++;
  }

  return allItems;
}

/**
 * Imports or updates eligible magic items (Uncommon or higher) from a character's inventory
 * into the campaign compendium, returning the updated list of campaign items (including newly created ones).
 */
export async function syncCharacterMagicItems(
  client: ArchivistClient,
  campaignId: string,
  char: CharacterData,
  ddbUrl: string,
  existingCampaignItems?: Item[]
): Promise<Item[]> {
  const campaignItems = existingCampaignItems
    ? [...existingCampaignItems]
    : await listAllCampaignItems(client, campaignId);

  if (!char.inventory || char.inventory.length === 0) {
    return campaignItems;
  }

  const magicItems = char.inventory.filter((item) => isEligibleMagicItem(item.rarity));
  if (magicItems.length === 0) {
    return campaignItems;
  }

  for (const item of magicItems) {
    try {
      const itemSection = formatItemDetails(item, ddbUrl);
      const itemNameLower = item.name.trim().toLowerCase();
      const existingCompItem = campaignItems.find(
        (i) =>
          i.name?.trim().toLowerCase() === itemNameLower ||
          i.aliases?.some((a) => a?.trim().toLowerCase() === itemNameLower)
      );

      if (existingCompItem) {
        const mergedDesc = mergeStatBlockIntoDescription(
          existingCompItem.description || '',
          itemSection,
          '### Item Details'
        );
        const compItemPayload: any = {
          description: mergedDesc,
        };
        if ((!existingCompItem.image || isLowResThumbnail(existingCompItem.image)) && item.image) {
          compItemPayload.image = item.image;
        }
        const updated = await client.items.update(existingCompItem.id, compItemPayload);
        if (updated) {
          const idx = campaignItems.findIndex((i) => i.id === existingCompItem.id);
          if (idx !== -1) {
            campaignItems[idx] = updated;
          }
        }
      } else {
        const created = await client.items.create({
          campaign_id: campaignId,
          name: item.name,
          type: item.type,
          description: itemSection,
          image: item.image,
        });
        if (created) {
          campaignItems.push(created);
        } else {
          campaignItems.push({
            id: '',
            campaign_id: campaignId,
            name: item.name,
            aliases: [],
            merge: false,
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn(`[Archives Beyond] Failed to sync magic item "${item.name}":`, err);
    }
  }

  return campaignItems;
}

/**
 * Formats a full character sheet for an Archivist journal entry.
 * Strips Obsidian-specific YAML frontmatter, prefixes with a [[Character Name]] wikilink,
 * and wraps inventory item and spell names in [[wikilink]] syntax when a matching Item record
 * exists in the campaign compendium.
 */
export function formatCharacterJournalMarkdown(
  char: CharacterData,
  itemsOrOptions?: CompendiumItemRef[] | FormatCharacterJournalOptions
): string {
  const compendiumItems = Array.isArray(itemsOrOptions)
    ? itemsOrOptions
    : itemsOrOptions?.compendiumItems;

  let targetChar = char;

  if (compendiumItems && compendiumItems.length > 0) {
    const lookup = new Map<string, string>();
    for (const item of compendiumItems) {
      if (item.aliases) {
        for (const alias of item.aliases) {
          const trimmedAlias = alias?.trim();
          if (trimmedAlias && !lookup.has(trimmedAlias.toLowerCase())) {
            lookup.set(trimmedAlias.toLowerCase(), trimmedAlias);
          }
        }
      }
    }
    for (const item of compendiumItems) {
      const trimmedName = item.name?.trim();
      if (trimmedName) {
        lookup.set(trimmedName.toLowerCase(), trimmedName);
      }
    }

    const wrapIfMatched = (rawName: string): string => {
      if (!rawName) return rawName;
      const trimmed = rawName.trim();
      if (!trimmed || /^\[\[.+\]\]$/.test(trimmed)) return rawName;
      const canonical = lookup.get(trimmed.toLowerCase());
      return canonical ? `[[${canonical}]]` : rawName;
    };

    const linkedInventory = char.inventory.map((invItem) => ({
      ...invItem,
      name: wrapIfMatched(invItem.name),
    }));

    let linkedSpellcasting = char.spellcasting;
    if (char.spellcasting) {
      const linkedGroups: Record<number, typeof char.spellcasting.groups[number]> = {};
      for (const [lvlKey, spells] of Object.entries(char.spellcasting.groups)) {
        linkedGroups[Number(lvlKey)] = spells.map((spell) => ({
          ...spell,
          name: wrapIfMatched(spell.name),
        }));
      }
      linkedSpellcasting = {
        ...char.spellcasting,
        groups: linkedGroups,
      };
    }

    targetChar = {
      ...char,
      inventory: linkedInventory,
      spellcasting: linkedSpellcasting,
    };
  }

  const rawMd = characterToMarkdown(targetChar);
  const bodyMd = rawMd.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '').trim();
  return `[[${char.name}]]\n\n${bodyMd}`.trim() + '\n';
}

/**
 * Finds or creates a Journal Folder in Archivist by name.
 */
export async function findOrCreateJournalFolder(
  clientOrApiKey: ArchivistClient | string,
  campaignId: string,
  folderName: string = 'Character Sheets',
  baseUrl = 'https://api.myarchivist.ai'
): Promise<string | null> {
  const client = typeof clientOrApiKey === 'string'
    ? new ArchivistClient({ apiKey: clientOrApiKey, baseUrl })
    : clientOrApiKey;

  try {
    const folder = await client.journalFolders.ensure(campaignId, folderName);
    return folder.id;
  } catch (err) {
    console.warn('[Archives Beyond] Error ensuring journal folder:', err);
    return null;
  }
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
  clientOrApiKey: ArchivistClient | string,
  campaignId: string,
  folderId: string | null,
  characterName: string,
  content: string,
  _contentRich?: any,
  baseUrl = 'https://api.myarchivist.ai'
): Promise<{ id: string; action: 'created' | 'updated' }> {
  const client = typeof clientOrApiKey === 'string'
    ? new ArchivistClient({ apiKey: clientOrApiKey, baseUrl })
    : clientOrApiKey;

  let existingId: string | null = null;
  try {
    const { data: entries } = await client.journals.list({
      campaign_id: campaignId,
      size: 100,
      format: 'markdown',
      with_links: true,
    });
    const match = entries.find(
      (e) => e.title?.trim().toLowerCase() === characterName.trim().toLowerCase()
    );
    if (match?.id) {
      existingId = match.id;
    }
  } catch (err) {
    console.warn('[Archives Beyond] Error searching journals:', err);
  }

  if (existingId) {
    const updated = await client.journals.updateMarkdown(existingId, content, {
      title: characterName,
      folderId: folderId || undefined,
      status: 'published',
    });
    return { id: updated.id, action: 'updated' };
  } else {
    const created = await client.journals.createMarkdown(campaignId, characterName, content, {
      folderId: folderId || undefined,
      status: 'published',
    });
    return { id: created.id, action: 'created' };
  }
}
