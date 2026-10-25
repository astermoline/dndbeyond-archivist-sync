import { ArchivistClient, Campaign, Character, Item } from '@astermoe/archivist-sdk';
import {
  fetchCharacterById,
  extractCharacterId,
  extractMonsterId,
  fetchMonsterById,
  parseMonsterDom,
  fetchItemTooltipJson,
  extractItemId,
  parseItemDom,
  CharacterData,
  MonsterData,
  ItemData,
} from '@astermoe/dndbeyond-parser';
import {
  isEligibleMagicItem,
  formatCharacterStatBlock,
  formatMonsterStatBlock,
  formatItemDetails,
  mergeStatBlockIntoDescription,
  extractUserNotesFromDescription,
} from '../src/utils/sync-helpers';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement;
  const settingsView = document.getElementById('settings-view') as HTMLElement;
  const mainView = document.getElementById('main-view') as HTMLElement;

  const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
  const saveKeyBtn = document.getElementById('save-key-btn') as HTMLButtonElement;
  const saveSpinner = document.getElementById('save-spinner') as HTMLElement;
  const settingsStatus = document.getElementById('settings-status') as HTMLElement;

  const campaignSelect = document.getElementById('campaign-select') as HTMLSelectElement;
  const statusDot = document.getElementById('status-dot') as HTMLElement;
  const entityStatusLabel = document.getElementById('entity-status-label') as HTMLElement;
  const entityName = document.getElementById('entity-name') as HTMLElement;
  const entityMeta = document.getElementById('entity-meta') as HTMLElement;
  const openArchivistLink = document.getElementById('open-archivist-link') as HTMLAnchorElement;
  const itemImportOptions = document.getElementById('item-import-options') as HTMLElement;
  const syncInventoryItems = document.getElementById('sync-inventory-items') as HTMLInputElement;

  const syncBtn = document.getElementById('sync-btn') as HTMLButtonElement;
  const syncBtnText = document.getElementById('sync-btn-text') as HTMLElement;
  const syncSpinner = document.getElementById('sync-spinner') as HTMLElement;
  const updateBackstoryBtn = document.getElementById('update-backstory-btn') as HTMLButtonElement;
  const updateBackstorySpinner = document.getElementById('update-backstory-spinner') as HTMLElement;
  const syncResult = document.getElementById('sync-result') as HTMLElement;

  let client: ArchivistClient | null = null;
  let activeTabUrl = '';
  let campaigns: Campaign[] = [];
  let selectedCampaignId = '';
  let detectedType: 'character' | 'monster' | 'item' | null = null;
  let detectedChar: CharacterData | null = null;
  let detectedMonster: MonsterData | null = null;
  let detectedItem: ItemData | null = null;
  let existingCharacter: Character | null = null;
  let existingMonster: Character | null = null;
  let existingItem: Item | null = null;

  // 1. Load saved settings from chrome.storage
  const stored = await chrome.storage.sync.get(['archivistApiKey', 'selectedCampaignId']);
  const savedKey = stored.archivistApiKey || '';
  selectedCampaignId = stored.selectedCampaignId || '';

  if (savedKey) {
    apiKeyInput.value = savedKey;
    initializeClient(savedKey);
  } else {
    showSettingsView(true);
  }

  function showSettingsView(show: boolean) {
    if (show) {
      settingsView.classList.remove('hidden');
      mainView.classList.add('hidden');
    } else {
      settingsView.classList.add('hidden');
      mainView.classList.remove('hidden');
    }
  }

  settingsToggle.addEventListener('click', () => {
    const isShowing = !settingsView.classList.contains('hidden');
    showSettingsView(!isShowing);
  });

  // 2. Initialize Archivist Client and Load Campaigns
  async function initializeClient(key: string) {
    try {
      client = new ArchivistClient({ apiKey: key });
      const { data: camps } = await client.campaigns.list();
      campaigns = camps;

      if (campaigns.length === 0) {
        setSelectOptions(['No campaigns found in your account']);
        return;
      }

      campaignSelect.innerHTML = '';
      campaigns.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.title} (${c.system})`;
        if (c.id === selectedCampaignId) opt.selected = true;
        campaignSelect.appendChild(opt);
      });

      campaignSelect.disabled = false;
      if (!selectedCampaignId || !campaigns.some((c) => c.id === selectedCampaignId)) {
        selectedCampaignId = campaigns[0].id;
        chrome.storage.sync.set({ selectedCampaignId });
      }

      showSettingsView(false);
      inspectCurrentTab();
    } catch (err: any) {
      console.error('Failed to connect to Archivist:', err);
      showSettingsView(true);
      showStatus(settingsStatus, `Authentication failed: ${err.message}`, 'error');
    }
  }

  function setSelectOptions(labels: string[]) {
    campaignSelect.innerHTML = '';
    labels.forEach((l) => {
      const opt = document.createElement('option');
      opt.textContent = l;
      campaignSelect.appendChild(opt);
    });
    campaignSelect.disabled = true;
  }

  // 3. Save API Key Button
  saveKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showStatus(settingsStatus, 'Please enter a valid API key', 'error');
      return;
    }

    saveKeyBtn.disabled = true;
    saveSpinner.style.display = 'inline-block';
    hideStatus(settingsStatus);

    try {
      const testClient = new ArchivistClient({ apiKey: key });
      await testClient.campaigns.list({ size: 1 });
      await chrome.storage.sync.set({ archivistApiKey: key });
      await initializeClient(key);
      showStatus(settingsStatus, 'Connected successfully!', 'success');
    } catch (err: any) {
      showStatus(settingsStatus, `Connection failed: ${err.message}`, 'error');
    } finally {
      saveKeyBtn.disabled = false;
      saveSpinner.style.display = 'none';
    }
  });

  // 4. Change Campaign Selection
  campaignSelect.addEventListener('change', async () => {
    selectedCampaignId = campaignSelect.value;
    await chrome.storage.sync.set({ selectedCampaignId });
    await checkExistingEntityInCampaign();
  });

  // 5. Inspect Active Tab on D&D Beyond
  async function inspectCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setEntityState('error', 'Not a valid tab', 'Open D&D Beyond to sync');
        return;
      }

      activeTabUrl = tab.url;
      const charId = extractCharacterId(activeTabUrl);
      const monsterId = extractMonsterId(activeTabUrl);
      const itemId = extractItemId(activeTabUrl);

      if (charId) {
        detectedType = 'character';
        setEntityState('ready', 'Character Detected', 'Loading character info...');
        syncBtn.disabled = true;

        try {
          detectedChar = await fetchCharacterById(charId);
          setEntityState('ready', 'Character Detected', detectedChar.name);
          entityMeta.textContent = `Level ${detectedChar.totalLevel} ${detectedChar.species} ${detectedChar.classLine}`;
          itemImportOptions.classList.remove('hidden');
          await checkExistingEntityInCampaign();
        } catch (err: any) {
          setEntityState('error', 'Failed to fetch character', err.message);
        }
      } else if (monsterId || activeTabUrl.includes('/monsters/')) {
        detectedType = 'monster';
        setEntityState('ready', 'Monster Detected', 'Loading monster stat block...');
        syncBtn.disabled = true;
        itemImportOptions.classList.add('hidden');

        try {
          if (monsterId) {
            try {
              detectedMonster = await fetchMonsterById(monsterId);
            } catch {
              // DOM fallback
              const [res] = await chrome.scripting.executeScript({
                target: { tabId: tab.id! },
                func: () => document.body.innerHTML,
              });
              const parser = new DOMParser();
              const doc = parser.parseFromString(res.result, 'text/html');
              detectedMonster = parseMonsterDom(doc);
            }
          } else {
            const [res] = await chrome.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => document.body.innerHTML,
            });
            const parser = new DOMParser();
            const doc = parser.parseFromString(res.result, 'text/html');
            detectedMonster = parseMonsterDom(doc);
          }

          setEntityState('ready', 'Monster Detected', detectedMonster.name);
          entityMeta.textContent = `CR ${detectedMonster.cr} ${detectedMonster.size} ${detectedMonster.type}`;
          await checkExistingEntityInCampaign();
        } catch (err: any) {
          setEntityState('error', 'Failed to fetch monster', err.message);
        }
      } else if (itemId || activeTabUrl.includes('magic-items') || activeTabUrl.includes('equipment')) {
        detectedType = 'item';
        setEntityState('ready', 'Item Detected', 'Loading item info...');
        syncBtn.disabled = true;
        itemImportOptions.classList.add('hidden');

        try {
          if (itemId) {
            detectedItem = await fetchItemTooltipJson(itemId, { isMagicItem: activeTabUrl.includes('magic-items') });
          } else {
            detectedItem = parseItemDom(document);
          }
          setEntityState('ready', 'Item Detected', detectedItem.name);
          entityMeta.textContent = `${detectedItem.type}${detectedItem.rarity ? `, ${detectedItem.rarity}` : ''}`;
          await checkExistingEntityInCampaign();
        } catch (err: any) {
          setEntityState('error', 'Failed to fetch item', err.message);
        }
      } else {
        detectedType = null;
        setEntityState('error', 'Page Not Supported', 'Navigate to a Character, Monster, or Item');
        entityMeta.textContent = 'Open a D&D Beyond character sheet, monster stat block, or item page to sync.';
        syncBtn.disabled = true;
        openArchivistLink.classList.add('hidden');
        updateBackstoryBtn.classList.add('hidden');
      }
    } catch (err: any) {
      setEntityState('error', 'Inspection Error', err.message);
    }
  }

  // 6. Check if entity already exists in Archivist campaign
  async function checkExistingEntityInCampaign() {
    if (!client || !selectedCampaignId) return;

    if (detectedType === 'character' && detectedChar) {
      try {
        const { data: charList } = (await client.characters.list({
          campaign_id: selectedCampaignId,
          size: 100,
        })) as { data: Character[] };

        existingCharacter =
          charList.find(
            (c) =>
              c.character_name.toLowerCase() === detectedChar!.name.toLowerCase() ||
              c.character_aliases?.some((a) => a.toLowerCase() === detectedChar!.name.toLowerCase())
          ) || null;

        if (existingCharacter) {
          statusDot.className = 'status-dot matched';
          entityStatusLabel.textContent = 'Matched in Campaign';
          syncBtnText.textContent = 'Sync / Update Character';
          openArchivistLink.href = `https://myarchivist.ai/campaigns/${selectedCampaignId}/characters/${existingCharacter.id}`;
          openArchivistLink.classList.remove('hidden');
          updateBackstoryBtn.classList.remove('hidden');
        } else {
          statusDot.className = 'status-dot ready';
          entityStatusLabel.textContent = 'New Character (Ready to Import)';
          syncBtnText.textContent = 'Import Character to Archivist';
          openArchivistLink.classList.add('hidden');
          updateBackstoryBtn.classList.add('hidden');
        }
        syncBtn.disabled = false;
        syncBtn.classList.remove('disabled');
      } catch (err) {
        console.error('Error listing campaign characters:', err);
      }
    } else if (detectedType === 'monster' && detectedMonster) {
      try {
        const { data: charList } = (await client.characters.list({
          campaign_id: selectedCampaignId,
          size: 100,
        })) as { data: Character[] };

        existingMonster =
          charList.find(
            (c) =>
              c.character_name.toLowerCase() === detectedMonster!.name.toLowerCase() ||
              c.character_aliases?.some((a) => a.toLowerCase() === detectedMonster!.name.toLowerCase())
          ) || null;

        if (existingMonster) {
          statusDot.className = 'status-dot matched';
          entityStatusLabel.textContent = 'Monster Matched in Campaign';
          syncBtnText.textContent = 'Sync / Update Monster';
          openArchivistLink.href = `https://myarchivist.ai/campaigns/${selectedCampaignId}/characters/${existingMonster.id}`;
          openArchivistLink.classList.remove('hidden');
        } else {
          statusDot.className = 'status-dot ready';
          entityStatusLabel.textContent = 'New Monster (Ready to Import)';
          syncBtnText.textContent = 'Import Monster to Archivist';
          openArchivistLink.classList.add('hidden');
        }
        updateBackstoryBtn.classList.add('hidden');
        syncBtn.disabled = false;
        syncBtn.classList.remove('disabled');
      } catch (err) {
        console.error('Error listing campaign characters for monster match:', err);
      }
    } else if (detectedType === 'item' && detectedItem) {
      try {
        const { data: itemList } = (await client.items.list({
          campaign_id: selectedCampaignId,
          size: 100,
        })) as { data: Item[] };

        existingItem =
          itemList.find(
            (i) =>
              i.name.toLowerCase() === detectedItem!.name.toLowerCase() ||
              i.aliases?.some((a) => a.toLowerCase() === detectedItem!.name.toLowerCase())
          ) || null;

        if (existingItem) {
          statusDot.className = 'status-dot matched';
          entityStatusLabel.textContent = 'Item Matched in Campaign';
          syncBtnText.textContent = 'Update Item in Archivist';
          openArchivistLink.href = `https://myarchivist.ai/campaigns/${selectedCampaignId}/items/${existingItem.id}`;
          openArchivistLink.classList.remove('hidden');
        } else {
          statusDot.className = 'status-dot ready';
          entityStatusLabel.textContent = 'New Item (Ready to Import)';
          syncBtnText.textContent = 'Import Item to Archivist';
          openArchivistLink.classList.add('hidden');
        }
        updateBackstoryBtn.classList.add('hidden');
        syncBtn.disabled = false;
        syncBtn.classList.remove('disabled');
      } catch (err) {
        console.error('Error listing campaign items:', err);
      }
    }
  }

  function setEntityState(dotState: 'ready' | 'matched' | 'error', label: string, name: string) {
    statusDot.className = `status-dot ${dotState}`;
    entityStatusLabel.textContent = label;
    entityName.textContent = name;
  }

  // 7. Perform Sync / Import Action
  syncBtn.addEventListener('click', async () => {
    if (!client || !selectedCampaignId) return;

    syncBtn.disabled = true;
    syncSpinner.style.display = 'inline-block';
    hideStatus(syncResult);

    try {
      if (detectedType === 'character' && detectedChar) {
        const statBlockSection = formatCharacterStatBlock(detectedChar, activeTabUrl);

        if (existingCharacter) {
          const mergedDescription = mergeStatBlockIntoDescription(
            existingCharacter.description || '',
            statBlockSection,
            '# Stat Block'
          );

          await client.characters.update(existingCharacter.id, {
            character_name: detectedChar.name,
            description: mergedDescription,
            backstory: detectedChar.bio.backstory || detectedChar.bio.appearance,
            image: detectedChar.avatarUrl,
          });
          showStatus(syncResult, `Updated "${detectedChar.name}" in Archivist!`, 'success');
        } else {
          const created = await client.characters.create({
            campaign_id: selectedCampaignId,
            character_name: detectedChar.name,
            type: 'PC',
            description: statBlockSection,
            backstory: detectedChar.bio.backstory || detectedChar.bio.appearance,
            image: detectedChar.avatarUrl,
          });
          existingCharacter = created;
          showStatus(syncResult, `Imported "${detectedChar.name}" into Archivist!`, 'success');
        }

        // Optional: Import equipped magic items (Uncommon or higher only)
        if (syncInventoryItems.checked && detectedChar.inventory.length > 0) {
          const magicItems = detectedChar.inventory.filter((item) => isEligibleMagicItem(item.rarity));

          if (magicItems.length > 0) {
            const { data: campaignItems } = (await client.items.list({
              campaign_id: selectedCampaignId,
              size: 100,
            })) as { data: Item[] };

            for (const item of magicItems) {
              try {
                const itemSection = formatItemDetails(item, activeTabUrl);
                const existingCompItem = campaignItems.find(
                  (i) => i.name.toLowerCase() === item.name.toLowerCase()
                );

                if (existingCompItem) {
                  const mergedDesc = mergeStatBlockIntoDescription(
                    existingCompItem.description || '',
                    itemSection,
                    '# Item Details'
                  );
                  await client.items.update(existingCompItem.id, {
                    description: mergedDesc,
                    image: item.image,
                  });
                } else {
                  await client.items.create({
                    campaign_id: selectedCampaignId,
                    name: item.name,
                    type: item.type,
                    description: itemSection,
                    image: item.image,
                  });
                }
              } catch {
                // Ignore individual item sync errors
              }
            }
          }
        }
      } else if (detectedType === 'monster' && detectedMonster) {
        const monsterStatBlock = formatMonsterStatBlock(detectedMonster, activeTabUrl);

        if (existingMonster) {
          const mergedDescription = mergeStatBlockIntoDescription(
            existingMonster.description || '',
            monsterStatBlock,
            '# Stat Block'
          );

          await client.characters.update(existingMonster.id, {
            character_name: detectedMonster.name,
            description: mergedDescription,
            image: detectedMonster.imageUrl,
          });
          showStatus(syncResult, `Updated "${detectedMonster.name}" in Archivist!`, 'success');
        } else {
          const created = await client.characters.create({
            campaign_id: selectedCampaignId,
            character_name: detectedMonster.name,
            type: 'NPC',
            description: monsterStatBlock,
            image: detectedMonster.imageUrl,
          });
          existingMonster = created;
          showStatus(syncResult, `Imported "${detectedMonster.name}" into Archivist!`, 'success');
        }
      } else if (detectedType === 'item' && detectedItem) {
        const itemDetailsSection = formatItemDetails(detectedItem, activeTabUrl);

        if (existingItem) {
          const mergedDescription = mergeStatBlockIntoDescription(
            existingItem.description || '',
            itemDetailsSection,
            '# Item Details'
          );

          await client.items.update(existingItem.id, {
            name: detectedItem.name,
            type: detectedItem.type,
            description: mergedDescription,
            image: detectedItem.image,
          });
          showStatus(syncResult, `Updated "${detectedItem.name}" in Archivist!`, 'success');
        } else {
          const created = await client.items.create({
            campaign_id: selectedCampaignId,
            name: detectedItem.name,
            type: detectedItem.type,
            description: itemDetailsSection,
            image: detectedItem.image,
          });
          existingItem = created;
          showStatus(syncResult, `Imported "${detectedItem.name}" into Archivist!`, 'success');
        }
      }

      await checkExistingEntityInCampaign();
    } catch (err: any) {
      console.error('Sync failed:', err);
      showStatus(syncResult, `Sync failed: ${err.message}`, 'error');
    } finally {
      syncBtn.disabled = false;
      syncSpinner.style.display = 'none';
    }
  });

  // 8. Update D&D Beyond Backstory from Archivist (stripping # Stat Block)
  updateBackstoryBtn.addEventListener('click', async () => {
    if (!existingCharacter) return;

    // Extract user notes, excluding # Stat Block and the divider URL
    let backstory = extractUserNotesFromDescription(existingCharacter.description || '');
    if (!backstory) {
      backstory = existingCharacter.backstory || '';
    }

    if (!backstory) {
      showStatus(syncResult, 'No custom notes/backstory found in Archivist for this character.', 'error');
      return;
    }

    updateBackstoryBtn.disabled = true;
    updateBackstorySpinner.style.display = 'inline-block';
    hideStatus(syncResult);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active D&D Beyond tab found.');

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'UPDATE_BACKSTORY',
        backstory,
      });

      if (response?.success) {
        showStatus(syncResult, response.message || '✨ Backstory updated on D&D Beyond!', 'success');
      } else {
        showStatus(syncResult, response?.message || '📋 Backstory copied to clipboard! (Open Notes tab to paste)', 'success');
      }
    } catch (err: any) {
      // If message delivery fails, copy directly to clipboard
      await navigator.clipboard.writeText(backstory).catch(() => {});
      showStatus(syncResult, '📋 Backstory copied to clipboard! Paste it into the Backstory field on your sheet.', 'success');
    } finally {
      updateBackstoryBtn.disabled = false;
      updateBackstorySpinner.style.display = 'none';
    }
  });

  function showStatus(el: HTMLElement, msg: string, type: 'success' | 'error') {
    el.className = `status-msg ${type}`;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideStatus(el: HTMLElement) {
    el.className = 'status-msg hidden';
    el.textContent = '';
  }
});
