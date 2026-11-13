import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ArchivistClient, type Character, type Item } from '@astermoe/archivist-sdk';
import { type CharacterData, type MonsterData } from '@astermoe/dndbeyond-parser';
import {
  applyCharacterCustomizations,
  fetchCharacterWithCustomizations,
  isEligibleMagicItem,
  formatCompendiumWikilink,
  formatCharacterJournalMarkdown,
  listAllCampaignItems,
  syncCharacterMagicItems,
  isCreatureEntity,
  getArchivistCompendiumUrl,
  findMatchingCharacterOrCreature,
  syncMonsterToArchivist,
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

  it('imports customized items (by name or traits) and homebrew Common items into compendium while skipping plain mundane items', async () => {
    assert.equal(isEligibleMagicItem('Common'), false);
    assert.equal(isEligibleMagicItem('Uncommon'), true);
    assert.equal(isEligibleMagicItem({ rarity: 'Common', isHomebrew: true }), true);
    assert.equal(isEligibleMagicItem({ rarity: undefined, isHomebrew: true }), true);
    assert.equal(isEligibleMagicItem({ rarity: 'Common', isCustomized: true }), true);
    assert.equal(isEligibleMagicItem({ rarity: undefined, isCustomItem: true }), true);
    assert.equal(isEligibleMagicItem({ rarity: 'Common', isHomebrew: false, isCustomized: false }), false);

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
          // 1. Plain official Common item -> should NOT be imported
          {
            id: 1117491966,
            entityTypeId: 1439493548,
            equipped: true,
            quantity: 1,
            definition: {
              id: 100,
              name: 'Cloak of Billowing',
              filterType: 'Wondrous item',
              rarity: 'Common',
              isHomebrew: false,
              weight: 0,
              description: '<p>Billows dramatically.</p>',
            },
          },
          // 2. Homebrew Common item -> SHOULD be imported
          {
            id: 1116959863,
            entityTypeId: 1439493548,
            equipped: true,
            quantity: 1,
            definition: {
              id: 12159941,
              name: 'Bramble-Star',
              filterType: 'Wondrous item',
              rarity: 'Common',
              isHomebrew: true,
              weight: 3,
              description: '<p>Hand-crafted broom gifted to Stella.</p>',
            },
          },
          // 3. Customized Common item (custom name + cost override) -> SHOULD be imported with customizations intact
          {
            id: 1116957527,
            entityTypeId: 1439493548,
            equipped: true,
            quantity: 1,
            definition: {
              id: 422,
              name: 'Sack',
              filterType: 'Other Gear',
              rarity: 'Common',
              isHomebrew: false,
              weight: 0.5,
              cost: 0.01,
              description: '<p>A Sack holds up to 30 pounds within 1 cubic foot.</p>',
            },
          },
          // 4. Customized Common item (trait-only customization, same name) -> SHOULD be imported with overridden traits
          {
            id: 1087548407,
            entityTypeId: 1439493548,
            equipped: true,
            quantity: 1,
            definition: {
              id: 10,
              name: 'Dagger',
              filterType: 'Weapon',
              rarity: 'Common',
              isHomebrew: false,
              weight: 1,
              cost: 2,
              properties: [{ name: 'Finesse' }, { name: 'Light' }],
              description: '<p>Simple melee weapon.</p>',
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
          {
            typeId: 20,
            value: true,
            valueId: '1087548407',
            valueTypeId: '1439493548',
          },
          {
            typeId: 12,
            value: 1,
            valueId: '1087548407',
            valueTypeId: '1439493548',
          },
          {
            typeId: 9,
            value: 'Inscribed with Aldershine crest',
            valueId: '1087548407',
            valueTypeId: '1439493548',
          },
        ],
        customItems: [
          // 5. Custom sheet item -> SHOULD be imported
          {
            id: 25282084,
            name: 'Pressed Bramble Flower',
            description: '<p>Keepsake from Bramble Hallow Farm.</p>',
            weight: 0,
            cost: null,
            quantity: 1,
            notes: 'Tucked inside tome',
          },
        ],
      },
    };

    const mockDdbFetch: typeof fetch = async (input) => {
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

    const char = await fetchCharacterWithCustomizations(170163364, { fetchFn: mockDdbFetch });

    const createdPayloads: any[] = [];
    const dbItems: Item[] = [];
    const mockArchivistFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (method === 'POST' && urlStr.endsWith('/v1/items')) {
        createdPayloads.push(body);
        const created: Item = {
          id: `item_${dbItems.length + 1}`,
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

      throw new Error(`Unexpected Archivist request: ${method} ${urlStr}`);
    };

    const client = new ArchivistClient({
      apiKey: 'test-key',
      fetchFn: mockArchivistFetch as typeof fetch,
    });

    const syncedItems = await syncCharacterMagicItems(
      client,
      'camp_1',
      char,
      'https://www.dndbeyond.com/characters/170163364',
      []
    );

    const createdNames = createdPayloads.map((p) => p.name);
    assert.deepEqual(createdNames, [
      'Bramble-Star',
      'Aldershine Messenger Bag',
      'Dagger',
      'Pressed Bramble Flower',
    ]);
    assert.ok(!createdNames.includes('Cloak of Billowing'));

    // Verify customizations are intact on Aldershine Messenger Bag compendium description
    const bagPayload = createdPayloads.find((p) => p.name === 'Aldershine Messenger Bag');
    assert.ok(bagPayload.description.includes('*(Customized Sack)*'));
    assert.ok(bagPayload.description.includes('**Weight:** 0.5 lbs | **Cost:** 0.5 gp'));

    // Verify trait-only customizations are intact on Dagger compendium description
    const daggerPayload = createdPayloads.find((p) => p.name === 'Dagger');
    assert.ok(daggerPayload.description.includes('- **Properties:** Finesse, Light, Silvered'));
    assert.ok(daggerPayload.description.includes('- **To-Hit Bonus:** +1'));
    assert.ok(daggerPayload.description.includes('- **Notes:** Inscribed with Aldershine crest'));

    // Verify all imported items get [[wikilink]] wrapped in character journal while plain Common item stays plain
    const journalMd = formatCharacterJournalMarkdown(char, syncedItems);
    assert.ok(journalMd.includes('#### [[Bramble-Star]] (Equipped)'));
    assert.ok(journalMd.includes('#### [[Aldershine Messenger Bag]] (Equipped)'));
    assert.ok(journalMd.includes('#### [[Dagger]] (Equipped)'));
    assert.ok(journalMd.includes('#### [[Pressed Bramble Flower]]'));
    assert.ok(journalMd.includes('#### Cloak of Billowing (Equipped)'));
  });
});

describe('Monster / Creature Compendium Sync', () => {
  function createMockMonster(name = 'Owlbear'): MonsterData {
    const defaultAbility = {
      score: 10,
      modifier: '+0',
      modValue: 0,
      save: '+0',
      saveValue: 0,
      isProficient: false,
    };

    return {
      name,
      size: 'Large',
      type: 'Monstrosity',
      alignment: 'Unaligned',
      ac: { value: 13, formula: 'natural armor' },
      hp: { value: 59, formula: '7d10 + 21' },
      speed: '40 ft.',
      abilities: {
        strength: { ...defaultAbility, score: 20, modifier: '+5', modValue: 5 },
        dexterity: { ...defaultAbility, score: 12, modifier: '+1', modValue: 1 },
        constitution: { ...defaultAbility, score: 17, modifier: '+3', modValue: 3 },
        intelligence: { ...defaultAbility, score: 3, modifier: '-4', modValue: -4 },
        wisdom: { ...defaultAbility, score: 12, modifier: '+1', modValue: 1 },
        charisma: { ...defaultAbility, score: 7, modifier: '-2', modValue: -2 },
      },
      senses: ['Darkvision 60 ft.', 'Passive Perception 13'],
      languages: ['—'],
      cr: '3',
      xp: 700,
      traits: [{ name: 'Keen Sight and Smell', description: 'Advantage on Perception checks.' }],
      actions: [{ name: 'Multiattack', description: 'Makes two attacks: one beak and one claws.' }],
      imageUrl: 'https://www.dndbeyond.com/avatars/owlbear.png',
    };
  }

  it('creates new monsters with type Creature by default and resolves Creature compendium URLs', async () => {
    const createdPayloads: any[] = [];
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (method === 'GET' && urlStr.includes('/v1/characters?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [], total: 0, page: 1, size: 100, pages: 1 }),
        } as Response;
      }

      if (method === 'POST' && urlStr.endsWith('/v1/characters')) {
        createdPayloads.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'creature_1',
            campaign_id: body.campaign_id,
            character_name: body.character_name,
            character_aliases: [],
            type: body.type,
            description: body.description,
            image: body.image,
            merge: false,
            created_at: '2026-11-13T00:00:00Z',
          }),
        } as Response;
      }

      throw new Error(`Unexpected request: ${method} ${urlStr}`);
    };

    const client = new ArchivistClient({
      apiKey: 'test-key',
      fetchFn: mockFetch as typeof fetch,
    });

    const monster = createMockMonster('Owlbear');
    const result = await syncMonsterToArchivist(
      client,
      'camp_1',
      monster,
      'https://www.dndbeyond.com/monsters/16975-owlbear'
    );

    assert.equal(result.action, 'created');
    assert.equal(createdPayloads.length, 1);
    assert.equal(createdPayloads[0].type, 'Creature');
    assert.equal(createdPayloads[0].character_name, 'Owlbear');
    assert.equal(isCreatureEntity(result.entity), true);
    assert.equal(
      getArchivistCompendiumUrl(result.entity),
      'https://app.myarchivist.ai/compendium/creatures/creature_1?section=creatures'
    );
  });

  it('finds and updates existing entries regardless of whether they are in Creatures or promoted to NPCs in Characters', async () => {
    const dbEntities: Record<string, Character> = {
      npc_1: {
        id: 'npc_1',
        campaign_id: 'camp_1',
        character_name: 'Klarg',
        character_aliases: ['Bugbear Chief'],
        type: 'NPC',
        description: 'Leader of the Cragmaw hideout.\n\n### Stat Block\nOld stat block\n---\n[View on D&D Beyond](https://www.dndbeyond.com/monsters/bugbear)',
        image: 'https://www.dndbeyond.com/avatars/klarg-custom.png',
        merge: false,
        created_at: '2026-11-01T00:00:00Z',
      },
      creature_2: {
        id: 'creature_2',
        campaign_id: 'camp_1',
        character_name: 'Dire Wolf',
        character_aliases: [],
        type: 'Creature' as any,
        description: 'Pack hunter encountered in the woods.',
        image: undefined,
        merge: false,
        created_at: '2026-11-10T00:00:00Z',
      },
    };

    const patchPayloads: Array<{ id: string; body: any }> = [];

    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (method === 'GET' && urlStr.includes('/v1/characters?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: Object.values(dbEntities),
            total: 2,
            page: 1,
            size: 100,
            pages: 1,
          }),
        } as Response;
      }

      const charIdMatch = urlStr.match(/\/v1\/characters\/([^?]+)/);
      if (charIdMatch) {
        const id = decodeURIComponent(charIdMatch[1]);
        if (method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => dbEntities[id],
          } as Response;
        }
        if (method === 'PATCH') {
          patchPayloads.push({ id, body });
          dbEntities[id] = {
            ...dbEntities[id],
            ...body,
          };
          return {
            ok: true,
            status: 200,
            json: async () => dbEntities[id],
          } as Response;
        }
      }

      throw new Error(`Unexpected request: ${method} ${urlStr}`);
    };

    const client = new ArchivistClient({
      apiKey: 'test-key',
      fetchFn: mockFetch as typeof fetch,
    });

    // 1. Monster that rose to a full NPC in Characters (matched by name or alias) updates in-place in Characters
    const bugbearChief = createMockMonster('Bugbear Chief');
    const npcResult = await syncMonsterToArchivist(
      client,
      'camp_1',
      bugbearChief,
      'https://www.dndbeyond.com/monsters/bugbear-chief'
    );

    assert.equal(npcResult.action, 'updated');
    assert.equal(npcResult.entity.id, 'npc_1');
    assert.equal(npcResult.entity.type, 'NPC');
    assert.equal(npcResult.entity.character_name, 'Klarg');
    assert.equal(patchPayloads[0].body.type, undefined);
    assert.ok(npcResult.entity.description?.startsWith('Leader of the Cragmaw hideout.'));
    assert.ok(npcResult.entity.description?.includes('**Large Monstrosity, Unaligned**'));
    assert.equal(
      getArchivistCompendiumUrl(npcResult.entity),
      'https://app.myarchivist.ai/compendium/characters/npc_1?section=characters'
    );

    // 2. Monster in Creatures updates in-place in Creatures
    const direWolf = createMockMonster('Dire Wolf');
    const creatureResult = await syncMonsterToArchivist(
      client,
      'camp_1',
      direWolf,
      'https://www.dndbeyond.com/monsters/dire-wolf'
    );

    assert.equal(creatureResult.action, 'updated');
    assert.equal(creatureResult.entity.id, 'creature_2');
    assert.equal(creatureResult.entity.type, 'Creature');
    assert.equal(patchPayloads[1].body.type, undefined);
    assert.ok(creatureResult.entity.description?.startsWith('Pack hunter encountered in the woods.'));
    assert.equal(
      getArchivistCompendiumUrl(creatureResult.entity),
      'https://app.myarchivist.ai/compendium/creatures/creature_2?section=creatures'
    );

    // 3. Direct matcher check
    assert.equal(
      findMatchingCharacterOrCreature(Object.values(dbEntities), 'klarg')?.id,
      'npc_1'
    );
    assert.equal(
      findMatchingCharacterOrCreature(Object.values(dbEntities), 'dire wolf')?.id,
      'creature_2'
    );
  });
});


