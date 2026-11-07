import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ArchivistClient, type Item } from '@astermoe/archivist-sdk';
import { type CharacterData } from '@astermoe/dndbeyond-parser';
import {
  applyCharacterCustomizations,
  fetchCharacterWithCustomizations,
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

describe('D&D Beyond character customizations', () => {
  it('applies custom item names, cost/weight overrides, notes, customItems, and spell renames idempotently', () => {
    const baseChar = createMockStellaCharacter();
    baseChar.inventory.push({
      id: 1116957527,
      name: 'Sack',
      type: 'Other Gear',
      requiresAttunement: false,
      weight: 0.5,
      cost: '0.01 gp',
      description: 'A sack holds up to 30 pounds.',
      quantity: 1,
      equipped: true,
      totalWeight: 0.5,
    });

    const rawCharacterData = {
      inventory: [
        {
          id: 1116957527,
          entityTypeId: 1439493548,
          equipped: true,
          quantity: 1,
          definition: {
            id: 422,
            name: 'Sack',
            filterType: 'Other Gear',
            weight: 0.5,
            cost: 0.01,
          },
        },
        {
          id: 4,
          entityTypeId: 1439493548,
          equipped: true,
          quantity: 2,
          definition: {
            id: 10,
            name: 'Dagger',
            filterType: 'Weapon',
            weight: 1,
          },
        },
      ],
      customItems: [
        {
          id: 25282084,
          name: 'Handmade Sketchbook',
          description: '<p>Filled with pressed flowers.</p>',
          weight: 1,
          cost: 5,
          quantity: 1,
          notes: 'Gift from home',
        },
      ],
      classSpells: [
        {
          spells: [
            {
              id: 888001,
              entityTypeId: 435869154,
              definition: {
                id: 2001,
                name: 'Eldritch Blast',
              },
            },
          ],
        },
      ],
      characterValues: [
        {
          typeId: 8,
          value: 'Aldershine Messenger Bag',
          valueId: '1116957527',
          valueTypeId: '1439493548',
        },
        {
          typeId: 19,
          value: 0.5,
          valueId: '1116957527',
          valueTypeId: '1439493548',
        },
        {
          typeId: 9,
          value: 'Stitched with starlight thread',
          valueId: '1116957527',
          valueTypeId: '1439493548',
        },
        {
          typeId: 22,
          value: 1.5,
          valueId: '4',
          valueTypeId: '1439493548',
        },
        {
          typeId: 20,
          value: true,
          valueId: '4',
          valueTypeId: '1439493548',
        },
        {
          typeId: 8,
          value: 'Starlight Blast',
          valueId: '888001',
          valueTypeId: '435869154',
        },
      ],
    };

    const once = applyCharacterCustomizations(baseChar, rawCharacterData);
    const twice = applyCharacterCustomizations(once, rawCharacterData);

    const bag = twice.inventory.find((i) => i.id === 1116957527);
    assert.equal(bag?.name, 'Aldershine Messenger Bag');
    assert.equal(bag?.cost, '0.5 gp');
    assert.deepEqual(bag?.notes, ['Notes: Stitched with starlight thread']);

    const dagger = twice.inventory.find((i) => i.id === 4);
    assert.equal(dagger?.weight, 1.5);
    assert.equal(dagger?.totalWeight, 1.5);
    assert.deepEqual(dagger?.notes, ['Properties: Silvered']);

    const sketchbook = twice.inventory.filter((i) => i.id === 25282084);
    assert.equal(sketchbook.length, 1);
    assert.equal(sketchbook[0].name, 'Handmade Sketchbook');
    assert.equal(sketchbook[0].cost, '5 gp');
    assert.deepEqual(sketchbook[0].notes, ['Notes: Gift from home']);

    assert.equal(twice.spellcasting?.groups[0][0].name, 'Starlight Blast');
  });

  it('fetchCharacterWithCustomizations resolves Stella customized Sack as Aldershine Messenger Bag and links if in compendium', async () => {
    const mockRawApiPayload = {
      success: true,
      data: {
        id: 170163364,
        name: 'Stella Aldershine',
        classes: [{ level: 3, definition: { name: 'Warlock', spellCastingAbilityId: 6 } }],
        stats: [
          { id: 1, value: 10 },
          { id: 2, value: 16 },
          { id: 3, value: 14 },
          { id: 4, value: 10 },
          { id: 5, value: 14 },
          { id: 6, value: 18 },
        ],
        inventory: [
          {
            id: 1116957527,
            entityTypeId: 1439493548,
            equipped: true,
            quantity: 1,
            definition: {
              id: 422,
              name: 'Sack',
              filterType: 'Other Gear',
              weight: 0.5,
              cost: 0.01,
              description: '<p>A sack holds up to 30 pounds.</p>',
            },
          },
        ],
        characterValues: [
          {
            typeId: 8,
            value: 'Aldershine Messenger Bag',
            valueId: '1116957527',
            valueTypeId: '1439493548',
          },
          {
            typeId: 19,
            value: 0.5,
            valueId: '1116957527',
            valueTypeId: '1439493548',
          },
        ],
        customItems: [],
      },
    };

    const mockFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('cobalt-token')) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      return {
        ok: true,
        status: 200,
        clone: () => ({ json: async () => mockRawApiPayload }) as Response,
        json: async () => mockRawApiPayload,
      } as Response;
    };

    const char = await fetchCharacterWithCustomizations(170163364, { fetchFn: mockFetch });
    assert.equal(char.inventory[0].name, 'Aldershine Messenger Bag');
    assert.equal(char.inventory[0].cost, '0.5 gp');

    const mdPlain = formatCharacterJournalMarkdown(char, []);
    assert.ok(mdPlain.includes('#### Aldershine Messenger Bag (Equipped)'));
    assert.ok(!mdPlain.includes('#### Sack'));

    const mdLinked = formatCharacterJournalMarkdown(char, [
      { id: 'bag-1', name: 'Aldershine Messenger Bag', aliases: [] },
    ]);
    assert.ok(mdLinked.includes('#### [[Aldershine Messenger Bag]] (Equipped)'));
  });
});


