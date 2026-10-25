import { ArchivistClient, Campaign, Character, Item } from '@astermoe/archivist-sdk';
import {
  fetchCharacterById,
  extractCharacterId,
  fetchItemTooltipJson,
  extractItemId,
  parseItemDom,
  CharacterData,
  ItemData,
} from '@astermoe/dndbeyond-parser';

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
  const itemImportOptions = document.getElementById('item-import-options') as HTMLElement;
  const syncInventoryItems = document.getElementById('sync-inventory-items') as HTMLInputElement;

  const syncBtn = document.getElementById('sync-btn') as HTMLButtonElement;
  const syncBtnText = document.getElementById('sync-btn-text') as HTMLElement;
  const syncSpinner = document.getElementById('sync-spinner') as HTMLElement;
  const syncResult = document.getElementById('sync-result') as HTMLElement;

  let client: ArchivistClient | null = null;
  let activeTabUrl = '';
  let campaigns: Campaign[] = [];
  let selectedCampaignId = '';
  let detectedType: 'character' | 'item' | null = null;
  let detectedChar: CharacterData | null = null;
  let detectedItem: ItemData | null = null;
  let existingCharacter: Character | null = null;
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

  // 4. Campaign change listener
  campaignSelect.addEventListener('change', () => {
    selectedCampaignId = campaignSelect.value;
    chrome.storage.sync.set({ selectedCampaignId });
    if (detectedType) {
      checkExistingEntityInCampaign();
    }
  });

  // 5. Inspect Active D&D Beyond Tab
  async function inspectCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setEntityState('error', 'Cannot access active tab', '—');
        return;
      }
      activeTabUrl = tab.url;

      if (activeTabUrl.includes('dndbeyond.com/characters/')) {
        detectedType = 'character';
        const charId = extractCharacterId(activeTabUrl);
        setEntityState('ready', 'Fetching Character Sheet...', `ID: ${charId}`);

        try {
          detectedChar = await fetchCharacterById(charId);
          setEntityState('ready', 'Character Detected', detectedChar.name);
          entityMeta.textContent = `Level ${detectedChar.totalLevel} ${detectedChar.species} ${detectedChar.classLine}`;
          itemImportOptions.classList.remove('hidden');
          await checkExistingEntityInCampaign();
        } catch (err: any) {
          setEntityState('error', 'Failed to fetch character', err.message);
        }
      } else if (activeTabUrl.includes('dndbeyond.com/magic-items/') || activeTabUrl.includes('dndbeyond.com/equipment/')) {
        detectedType = 'item';
        const itemId = extractItemId(activeTabUrl);
        setEntityState('ready', 'Fetching Item...', itemId ? `ID: ${itemId}` : 'Item Page');

        try {
          if (itemId) {
            detectedItem = await fetchItemTooltipJson(itemId, { isMagicItem: activeTabUrl.includes('magic-items') });
          } else {
            detectedItem = parseItemDom(document);
          }
          setEntityState('ready', 'Item Detected', detectedItem.name);
          entityMeta.textContent = `${detectedItem.type}${detectedItem.rarity ? `, ${detectedItem.rarity}` : ''}`;
          itemImportOptions.classList.add('hidden');
          await checkExistingEntityInCampaign();
        } catch (err: any) {
          setEntityState('error', 'Failed to fetch item', err.message);
        }
      } else {
        detectedType = null;
        setEntityState('error', 'Page Not Supported', 'Navigate to a Character or Item');
        entityMeta.textContent = 'Open a D&D Beyond character sheet or magic item page to sync.';
        syncBtn.disabled = true;
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
        } else {
          statusDot.className = 'status-dot ready';
          entityStatusLabel.textContent = 'New Character (Ready to Import)';
          syncBtnText.textContent = 'Import Character to Archivist';
        }
        syncBtn.disabled = false;
        syncBtn.classList.remove('disabled');
      } catch (err) {
        console.error('Error listing campaign characters:', err);
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
        } else {
          statusDot.className = 'status-dot ready';
          entityStatusLabel.textContent = 'New Item (Ready to Import)';
          syncBtnText.textContent = 'Import Item to Archivist';
        }
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
        // Build rich markdown description for Archivist
        const abilitySummary = `| STR | DEX | CON | INT | WIS | CHA |\n| :---: | :---: | :---: | :---: | :---: | :---: |\n| ${detectedChar.abilities.strength.score} | ${detectedChar.abilities.dexterity.score} | ${detectedChar.abilities.constitution.score} | ${detectedChar.abilities.intelligence.score} | ${detectedChar.abilities.wisdom.score} | ${detectedChar.abilities.charisma.score} |`;
        const description = `**Level ${detectedChar.totalLevel} ${detectedChar.species} ${detectedChar.classLine}**\n\n- **AC:** ${detectedChar.ac.value} | **HP:** ${detectedChar.hp.value}/${detectedChar.hp.max} | **Speed:** ${detectedChar.speed}\n- **Senses:** ${detectedChar.senses.join(', ')}\n- **Languages:** ${detectedChar.languages.join(', ')}\n\n### Ability Scores\n${abilitySummary}`;

        if (existingCharacter) {
          await client.characters.update(existingCharacter.id, {
            character_name: detectedChar.name,
            description,
            backstory: detectedChar.bio.backstory || detectedChar.bio.appearance,
            image: detectedChar.avatarUrl,
          });
          showStatus(syncResult, `Updated "${detectedChar.name}" in Archivist!`, 'success');
        } else {
          const created = await client.characters.create({
            campaign_id: selectedCampaignId,
            character_name: detectedChar.name,
            type: 'PC',
            description,
            backstory: detectedChar.bio.backstory || detectedChar.bio.appearance,
            image: detectedChar.avatarUrl,
          });
          existingCharacter = created;
          showStatus(syncResult, `Imported "${detectedChar.name}" into Archivist!`, 'success');
        }

        // Optional: Import equipped magic items
        if (syncInventoryItems.checked && detectedChar.inventory.length > 0) {
          const magicItems = detectedChar.inventory.filter((item) => item.equipped || item.rarity);
          for (const item of magicItems) {
            try {
              await client.items.create({
                campaign_id: selectedCampaignId,
                name: item.name,
                type: item.type,
                description: `${item.rarity ? `*${item.rarity}* \n\n` : ''}${item.description}`,
                image: item.image,
              });
            } catch {
              // Ignore duplicate or minor item errors
            }
          }
        }
      } else if (detectedType === 'item' && detectedItem) {
        if (existingItem) {
          await client.items.update(existingItem.id, {
            name: detectedItem.name,
            type: detectedItem.type,
            description: `${detectedItem.rarity ? `*${detectedItem.rarity}* \n\n` : ''}${detectedItem.description}`,
            image: detectedItem.image,
          });
          showStatus(syncResult, `Updated "${detectedItem.name}" in Archivist!`, 'success');
        } else {
          const created = await client.items.create({
            campaign_id: selectedCampaignId,
            name: detectedItem.name,
            type: detectedItem.type,
            description: `${detectedItem.rarity ? `*${detectedItem.rarity}* \n\n` : ''}${detectedItem.description}`,
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
