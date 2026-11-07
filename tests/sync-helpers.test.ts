import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ArchivistClient, type Item } from '@astermoe/archivist-sdk';
import { type CharacterData } from '@astermoe/dndbeyond-parser';
import {
  formatCompendiumWikilink,
  formatCharacterJournalMarkdown,
  listAllCampaignItems,
  syncCharacterMagicItems,
} from '../src/utils/sync-helpers.ts';

function createMockStellaCharacter(): CharacterData {
  const defaultAbility = {
    score: 10,
    modifier: '+0',
    modValue: 0,
    save: '+0',
    saveValue: 0,
    isProficient: false,
  };

  return {
    id: 170163364,
    name: 'Stella Aldershine',
    avatarUrl: 'https://example.com/stella.png',
    species: 'Human',
    classes: [{ name: 'Warlock', level: 3 }],
    totalLevel: 3,
    classLine: 'Warlock 3',
    background: 'Artisan',
    alignment: 'Chaotic Good',
    hp: { value: 24, max: 24, temp: 0 },
    ac: { value: 14, base: 11, dexBonus: 3, shieldBonus: 0, otherBonus: 0 },
    initiative: '+3',
    speed: '30 ft',
    speeds: { walk: 30 },
    proficiencyBonus: 2,
    senses: ['Passive Perception 12'],
    languages: ['Common'],
    abilities: {
      strength: defaultAbility,
      dexterity: { ...defaultAbility, score: 16, modifier: '+3', modValue: 3, save: '+3', saveValue: 3 },
      constitution: { ...defaultAbility, score: 14, modifier: '+2', modValue: 2, save: '+2', saveValue: 2 },
      intelligence: defaultAbility,
      wisdom: { ...defaultAbility, score: 14, modifier: '+2', modValue: 2, save: '+4', saveValue: 4, isProficient: true },
      charisma: { ...defaultAbility, score: 18, modifier: '+4', modValue: 4, save: '+6', saveValue: 6, isProficient: true },
    },
    skills: [],
    features: [],
    inventory: [
      {
        id: 1,
        name: 'Cloak of Billowing',
        type: 'Wondrous item',
        rarity: 'Common',
        requiresAttunement: false,
        description: 'Billows dramatically.',
        quantity: 1,
        equipped: true,
        totalWeight: 0,
      },
      {
        id: 2,
        name: 'Bramble-Star',
        type: 'Wondrous item',
        rarity: 'Uncommon',
        requiresAttunement: false,
        description: 'Hand-crafted broom gifted to Stella.',
        quantity: 1,
        equipped: true,
        totalWeight: 3,
      },
      {
        id: 3,
        name: 'Violet-Spark',
        type: 'Rod',
        rarity: 'Uncommon',
        requiresAttunement: true,
        description: 'Crafted in Artificer class.',
        quantity: 1,
        equipped: true,
        totalWeight: 0,
      },
      {
        id: 4,
        name: 'Dagger',
        type: 'Weapon',
        rarity: 'Common',
        requiresAttunement: false,
        description: 'Simple melee weapon.',
        quantity: 1,
        equipped: true,
        totalWeight: 1,
      },
    ],
    spellcasting: {
      ability: 'Charisma',
      saveDC: 14,
      attackBonus: '+6',
      groups: {
        0: [
          {
            name: 'Eldritch Blast',
            level: 0,
            school: 'Evocation',
            castingTime: '1 Action',
            range: '120 ft',
            components: 'V, S',
            duration: 'Instantaneous',
            description: 'A beam of crackling energy.',
          },
        ],
        2: [
          {
            name: 'Battle Familiar',
            level: 2,
            school: 'Conjuration',
            castingTime: '1 Bonus Action',
            range: '60 ft',
            components: 'V, S',
            duration: '1 Minute',
            description: 'Empowers your familiar in combat.',
          },
        ],
      },
    },
    spellSlots: [{ level: 2, used: 0, available: 2 }],
    bio: {
      appearance: 'Purple cloak',
      backstory: 'From Bramble Hallow Farm',
    },
  };
}

describe('formatCompendiumWikilink', () => {
  const compendiumItems = [
    { id: 'item-1', name: 'Bramble-Star', aliases: ['Babs'] },
    { id: 'item-2', name: 'Battle Familiar', aliases: [] },
  ];

  it('wraps exact and case-insensitive matches in [[wikilink]] syntax', () => {
    assert.equal(formatCompendiumWikilink('Bramble-Star', compendiumItems), '[[Bramble-Star]]');
    assert.equal(formatCompendiumWikilink('bramble-star', compendiumItems), '[[Bramble-Star]]');
    assert.equal(formatCompendiumWikilink('Battle Familiar', compendiumItems), '[[Battle Familiar]]');
  });

  it('wraps alias matches and leaves non-matches unchanged', () => {
    assert.equal(formatCompendiumWikilink('Babs', compendiumItems), '[[Babs]]');
    assert.equal(formatCompendiumWikilink('Dagger', compendiumItems), 'Dagger');
    assert.equal(formatCompendiumWikilink('[[Bramble-Star]]', compendiumItems), '[[Bramble-Star]]');
  });
});

describe('formatCharacterJournalMarkdown', () => {
  it('wraps matching inventory items and spells in [[wikilink]] syntax without mutating input', () => {
    const char = createMockStellaCharacter();
    const compendiumItems = [
      { id: '5923ace5-8bdf-47cf-99d9-a4200a65fc5d', name: 'Bramble-Star', aliases: ['Babs'] },
      { id: 'spell-1', name: 'Battle Familiar', aliases: [] },
    ];

    const md = formatCharacterJournalMarkdown(char, compendiumItems);

    // Character link at top
    assert.match(md, /^\[\[Stella Aldershine\]\]/);

    // Matched inventory item wrapped, (Equipped) kept outside brackets
    assert.ok(md.includes('#### [[Bramble-Star]] (Equipped)'), 'Expected [[Bramble-Star]] in inventory');

    // Unmatched inventory items left plain
    assert.ok(md.includes('#### Cloak of Billowing (Equipped)'));
    assert.ok(md.includes('#### Violet-Spark (Equipped) (Requires Attunement)'));
    assert.ok(md.includes('#### Dagger (Equipped)'));

    // Matched spell wrapped, unmatched spell left plain
    assert.ok(md.includes('#### [[Battle Familiar]]'), 'Expected [[Battle Familiar]] in spellcasting');
    assert.ok(md.includes('#### Eldritch Blast'));

    // Original CharacterData is not mutated
    assert.equal(char.inventory[1].name, 'Bramble-Star');
    assert.equal(char.spellcasting?.groups[2][0].name, 'Battle Familiar');
  });
});

describe('syncCharacterMagicItems + journal linking integration', () => {
  it('imports eligible magic items first and links both existing and newly created items in journal', async () => {
    const char = createMockStellaCharacter();

    const dbItems: Item[] = [
      {
        id: '5923ace5-8bdf-47cf-99d9-a4200a65fc5d',
        campaign_id: 'camp_1',
        name: 'Bramble-Star',
        aliases: [],
        description: 'Stella broom.\n\n### Item Details\nOld details\n---\n[View on D&D Beyond](https://www.dndbeyond.com/characters/170163364)',
        merge: false,
        created_at: '2026-10-01T00:00:00Z',
      },
    ];

    const calls: Array<{ method: string; url: string; body?: any }> = [];
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url: urlStr, body });

      if (method === 'GET' && urlStr.includes('/v1/items')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [...dbItems],
            total: dbItems.length,
            page: 1,
            size: 100,
            pages: 1,
          }),
        } as Response;
      }

      if (method === 'PATCH' && urlStr.includes('/v1/items/')) {
        const updated = { ...dbItems[0], ...body };
        dbItems[0] = updated;
        return {
          ok: true,
          status: 200,
          json: async () => updated,
        } as Response;
      }

      if (method === 'POST' && urlStr.endsWith('/v1/items')) {
        const created: Item = {
          id: `new_${dbItems.length + 1}`,
          campaign_id: body.campaign_id,
          name: body.name,
          aliases: [],
          type: body.type,
          description: body.description,
          merge: false,
          created_at: '2026-11-07T00:00:00Z',
        };
        dbItems.push(created);
        return {
          ok: true,
          status: 201,
          json: async () => created,
        } as Response;
      }

      throw new Error(`Unexpected request: ${method} ${urlStr}`);
    };

    const client = new ArchivistClient({
      apiKey: 'test-key',
      fetchFn: mockFetch as typeof fetch,
    });

    const initialItems = await listAllCampaignItems(client, 'camp_1');
    assert.equal(initialItems.length, 1);

    const updatedItems = await syncCharacterMagicItems(
      client,
      'camp_1',
      char,
      'https://www.dndbeyond.com/characters/170163364',
      initialItems
    );

    // Bramble-Star updated (PATCH), Violet-Spark created (POST), Common items skipped
    assert.equal(updatedItems.length, 2);
    assert.ok(calls.some((c) => c.method === 'PATCH' && c.url.includes('5923ace5-8bdf-47cf-99d9-a4200a65fc5d')));
    assert.ok(calls.some((c) => c.method === 'POST' && c.body?.name === 'Violet-Spark'));
    assert.ok(!calls.some((c) => c.method === 'POST' && c.body?.name === 'Cloak of Billowing'));
    assert.ok(!calls.some((c) => c.method === 'POST' && c.body?.name === 'Dagger'));

    // Generating journal markdown with updatedItems links BOTH Bramble-Star AND newly created Violet-Spark!
    const journalMd = formatCharacterJournalMarkdown(char, updatedItems);
    assert.ok(journalMd.includes('#### [[Bramble-Star]] (Equipped)'));
    assert.ok(journalMd.includes('#### [[Violet-Spark]] (Equipped) (Requires Attunement)'));
    assert.ok(journalMd.includes('#### Cloak of Billowing (Equipped)'));
    assert.ok(journalMd.includes('#### Dagger (Equipped)'));
  });
});

