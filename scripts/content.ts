import { ArchivistClient, Character, Item } from '@astermoe/archivist-sdk';
import {
  extractCharacterId,
  fetchCharacterById,
  extractMonsterId,
  fetchMonsterById,
  parseMonsterDom,
  extractItemId,
  fetchItemTooltipJson,
  parseItemDom,
} from '@astermoe/dndbeyond-parser';
import {
  isEligibleMagicItem,
  formatCharacterStatBlock,
  formatMonsterStatBlock,
  formatItemDetails,
  mergeStatBlockIntoDescription,
  extractUserNotesFromDescription,
  isLowResThumbnail,
} from '../src/utils/sync-helpers';

(() => {
  // Prevent duplicate execution
  if ((window as any).__DNDBEYOND_ARCHIVIST_SYNC_LOADED__) return;
  (window as any).__DNDBEYOND_ARCHIVIST_SYNC_LOADED__ = true;

  // 1. Inject Styles
  function injectStyles() {
    if (document.getElementById('archivist-sync-injected-styles')) return;
    const style = document.createElement('style');
    style.id = 'archivist-sync-injected-styles';
    style.textContent = `
      .archivist-widget-container {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: 12px;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        vertical-align: middle;
      }
      .archivist-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none !important;
        box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 100;
      }
      .archivist-action-btn:hover {
        filter: brightness(1.15);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.5);
      }
      .archivist-action-btn:active {
        transform: translateY(0);
      }
      .archivist-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(28, 25, 48, 0.85);
        color: #c084fc !important;
        border: 1px solid rgba(124, 58, 237, 0.4);
        border-radius: 8px;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none !important;
        transition: all 0.2s ease;
      }
      .archivist-link-btn:hover {
        background: rgba(124, 58, 237, 0.25);
        border-color: rgba(124, 58, 237, 0.8);
        color: #f8fafc !important;
      }
      .archivist-inline-import-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(124, 58, 237, 0.15);
        color: #c084fc;
        border: 1px solid rgba(124, 58, 237, 0.4);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        margin: 6px 0;
        transition: all 0.2s ease;
      }
      .archivist-inline-import-btn:hover {
        background: rgba(124, 58, 237, 0.3);
        border-color: rgba(124, 58, 237, 0.7);
        color: #ffffff;
      }
      #archivist-toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      .archivist-toast {
        background: #1e113b;
        color: #f8fafc;
        border: 1px solid #7c3aed;
        border-radius: 10px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 500;
        font-family: 'Outfit', sans-serif, system-ui;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 0 10px rgba(124, 58, 237, 0.4);
        pointer-events: auto;
        animation: archivistSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transition: opacity 0.3s ease, transform 0.3s ease;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 380px;
      }
      .archivist-toast.archivist-toast-success {
        border-color: #10b981;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 0 10px rgba(16, 185, 129, 0.4);
      }
      .archivist-toast.archivist-toast-error {
        border-color: #ef4444;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 0 10px rgba(239, 68, 68, 0.4);
      }
      .archivist-toast-fade {
        opacity: 0;
        transform: translateY(10px);
      }
      @keyframes archivistSlideIn {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  // 2. Toast System
  function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
    let container = document.getElementById('archivist-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'archivist-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `archivist-toast archivist-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('archivist-toast-fade');
      setTimeout(() => toast.remove(), 350);
    }, 4000);
  }

  // 3. React Input Value Setter
  function setReactInputValue(input: HTMLTextAreaElement | HTMLInputElement, value: string) {
    const proto = input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 4. Header Sync Widget & Cross-Reference Link Injection
  async function checkAndInjectHeaderWidget() {
    if (document.getElementById('archivist-header-widget')) return;

    const url = window.location.href;
    const charId = extractCharacterId(url);
    const monsterId = extractMonsterId(url);
    const itemId = extractItemId(url);

    if (!charId && !monsterId && !itemId && !url.includes('/monsters/')) return;

    // Search for suitable header container
    const headerContainer =
      document.querySelector('.ct-character-header-desktop__actions') ||
      document.querySelector('.ct-character-sheet-desktop__header') ||
      document.querySelector('.ct-character-header-desktop') ||
      document.querySelector('.mon-stat-block-2024__header, .mon-stat-block__header') ||
      document.querySelector('.page-header__actions') ||
      document.querySelector('.p-article-header__actions') ||
      document.querySelector('.page-header') ||
      document.querySelector('.item-details-header');

    if (!headerContainer) return;

    // Create Widget
    const widget = document.createElement('div');
    widget.id = 'archivist-header-widget';
    widget.className = 'archivist-widget-container';

    // Sync Button
    const syncBtn = document.createElement('button');
    syncBtn.className = 'archivist-action-btn';
    syncBtn.innerHTML = '<span>🔮</span><span>Archivist Sync</span>';
    syncBtn.title = 'Sync with your Archivist Campaign';
    syncBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleHeaderSyncClick(syncBtn);
    });
    widget.appendChild(syncBtn);

    // Cross-Reference Link placeholder
    const linkAnchor = document.createElement('a');
    linkAnchor.id = 'archivist-cross-ref-link';
    linkAnchor.className = 'archivist-link-btn';
    linkAnchor.target = '_blank';
    linkAnchor.rel = 'noopener noreferrer';
    linkAnchor.style.display = 'none';
    linkAnchor.innerHTML = '<span>Archivist</span> <span>↗</span>';
    widget.appendChild(linkAnchor);

    headerContainer.appendChild(widget);

    // Initial check for existing cross-reference link
    updateCrossReferenceLink();
  }

  async function updateCrossReferenceLink() {
    try {
      const stored = await chrome.storage.sync.get(['archivistApiKey', 'selectedCampaignId']);
      if (!stored.archivistApiKey || !stored.selectedCampaignId) return;

      const client = new ArchivistClient({ apiKey: stored.archivistApiKey });
      const url = window.location.href;
      const charId = extractCharacterId(url);
      const monsterId = extractMonsterId(url);
      const itemId = extractItemId(url);

      const linkAnchor = document.getElementById('archivist-cross-ref-link') as HTMLAnchorElement;
      if (!linkAnchor) return;

      if (url.includes('/characters/')) {
        const charId = extractCharacterId(url);
        if (!charId) return;
        const char = await fetchCharacterById(charId);
        const { data: charList } = (await client.characters.list({
          campaign_id: stored.selectedCampaignId,
          size: 100,
        })) as { data: Character[] };

        const matched = charList.find(
          (c) =>
            c.character_name.toLowerCase() === char.name.toLowerCase() ||
            c.character_aliases?.some((a) => a.toLowerCase() === char.name.toLowerCase())
        );

        if (matched) {
          linkAnchor.href = `https://myarchivist.ai/campaigns/${stored.selectedCampaignId}/characters/${matched.id}`;
          linkAnchor.title = `View ${matched.character_name} in Archivist`;
          linkAnchor.style.display = 'inline-flex';
        }
      } else if (url.includes('/monsters/')) {
        let monsterName = '';
        if (monsterId) {
          try {
            const m = await fetchMonsterById(monsterId);
            monsterName = m.name;
          } catch {
            monsterName = parseMonsterDom(document).name;
          }
        } else {
          monsterName = parseMonsterDom(document).name;
        }

        const { data: charList } = (await client.characters.list({
          campaign_id: stored.selectedCampaignId,
          size: 100,
        })) as { data: Character[] };

        const matched = charList.find(
          (c) =>
            c.character_name.toLowerCase() === monsterName.toLowerCase() ||
            c.character_aliases?.some((a) => a.toLowerCase() === monsterName.toLowerCase())
        );

        if (matched) {
          linkAnchor.href = `https://myarchivist.ai/campaigns/${stored.selectedCampaignId}/characters/${matched.id}`;
          linkAnchor.title = `View ${matched.character_name} in Archivist`;
          linkAnchor.style.display = 'inline-flex';
        }
      } else if (url.includes('/magic-items/') || url.includes('/equipment/')) {
        let item: ItemData;
        try {
          item = parseItemDom(document);
        } catch {
          item = itemId && url.includes('magic-items')
            ? await fetchItemTooltipJson(itemId, { isMagicItem: true })
            : parseItemDom(document);
        }

        const { data: itemList } = (await client.items.list({
          campaign_id: stored.selectedCampaignId,
          size: 100,
        })) as { data: Item[] };

        const matched = itemList.find(
          (i) =>
            i.name.toLowerCase() === item.name.toLowerCase() ||
            i.aliases?.some((a) => a.toLowerCase() === item.name.toLowerCase())
        );

        if (matched) {
          linkAnchor.href = `https://myarchivist.ai/campaigns/${stored.selectedCampaignId}/items/${matched.id}`;
          linkAnchor.title = `View ${matched.name} in Archivist`;
          linkAnchor.style.display = 'inline-flex';
        }
      }
    } catch {
      // Quietly ignore background cross-reference lookup failures
    }
  }

  // 5. In-Page Sync Handler
  async function handleHeaderSyncClick(btn: HTMLButtonElement) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span><span>Syncing...</span>';
    btn.disabled = true;

    try {
      const stored = await chrome.storage.sync.get(['archivistApiKey', 'selectedCampaignId']);
      if (!stored.archivistApiKey || !stored.selectedCampaignId) {
        showToast('⚠️ Please configure your API key in the Archivist Sync extension popup.', 'error');
        return;
      }

      const client = new ArchivistClient({ apiKey: stored.archivistApiKey });
      const url = window.location.href;
      const charId = extractCharacterId(url);
      const monsterId = extractMonsterId(url);
      const itemId = extractItemId(url);

      if (url.includes('/characters/')) {
        const charId = extractCharacterId(url);
        if (!charId) return;
        showToast('🔮 Fetching character from D&D Beyond...', 'info');
        const char = await fetchCharacterById(charId);

        const { data: charList } = (await client.characters.list({
          campaign_id: stored.selectedCampaignId,
          size: 100,
        })) as { data: Character[] };

        const existing = charList.find(
          (c) =>
            c.character_name.toLowerCase() === char.name.toLowerCase() ||
            c.character_aliases?.some((a) => a.toLowerCase() === char.name.toLowerCase())
        );

        const statBlockSection = formatCharacterStatBlock(char, url);

        if (existing) {
          const fresh = await client.characters.get(existing.id, { with_links: true });
          const mergedDescription = mergeStatBlockIntoDescription(
            fresh.description || '',
            statBlockSection,
            '### Stat Block'
          );

          const updateCharPayload: any = {
            character_name: char.name,
            description: mergedDescription,
            backstory: char.bio.backstory || char.bio.appearance,
          };
          if ((!existing.image || isLowResThumbnail(existing.image)) && char.avatarUrl) {
            updateCharPayload.image = char.avatarUrl;
          }
          await client.characters.update(existing.id, updateCharPayload);
          showToast(`✅ Synced "${char.name}" to Archivist!`, 'success');
        } else {
          await client.characters.create({
            campaign_id: stored.selectedCampaignId,
            character_name: char.name,
            type: 'PC',
            description: statBlockSection,
            backstory: char.bio.backstory || char.bio.appearance,
            image: char.avatarUrl,
          });
          showToast(`✅ Imported "${char.name}" into Archivist!`, 'success');
        }
        await updateCrossReferenceLink();
      } else if (url.includes('/monsters/')) {
        showToast('🔮 Fetching monster stat block...', 'info');
        let monster;
        if (monsterId) {
          try {
            monster = await fetchMonsterById(monsterId);
          } catch {
            monster = parseMonsterDom(document);
          }
        } else {
          monster = parseMonsterDom(document);
        }

        const { data: charList } = (await client.characters.list({
          campaign_id: stored.selectedCampaignId,
          size: 100,
        })) as { data: Character[] };

        const existing = charList.find(
          (c) =>
            c.character_name.toLowerCase() === monster.name.toLowerCase() ||
            c.character_aliases?.some((a) => a.toLowerCase() === monster.name.toLowerCase())
        );

        const monsterStatBlock = formatMonsterStatBlock(monster, url);

        if (existing) {
          const fresh = await client.characters.get(existing.id, { with_links: true });
          const mergedDescription = mergeStatBlockIntoDescription(
            fresh.description || '',
            monsterStatBlock,
            '### Stat Block'
          );

          const updateMonPayload: any = {
            character_name: monster.name,
            description: mergedDescription,
          };
          if (!existing.image && monster.imageUrl) {
            updateMonPayload.image = monster.imageUrl;
          }
          await client.characters.update(existing.id, updateMonPayload);
          showToast(`✅ Synced "${monster.name}" to Archivist!`, 'success');
        } else {
          await client.characters.create({
            campaign_id: stored.selectedCampaignId,
            character_name: monster.name,
            type: 'NPC',
            description: monsterStatBlock,
            image: monster.imageUrl,
          });
          showToast(`✅ Imported "${monster.name}" into Archivist!`, 'success');
        }
        await updateCrossReferenceLink();
      } else if (itemId || url.includes('magic-items') || url.includes('equipment')) {
        showToast('🔮 Fetching item from D&D Beyond...', 'info');
        let item: ItemData;
        try {
          item = parseItemDom(document);
        } catch {
          item = itemId && url.includes('magic-items')
            ? await fetchItemTooltipJson(itemId, { isMagicItem: true })
            : parseItemDom(document);
        }

        const { data: itemList } = (await client.items.list({
          campaign_id: stored.selectedCampaignId,
          size: 100,
        })) as { data: Item[] };

        const existing = itemList.find(
          (i) =>
            i.name.toLowerCase() === item.name.toLowerCase() ||
            i.aliases?.some((a) => a.toLowerCase() === item.name.toLowerCase())
        );

        const itemDetailsSection = formatItemDetails(item, url);

        if (existing) {
          const fresh = await client.items.get(existing.id, { with_links: true });
          const mergedDesc = mergeStatBlockIntoDescription(
            fresh.description || '',
            itemDetailsSection,
            '### Item Details'
          );
          const updateItemPayload: any = {
            name: item.name,
            type: item.type,
            description: mergedDesc,
          };
          if ((!existing.image || isLowResThumbnail(existing.image)) && item.image) {
            updateItemPayload.image = item.image;
          }
          await client.items.update(existing.id, updateItemPayload);
          showToast(`✅ Synced "${item.name}" to Archivist!`, 'success');
        } else {
          await client.items.create({
            campaign_id: stored.selectedCampaignId,
            name: item.name,
            type: item.type,
            description: itemDetailsSection,
            image: item.image,
          });
          showToast(`✅ Imported "${item.name}" into Archivist!`, 'success');
        }
        await updateCrossReferenceLink();
      }
    } catch (err: any) {
      console.error('In-page sync error:', err);
      showToast(`❌ Sync error: ${err.message}`, 'error');
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  // 6. In-Page Backstory Import Button (in Notes pane/sidebar or Character Builder)
  function checkAndInjectBackstoryHelper() {
    if (document.getElementById('archivist-backstory-btn')) return;

    // Look for Notes pane / Backstory container
    const textarea = (document.querySelector('textarea.ct-note-pane__textarea') ||
      document.querySelector('textarea[name="backstory"]') ||
      document.querySelector('textarea[name="notes.backstory"]') ||
      document.querySelector('.ct-note-pane textarea') ||
      document.querySelector('.ct-sidebar textarea')) as HTMLTextAreaElement | null;

    if (!textarea) return;

    const btn = document.createElement('button');
    btn.id = 'archivist-backstory-btn';
    btn.className = 'archivist-inline-import-btn';
    btn.type = 'button';
    btn.innerHTML = '<span>🔮</span><span>Import Backstory from Archivist</span>';
    btn.title = 'Fetch backstory/notes from your Archivist campaign and insert here';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await handleInlineBackstoryImport(textarea);
    });

    textarea.parentElement?.insertBefore(btn, textarea);
  }

  async function handleInlineBackstoryImport(textarea: HTMLTextAreaElement) {
    try {
      const stored = await chrome.storage.sync.get(['archivistApiKey', 'selectedCampaignId']);
      if (!stored.archivistApiKey || !stored.selectedCampaignId) {
        showToast('⚠️ Please configure your Archivist API key in the extension popup.', 'error');
        return;
      }

      const client = new ArchivistClient({ apiKey: stored.archivistApiKey });
      const charId = extractCharacterId(window.location.href);
      if (!charId) return;

      showToast('🔮 Fetching backstory from Archivist...', 'info');
      const char = await fetchCharacterById(charId);

      const { data: charList } = (await client.characters.list({
        campaign_id: stored.selectedCampaignId,
        size: 100,
        with_links: true,
      })) as { data: Character[] };

      const matched = charList.find(
        (c) =>
          c.character_name.toLowerCase() === char.name.toLowerCase() ||
          c.character_aliases?.some((a) => a.toLowerCase() === char.name.toLowerCase())
      );

      if (!matched) {
        showToast(`No matching character "${char.name}" found in this Archivist campaign.`, 'error');
        return;
      }

      // Extract only user notes/lore, stripping # Stat Block and DDB URL divider
      let userNotes = extractUserNotesFromDescription(matched.description || '', '### Stat Block');
      if (!userNotes) {
        userNotes = matched.backstory || '';
      }

      if (!userNotes) {
        showToast('The character in Archivist does not have any custom notes or backstory yet.', 'error');
        return;
      }

      // Populate textarea using React setter
      setReactInputValue(textarea, userNotes);
      await navigator.clipboard.writeText(userNotes).catch(() => {});
      showToast('✨ Backstory updated from Archivist!', 'success');
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`, 'error');
    }
  }

  // 7. Message Listener (from Popup actions)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'UPDATE_BACKSTORY') {
      const backstory = message.backstory;

      // 1. Always copy to clipboard as guaranteed fallback
      navigator.clipboard.writeText(backstory).catch(() => {});

      // 2. Try to find open textarea directly
      let textarea = (document.querySelector('textarea.ct-note-pane__textarea') ||
        document.querySelector('textarea[name="backstory"]') ||
        document.querySelector('textarea[name="notes.backstory"]') ||
        document.querySelector('.ct-note-pane textarea') ||
        document.querySelector('.ct-sidebar textarea')) as HTMLTextAreaElement | null;

      if (textarea) {
        setReactInputValue(textarea, backstory);
        showToast('✨ Backstory updated from Archivist!', 'success');
        sendResponse({ success: true, message: 'Backstory updated directly in D&D Beyond editor!' });
        return true;
      }

      // 3. Try clicking Notes tab to open it
      const tabs = Array.from(document.querySelectorAll('.ct-primary-box__tab, button, a'));
      const notesTab = tabs.find((el) => el.textContent?.trim().toLowerCase() === 'notes') as HTMLElement | null;

      if (notesTab) {
        notesTab.click();
        setTimeout(() => {
          // Look for backstory button or section to click
          const items = Array.from(document.querySelectorAll('.ct-notes__item, .ct-notes__section, div, span'));
          const backstoryItem = items.find((el) => el.textContent?.trim().toLowerCase() === 'backstory') as HTMLElement | null;
          if (backstoryItem) backstoryItem.click();

          setTimeout(() => {
            textarea = (document.querySelector('textarea.ct-note-pane__textarea') ||
              document.querySelector('textarea[name="backstory"]') ||
              document.querySelector('.ct-note-pane textarea') ||
              document.querySelector('.ct-sidebar textarea')) as HTMLTextAreaElement | null;

            if (textarea) {
              setReactInputValue(textarea, backstory);
              showToast('✨ Backstory updated from Archivist!', 'success');
              sendResponse({ success: true, message: 'Opened Notes pane and updated backstory!' });
            } else {
              showToast('📋 Backstory copied to clipboard (paste into Backstory field)!', 'info');
              sendResponse({ success: true, message: 'Backstory copied to clipboard! Open the Backstory field to paste.' });
            }
          }, 350);
        }, 250);
        return true;
      }

      showToast('📋 Backstory copied to clipboard (paste into Backstory field)!', 'info');
      sendResponse({ success: true, message: 'Backstory copied to clipboard! Paste it into your D&D Beyond Backstory field.' });
      return true;
    }
  });

  // 8. Lifecycle & Mutation Observer
  injectStyles();
  checkAndInjectHeaderWidget();
  checkAndInjectBackstoryHelper();

  const observer = new MutationObserver(() => {
    checkAndInjectHeaderWidget();
    checkAndInjectBackstoryHelper();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
