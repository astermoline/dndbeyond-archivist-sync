import { ArchivistClient, Campaign, Character, Item } from "@astermoe/archivist-sdk";
import {
  extractCharacterId,
  fetchCharacterById,
  extractMonsterId,
  fetchMonsterById,
  parseMonsterDom,
  extractItemId,
  fetchItemTooltipJson,
  parseItemDom,
} from "@astermoe/dndbeyond-parser";
import {
  isEligibleMagicItem,
  formatCharacterStatBlock,
  formatMonsterStatBlock,
  formatItemDetails,
  mergeStatBlockIntoDescription,
  extractUserNotesFromDescription,
  isLowResThumbnail,
  findOrCreateJournalFolder,
  formatCharacterJournalMarkdown,
  syncCharacterJournalEntry,
} from "../src/utils/sync-helpers";

(() => {
  if ((window as any).__ARCHIVES_BEYOND_CONTENT_LOADED__) return;
  (window as any).__ARCHIVES_BEYOND_CONTENT_LOADED__ = true;

  const ICON_URL = chrome.runtime.getURL("icons/icon48.png");

  // State cache
  let cachedCampaigns: Campaign[] = [];
  let matchedEntity: { campaign: Campaign; entity: any; isItem?: boolean } | null = null;
  let isSearching = false;

  // 1. Inject Styles
  function injectStyles() {
    if (document.getElementById("archives-beyond-styles")) return;
    const style = document.createElement("style");
    style.id = "archives-beyond-styles";
    style.textContent = `
      /* --- Unified Quick Actions Floating Dock (Bottom Right) --- */
      #dndbeyond-quick-actions-bar {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 17, 28, 0.94);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(124, 58, 237, 0.45);
        border-radius: 30px;
        padding: 5px 12px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(124, 58, 237, 0.25);
        font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #dndbeyond-quick-actions-bar.minimized {
        padding: 6px;
        border-radius: 50%;
        cursor: pointer;
      }
      #dndbeyond-quick-actions-bar.minimized .bar-content {
        display: none;
      }
      #dndbeyond-quick-actions-bar.minimized:hover {
        transform: scale(1.08);
        box-shadow: 0 0 20px rgba(124, 58, 237, 0.6);
      }
      .bar-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .archives-beyond-group {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .dock-minimize-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 4px;
        transition: color 0.15s ease;
      }
      .dock-minimize-btn:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.1);
      }

      /* --- Action Buttons & Links --- */
      .archives-beyond-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none !important;
        box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
        white-space: nowrap;
      }
      .archives-beyond-btn:hover {
        filter: brightness(1.15);
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(124, 58, 237, 0.55);
      }
      .archives-beyond-btn:active {
        transform: translateY(0);
      }
      .archives-beyond-btn.loading {
        opacity: 0.8;
        pointer-events: none;
      }
      .archives-beyond-btn-icon {
        width: 18px;
        height: 18px;
        object-fit: contain;
        filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.4));
      }
      .archives-beyond-link {
        display: none;
        align-items: center;
        gap: 4px;
        background: rgba(124, 58, 237, 0.18);
        color: #c084fc !important;
        border: 1px solid rgba(124, 58, 237, 0.45);
        border-radius: 20px;
        padding: 5px 11px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none !important;
        transition: all 0.2s ease;
        white-space: nowrap;
      }
      .archives-beyond-link:hover {
        background: rgba(124, 58, 237, 0.35);
        border-color: rgba(124, 58, 237, 0.8);
        color: #ffffff !important;
        box-shadow: 0 0 10px rgba(124, 58, 237, 0.4);
      }

      /* --- Inline Injection Header Widget --- */
      .archives-beyond-inline-container {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: 12px;
        vertical-align: middle;
        font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      /* --- Backstory Helper Button --- */
      .archives-beyond-backstory-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(124, 58, 237, 0.15);
        color: #c084fc;
        border: 1px solid rgba(124, 58, 237, 0.4);
        border-radius: 6px;
        padding: 5px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        margin: 6px 0;
        transition: all 0.2s ease;
      }
      .archives-beyond-backstory-btn:hover {
        background: rgba(124, 58, 237, 0.3);
        border-color: rgba(124, 58, 237, 0.7);
        color: #ffffff;
      }

      /* --- Toast Notifications (Stacked above bottom dock) --- */
      #archives-beyond-toast-container {
        position: fixed;
        bottom: 84px;
        right: 24px;
        z-index: 1000000;
        display: flex;
        flex-direction: column-reverse;
        gap: 10px;
        pointer-events: none;
      }
      .archives-beyond-toast {
        background: #18112e;
        color: #f8fafc;
        border: 1px solid #7c3aed;
        border-radius: 12px;
        padding: 12px 18px;
        font-size: 13px;
        font-weight: 500;
        font-family: "Outfit", sans-serif, system-ui;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 14px rgba(124, 58, 237, 0.4);
        pointer-events: auto;
        animation: abSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transition: opacity 0.3s ease, transform 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 400px;
      }
      .archives-beyond-toast.success {
        border-color: #10b981;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 14px rgba(16, 185, 129, 0.4);
      }
      .archives-beyond-toast.error {
        border-color: #ef4444;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 14px rgba(239, 68, 68, 0.4);
      }
      .archives-beyond-toast-fade {
        opacity: 0;
        transform: translateY(12px);
      }
      @keyframes abSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* --- Campaign Selection Prompt Modal --- */
      .archives-beyond-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000005;
        background: rgba(8, 10, 18, 0.8);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: abFadeIn 0.2s ease-out;
      }
      .archives-beyond-modal-dialog {
        background: #141126;
        border: 1px solid rgba(124, 58, 237, 0.45);
        border-radius: 16px;
        padding: 24px;
        width: 420px;
        max-width: 92vw;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 24px rgba(124, 58, 237, 0.35);
        color: #f8fafc;
        display: flex;
        flex-direction: column;
        gap: 16px;
        animation: abScaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes abFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes abScaleUp {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
      .ab-modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .ab-modal-icon {
        width: 38px;
        height: 38px;
        object-fit: contain;
        filter: drop-shadow(0 0 8px rgba(124, 58, 237, 0.6));
      }
      .ab-modal-title {
        font-size: 18px;
        font-weight: 700;
        color: #ffffff;
        margin: 0;
      }
      .ab-modal-subtitle {
        font-size: 13px;
        color: #94a3b8;
        margin: 2px 0 0 0;
      }
      .ab-modal-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ab-modal-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ab-modal-label {
        font-size: 11px;
        font-weight: 600;
        color: #cbd5e1;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .ab-modal-select {
        background: #0d0b18;
        border: 1px solid rgba(124, 58, 237, 0.4);
        color: #f8fafc;
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        cursor: pointer;
        width: 100%;
        box-sizing: border-box;
      }
      .ab-modal-select:focus {
        border-color: #7c3aed;
        box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.25);
      }
      .ab-modal-checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #cbd5e1;
        cursor: pointer;
        margin-top: 4px;
      }
      .ab-modal-checkbox-label input {
        accent-color: #7c3aed;
        width: 16px;
        height: 16px;
      }
      .ab-modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 6px;
      }
      .ab-modal-btn {
        padding: 8px 18px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .ab-modal-cancel-btn {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #94a3b8;
      }
      .ab-modal-cancel-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f8fafc;
      }
      .ab-modal-confirm-btn {
        background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
        color: #ffffff;
        border: none;
        box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
      }
      .ab-modal-confirm-btn:hover {
        filter: brightness(1.15);
        box-shadow: 0 6px 16px rgba(124, 58, 237, 0.5);
      }
    `;
    document.head.appendChild(style);
  }

  // 2. Toast System
  function showToast(message: string, type: "info" | "success" | "error" = "info") {
    let container = document.getElementById("archives-beyond-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "archives-beyond-toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `archives-beyond-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("archives-beyond-toast-fade");
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  // 3. React Input Value Setter
  function setReactInputValue(input: HTMLTextAreaElement | HTMLInputElement, value: string) {
    const proto = input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 4. Ensure Shared Floating Actions Dock (Bottom Right)
  function getOrCreateFloatingDock(): HTMLElement {
    let dock = document.getElementById("dndbeyond-quick-actions-bar");
    if (!dock) {
      dock = document.createElement("div");
      dock.id = "dndbeyond-quick-actions-bar";

      // Minimized icon preview
      const minIcon = document.createElement("img");
      minIcon.src = ICON_URL;
      minIcon.className = "archives-beyond-btn-icon dock-min-icon";
      minIcon.style.display = "none";
      dock.appendChild(minIcon);

      const content = document.createElement("div");
      content.className = "bar-content";
      dock.appendChild(content);

      // Minimize toggle
      const minBtn = document.createElement("button");
      minBtn.className = "dock-minimize-btn";
      minBtn.innerHTML = "&minus;";
      minBtn.title = "Minimize quick actions";
      minBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dock!.classList.toggle("minimized");
        const isMin = dock!.classList.contains("minimized");
        minIcon.style.display = isMin ? "block" : "none";
      });
      dock.appendChild(minBtn);

      dock.addEventListener("click", () => {
        if (dock!.classList.contains("minimized")) {
          dock!.classList.remove("minimized");
          minIcon.style.display = "none";
        }
      });

      document.body.appendChild(dock);
    }
    return dock.querySelector(".bar-content") || dock;
  }

  function getDndBeyondEntity(rawUrl: string = window.location.href): { type: "character" | "monster" | "item"; idOrSlug: string } | null {
    try {
      const parsed = new URL(rawUrl);
      if (!parsed.hostname.includes("dndbeyond.com")) return null;

      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;

      const section = segments[0].toLowerCase();
      const subpath = segments[1];

      if (section === "characters") {
        if (/^\d+$/.test(subpath)) return { type: "character", idOrSlug: subpath };
        return null;
      }

      if (section === "monsters") {
        if (subpath) return { type: "monster", idOrSlug: subpath };
        return null;
      }

      if (section === "magic-items" || section === "equipment") {
        if (subpath) return { type: "item", idOrSlug: subpath };
        return null;
      }

      return null;
    } catch {
      return null;
    }
  }

  function cleanUpDockIfEmpty() {
    const dock = document.getElementById("dndbeyond-quick-actions-bar");
    if (dock) {
      const barContent = dock.querySelector(".bar-content");
      if (!barContent || barContent.children.length === 0) {
        dock.remove();
      }
    }
  }

  function removeInjectedElements() {
    const group = document.getElementById("archives-beyond-dock-group");
    if (group) group.remove();

    const inline = document.getElementById("archives-beyond-inline-container");
    if (inline) inline.remove();

    const backstoryBtn = document.getElementById("archives-beyond-backstory-btn");
    if (backstoryBtn) backstoryBtn.remove();

    cleanUpDockIfEmpty();
  }

  // 5. Inject Floating Button for Archives Beyond
  function injectFloatingAction() {
    const entity = getDndBeyondEntity();
    if (!entity) return;

    if (document.getElementById("archives-beyond-dock-group")) return;

    const dockContent = getOrCreateFloatingDock();

    const group = document.createElement("div");
    group.id = "archives-beyond-dock-group";
    group.className = "archives-beyond-group";

    const btn = document.createElement("button");
    btn.id = "archives-beyond-dock-btn";
    btn.className = "archives-beyond-btn";
    btn.innerHTML = `
      <img src="${ICON_URL}" class="archives-beyond-btn-icon" alt="Archives Beyond" />
      <span class="btn-text">Archives Beyond</span>
    `;
    btn.title = "Sync with your Archivist Campaign via Archives Beyond";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      handleActionClick(btn);
    });
    group.appendChild(btn);

    const link = document.createElement("a");
    link.id = "archives-beyond-dock-link";
    link.className = "archives-beyond-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = "<span>Archivist</span> <span>↗</span>";
    group.appendChild(link);

    dockContent.insertBefore(group, dockContent.firstChild);

    searchAndMatchAllCampaigns();
  }

  // 6. Inject Inline Header Buttons
  function injectInlineHeader() {
    const entity = getDndBeyondEntity();
    if (!entity) return;

    if (document.getElementById("archives-beyond-inline-container")) return;

    let targetContainer: Element | null = null;

    if (entity.type === "character") {
      targetContainer =
        document.querySelector(".ct-character-header-desktop__actions") ||
        document.querySelector(".ct-character-tidbits__name") ||
        document.querySelector(".ct-character-sheet-desktop__header");
    } else if (entity.type === "monster") {
      targetContainer =
        document.querySelector(".page-heading__content") ||
        document.querySelector(".mon-stat-block__name") ||
        document.querySelector(".page-heading");
    } else if (entity.type === "item") {
      targetContainer =
        document.querySelector(".page-heading__content") ||
        document.querySelector(".page-heading") ||
        document.querySelector(".item-details");
    }

    if (!targetContainer) return;

    const container = document.createElement("div");
    container.id = "archives-beyond-inline-container";
    container.className = "archives-beyond-inline-container";

    const btn = document.createElement("button");
    btn.id = "archives-beyond-inline-btn";
    btn.className = "archives-beyond-btn";
    btn.innerHTML = `
      <img src="${ICON_URL}" class="archives-beyond-btn-icon" alt="Archives Beyond" />
      <span class="btn-text">Archives Beyond</span>
    `;
    btn.title = "Sync with your Archivist Campaign";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      handleActionClick(btn);
    });
    container.appendChild(btn);

    const link = document.createElement("a");
    link.id = "archives-beyond-inline-link";
    link.className = "archives-beyond-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = "<span>Archivist</span> <span>↗</span>";
    container.appendChild(link);

    targetContainer.appendChild(container);

    searchAndMatchAllCampaigns();
  }

  // 7. Search Across ALL Campaigns for Matches
  async function searchAndMatchAllCampaigns() {
    const entity = getDndBeyondEntity();
    if (!entity) return;
    if (isSearching) return;
    isSearching = true;

    try {
      const stored = await chrome.storage.sync.get(["archivistApiKey", "selectedCampaignId"]);
      if (!stored.archivistApiKey) {
        updateButtonsUi(null, false);
        return;
      }

      const client = new ArchivistClient({ apiKey: stored.archivistApiKey });
      const url = window.location.href;

      // 1. Fetch all user campaigns
      const { data: camps } = await client.campaigns.list({ size: 100 });
      cachedCampaigns = camps || [];

      if (cachedCampaigns.length === 0) {
        updateButtonsUi(null, false);
        return;
      }

      // 2. Identify entity on current page
      if (url.includes("/characters/")) {
        const charId = extractCharacterId(url);
        if (!charId) return;
        const char = await fetchCharacterById(charId);

        // Search across all campaigns in parallel
        const results = await Promise.all(
          cachedCampaigns.map((c) =>
            client.characters
              .list({ campaign_id: c.id, size: 100 })
              .then((res) => ({ campaign: c, characters: (res.data || []) as Character[] }))
              .catch(() => ({ campaign: c, characters: [] as Character[] }))
          )
        );

        let match: { campaign: Campaign; entity: Character } | null = null;
        for (const res of results) {
          const found = res.characters.find(
            (c) =>
              c.character_name.toLowerCase() === char.name.toLowerCase() ||
              c.character_aliases?.some((a) => a.toLowerCase() === char.name.toLowerCase())
          );
          if (found) {
            match = { campaign: res.campaign, entity: found };
            break;
          }
        }

        matchedEntity = match;
        updateButtonsUi(char.name, !!match, "Character");
      } else if (url.includes("/monsters/")) {
        const monsterId = extractMonsterId(url);
        let monsterName = "";
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

        const results = await Promise.all(
          cachedCampaigns.map((c) =>
            client.characters
              .list({ campaign_id: c.id, size: 100 })
              .then((res) => ({ campaign: c, characters: (res.data || []) as Character[] }))
              .catch(() => ({ campaign: c, characters: [] as Character[] }))
          )
        );

        let match: { campaign: Campaign; entity: Character } | null = null;
        for (const res of results) {
          const found = res.characters.find(
            (c) =>
              c.character_name.toLowerCase() === monsterName.toLowerCase() ||
              c.character_aliases?.some((a) => a.toLowerCase() === monsterName.toLowerCase())
          );
          if (found) {
            match = { campaign: res.campaign, entity: found };
            break;
          }
        }

        matchedEntity = match;
        updateButtonsUi(monsterName, !!match, "Monster");
      } else if (url.includes("/magic-items/") || url.includes("/equipment/")) {
        const itemId = extractItemId(url);
        let item;
        try {
          item = parseItemDom(document);
        } catch {
          item =
            itemId && url.includes("magic-items")
              ? await fetchItemTooltipJson(itemId, { isMagicItem: true })
              : parseItemDom(document);
        }

        const results = await Promise.all(
          cachedCampaigns.map((c) =>
            client.items
              .list({ campaign_id: c.id, size: 100 })
              .then((res) => ({ campaign: c, items: (res.data || []) as Item[] }))
              .catch(() => ({ campaign: c, items: [] as Item[] }))
          )
        );

        let match: { campaign: Campaign; entity: Item; isItem: boolean } | null = null;
        for (const res of results) {
          const found = res.items.find(
            (i) =>
              i.name.toLowerCase() === item.name.toLowerCase() ||
              i.aliases?.some((a) => a.toLowerCase() === item.name.toLowerCase())
          );
          if (found) {
            match = { campaign: res.campaign, entity: found, isItem: true };
            break;
          }
        }

        matchedEntity = match;
        updateButtonsUi(item.name, !!match, "Item");
      }
    } catch (err) {
      console.error("Archives Beyond search error:", err);
    } finally {
      isSearching = false;
    }
  }

  // 8. Update UI Buttons & Links according to Match State
  function updateButtonsUi(entityName: string | null, isMatched: boolean, typeLabel: string = "Entity") {
    const dockLink = document.getElementById("archives-beyond-dock-link") as HTMLAnchorElement | null;
    const inlineLink = document.getElementById("archives-beyond-inline-link") as HTMLAnchorElement | null;
    const dockBtnText = document.querySelector("#archives-beyond-dock-btn .btn-text") as HTMLElement | null;
    const inlineBtnText = document.querySelector("#archives-beyond-inline-btn .btn-text") as HTMLElement | null;
    const dockBtn = document.getElementById("archives-beyond-dock-btn") as HTMLButtonElement | null;
    const inlineBtn = document.getElementById("archives-beyond-inline-btn") as HTMLButtonElement | null;

    if (isMatched && matchedEntity) {
      const camp = matchedEntity.campaign;
      const isItem = matchedEntity.isItem;
      const archivistUrl = isItem
        ? `https://app.myarchivist.ai/compendium/items/${matchedEntity.entity.id}?section=items`
        : `https://app.myarchivist.ai/compendium/characters/${matchedEntity.entity.id}?section=characters`;

      if (dockLink) {
        dockLink.href = archivistUrl;
        dockLink.title = `View in "${camp.title}" on Archivist`;
        dockLink.style.display = "inline-flex";
      }
      if (inlineLink) {
        inlineLink.href = archivistUrl;
        inlineLink.title = `View in "${camp.title}" on Archivist`;
        inlineLink.style.display = "inline-flex";
      }

      const label = `Sync ${typeLabel}`;
      if (dockBtnText) dockBtnText.textContent = label;
      if (inlineBtnText) inlineBtnText.textContent = label;
      if (dockBtn) dockBtn.title = `Sync with "${camp.title}" on Archivist`;
      if (inlineBtn) inlineBtn.title = `Sync with "${camp.title}" on Archivist`;
    } else {
      if (dockLink) dockLink.style.display = "none";
      if (inlineLink) inlineLink.style.display = "none";

      const label = `Import ${typeLabel}`;
      if (dockBtnText) dockBtnText.textContent = label;
      if (inlineBtnText) inlineBtnText.textContent = label;
      if (dockBtn) dockBtn.title = "Import into an Archivist campaign";
      if (inlineBtn) inlineBtn.title = "Import into an Archivist campaign";
    }
  }

  // 9. Campaign Selection Modal Prompt
  function promptCampaignSelection(entityName: string, isChar: boolean): Promise<{ campaignId: string; syncItems: boolean } | null> {
    return new Promise((resolve) => {
      // Remove any existing modal
      const existing = document.getElementById("archives-beyond-modal");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "archives-beyond-modal";
      overlay.className = "archives-beyond-modal-overlay";

      const dialog = document.createElement("div");
      dialog.className = "archives-beyond-modal-dialog";

      // Options html
      const optionsHtml = cachedCampaigns
        .map((c) => `<option value="${c.id}">${c.title} (${c.system || "5e"})</option>`)
        .join("");

      dialog.innerHTML = `
        <div class="ab-modal-header">
          <img src="${ICON_URL}" class="ab-modal-icon" alt="Archives Beyond" />
          <div>
            <h3 class="ab-modal-title">Import to Archivist</h3>
            <p class="ab-modal-subtitle">Select which campaign to import <strong>${entityName}</strong> into:</p>
          </div>
        </div>
        <div class="ab-modal-body">
          <div class="ab-modal-field">
            <label class="ab-modal-label" for="ab-select-campaign">Target Campaign</label>
            <select id="ab-select-campaign" class="ab-modal-select">
              ${optionsHtml}
            </select>
          </div>
          ${
            isChar
              ? `
            <label class="ab-modal-checkbox-label">
              <input type="checkbox" id="ab-modal-sync-items" checked />
              <span>Import equipped magic items to compendium</span>
            </label>
          `
              : ""
          }
        </div>
        <div class="ab-modal-footer">
          <button type="button" class="ab-modal-btn ab-modal-cancel-btn" id="ab-modal-cancel">Cancel</button>
          <button type="button" class="ab-modal-btn ab-modal-confirm-btn" id="ab-modal-confirm">Import</button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Pre-select stored campaign if exists
      chrome.storage.sync.get(["selectedCampaignId"]).then((stored) => {
        if (stored.selectedCampaignId) {
          const select = dialog.querySelector("#ab-select-campaign") as HTMLSelectElement | null;
          if (select && cachedCampaigns.some((c) => c.id === stored.selectedCampaignId)) {
            select.value = stored.selectedCampaignId;
          }
        }
      });

      const cleanup = () => {
        overlay.remove();
      };

      dialog.querySelector("#ab-modal-cancel")?.addEventListener("click", () => {
        cleanup();
        resolve(null);
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });

      dialog.querySelector("#ab-modal-confirm")?.addEventListener("click", () => {
        const select = dialog.querySelector("#ab-select-campaign") as HTMLSelectElement;
        const checkbox = dialog.querySelector("#ab-modal-sync-items") as HTMLInputElement | null;
        const campaignId = select.value;
        const syncItems = checkbox ? checkbox.checked : false;
        cleanup();
        resolve({ campaignId, syncItems });
      });
    });
  }

  // 10. Main Action Click Handler
  async function handleActionClick(button: HTMLButtonElement) {
    const originalText = button.innerHTML;
    button.classList.add("loading");
    button.disabled = true;
    button.innerHTML = `
      <img src="${ICON_URL}" class="archives-beyond-btn-icon" />
      <span>Working...</span>
    `;

    try {
      const stored = await chrome.storage.sync.get(["archivistApiKey", "selectedCampaignId"]);
      if (!stored.archivistApiKey) {
        showToast("⚠️ Click the Archives Beyond extension icon in your browser bar to connect your Archivist account.", "error");
        return;
      }

      const client = new ArchivistClient({ apiKey: stored.archivistApiKey });
      const url = window.location.href;
      const isChar = url.includes("/characters/");
      const isMonster = url.includes("/monsters/");
      const isItem = url.includes("/magic-items/") || url.includes("/equipment/");

      // Ensure campaigns are loaded
      if (cachedCampaigns.length === 0) {
        const { data: camps } = await client.campaigns.list({ size: 100 });
        cachedCampaigns = camps || [];
      }

      if (cachedCampaigns.length === 0) {
        showToast("⚠️ No campaigns found on your Archivist account. Please create one on myarchivist.ai first.", "error");
        return;
      }

      // Determine Target Campaign:
      // If already matched with a campaign, use that campaign.
      // If NOT matched, prompt user to pick from their campaigns!
      let targetCampaignId = matchedEntity?.campaign.id;
      let shouldImportEquippedItems = false;

      if (!targetCampaignId) {
        // Resolve entity name for the prompt
        let entityName = "Entity";
        if (isChar) {
          const charId = extractCharacterId(url);
          if (charId) {
            const char = await fetchCharacterById(charId);
            entityName = char.name;
          }
        } else if (isMonster) {
          const monsterId = extractMonsterId(url);
          entityName = monsterId ? (await fetchMonsterById(monsterId).catch(() => parseMonsterDom(document))).name : parseMonsterDom(document).name;
        } else if (isItem) {
          entityName = parseItemDom(document).name;
        }

        // Show campaign selection prompt
        button.innerHTML = originalText;
        button.classList.remove("loading");
        button.disabled = false;

        const selection = await promptCampaignSelection(entityName, isChar);
        if (!selection) return; // User cancelled prompt

        targetCampaignId = selection.campaignId;
        shouldImportEquippedItems = selection.syncItems;

        // Remember user selection
        await chrome.storage.sync.set({ selectedCampaignId: targetCampaignId });

        // Set loading state again
        button.classList.add("loading");
        button.disabled = true;
        button.innerHTML = `
          <img src="${ICON_URL}" class="archives-beyond-btn-icon" />
          <span>Syncing...</span>
        `;
      }

      const targetCampaign = cachedCampaigns.find((c) => c.id === targetCampaignId) || { id: targetCampaignId, title: "Campaign" } as Campaign;

      // --- Character Sheet ---
      if (isChar) {
        const charId = extractCharacterId(url);
        if (!charId) throw new Error("Could not identify character ID from URL.");

        showToast("🔮 Fetching character details from D&D Beyond...", "info");
        const char = await fetchCharacterById(charId);

        const { data: charList } = (await client.characters.list({
          campaign_id: targetCampaignId,
          size: 100,
          with_links: true,
        })) as { data: Character[] };

        const existing = charList.find(
          (c) =>
            c.character_name.toLowerCase() === char.name.toLowerCase() ||
            c.character_aliases?.some((a) => a.toLowerCase() === char.name.toLowerCase())
        );

        const statBlock = formatCharacterStatBlock(char, url);

        if (existing) {
          const fresh = await client.characters.get(existing.id, { with_links: true });
          const mergedDesc = mergeStatBlockIntoDescription(
            fresh.description || "",
            statBlock,
            "### Stat Block"
          );
          const updatePayload: any = {
            character_name: char.name,
            description: mergedDesc,
          };
          if ((!existing.image || isLowResThumbnail(existing.image)) && char.avatarUrl) {
            updatePayload.image = char.avatarUrl;
          }
          await client.characters.update(existing.id, updatePayload);
          matchedEntity = { campaign: targetCampaign, entity: existing };
        } else {
          const created = await client.characters.create({
            campaign_id: targetCampaignId,
            character_name: char.name,
            character_role: "pc",
            description: statBlock,
            image: char.avatarUrl,
          });
          matchedEntity = { campaign: targetCampaign, entity: created };
        }

        // Full Markdown Character Sheet Journal Sync:
        // Also create/update a journal entry in "Character Sheets" folder with the full markdown character sheet
        try {
          showToast("📖 Syncing full Character Sheet journal...", "info");
          const folderId = await findOrCreateJournalFolder(
            stored.archivistApiKey,
            targetCampaignId,
            "Character Sheets"
          );
          const journalMarkdown = formatCharacterJournalMarkdown(char);
          const journalResult = await syncCharacterJournalEntry(
            stored.archivistApiKey,
            targetCampaignId,
            folderId,
            char.name,
            journalMarkdown
          );
          console.log(`[Archives Beyond] Character Sheet journal ${journalResult.action}:`, journalResult.id);
          showToast(
            `✅ Synced "${char.name}" & Character Sheet journal to ${targetCampaign.title}!`,
            "success"
          );
        } catch (journalErr) {
          console.error("[Archives Beyond] Failed to sync journal entry:", journalErr);
          showToast(`✅ Synced "${char.name}" to ${targetCampaign.title}! (Journal sync had an issue)`, "warning");
        }

        // Optional: Import equipped magic items
        if (shouldImportEquippedItems && char.inventory?.length) {
          try {
            const { data: existingItems } = (await client.items.list({
              campaign_id: targetCampaignId,
              size: 100,
            })) as { data: Item[] };

            for (const invItem of char.inventory) {
              if (invItem.isAttuned || invItem.definition?.rarity) {
                const iName = invItem.definition?.name || invItem.name;
                const iRarity = invItem.definition?.rarity;
                if (!iName || !iRarity) continue;

                const already = existingItems.find((i) => i.name.toLowerCase() === iName.toLowerCase());
                if (!already) {
                  await client.items.create({
                    campaign_id: targetCampaignId,
                    name: iName,
                    type: invItem.definition?.filterType || "Wondrous Item",
                    description: invItem.definition?.description || "",
                    image: invItem.definition?.avatarUrl,
                  });
                }
              }
            }
          } catch (e) {
            console.warn("Item import warning:", e);
          }
        }

        updateButtonsUi(char.name, true, "Character");
        return;
      }

      // --- Monster Stat Block ---
      if (isMonster) {
        showToast("🔮 Fetching monster details...", "info");
        const monsterId = extractMonsterId(url);
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
          campaign_id: targetCampaignId,
          size: 100,
          with_links: true,
        })) as { data: Character[] };

        const existing = charList.find(
          (c) =>
            c.character_name.toLowerCase() === monster.name.toLowerCase() ||
            c.character_aliases?.some((a) => a.toLowerCase() === monster.name.toLowerCase())
        );

        const statBlock = formatMonsterStatBlock(monster, url);

        if (existing) {
          const fresh = await client.characters.get(existing.id, { with_links: true });
          const mergedDesc = mergeStatBlockIntoDescription(
            fresh.description || "",
            statBlock,
            "### Stat Block"
          );
          const updatePayload: any = {
            character_name: monster.name,
            description: mergedDesc,
          };
          if ((!existing.image || isLowResThumbnail(existing.image)) && monster.imageUrl) {
            updatePayload.image = monster.imageUrl;
          }
          await client.characters.update(existing.id, updatePayload);
          matchedEntity = { campaign: targetCampaign, entity: existing };
          showToast(`✅ Synced "${monster.name}" to ${targetCampaign.title}!`, "success");
        } else {
          const created = await client.characters.create({
            campaign_id: targetCampaignId,
            character_name: monster.name,
            character_role: "npc",
            description: statBlock,
            image: monster.imageUrl,
          });
          matchedEntity = { campaign: targetCampaign, entity: created };
          showToast(`✅ Imported "${monster.name}" into ${targetCampaign.title}!`, "success");
        }

        updateButtonsUi(monster.name, true, "Monster");
        return;
      }

      // --- Magic Items / Equipment ---
      if (isItem) {
        showToast("🔮 Reading item details...", "info");
        const itemId = extractItemId(url);
        let item;
        try {
          item = parseItemDom(document);
        } catch {
          item =
            itemId && url.includes("magic-items")
              ? await fetchItemTooltipJson(itemId, { isMagicItem: true })
              : parseItemDom(document);
        }

        if (!isEligibleMagicItem(item)) {
          showToast(`⚠️ "${item.name}" is a mundane item without rarity and was skipped.`, "info");
          return;
        }

        const { data: itemList } = (await client.items.list({
          campaign_id: targetCampaignId,
          size: 100,
          with_links: true,
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
            fresh.description || "",
            itemDetailsSection,
            "### Item Details"
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
          matchedEntity = { campaign: targetCampaign, entity: existing, isItem: true };
          showToast(`✅ Synced "${item.name}" to ${targetCampaign.title}!`, "success");
        } else {
          const created = await client.items.create({
            campaign_id: targetCampaignId,
            name: item.name,
            type: item.type,
            description: itemDetailsSection,
            image: item.image,
          });
          matchedEntity = { campaign: targetCampaign, entity: created, isItem: true };
          showToast(`✅ Imported "${item.name}" into ${targetCampaign.title}!`, "success");
        }

        updateButtonsUi(item.name, true, "Item");
        return;
      }
    } catch (err: any) {
      console.error("Archives Beyond sync error:", err);
      showToast(`❌ Sync error: ${err.message}`, "error");
    } finally {
      button.innerHTML = originalText;
      button.classList.remove("loading");
      button.disabled = false;
    }
  }

  // 11. Backstory Import Helper in Notes pane
  function checkAndInjectBackstoryHelper() {
    const entity = getDndBeyondEntity();
    if (!entity || entity.type !== "character") return;
    if (document.getElementById("archives-beyond-backstory-btn")) return;

    const textarea = (document.querySelector("textarea.ct-note-pane__textarea") ||
      document.querySelector("textarea[name=\"backstory\"]") ||
      document.querySelector("textarea[name=\"notes.backstory\"]") ||
      document.querySelector(".ct-note-pane textarea") ||
      document.querySelector(".ct-sidebar textarea")) as HTMLTextAreaElement | null;

    if (!textarea) return;

    const btn = document.createElement("button");
    btn.id = "archives-beyond-backstory-btn";
    btn.className = "archives-beyond-backstory-btn";
    btn.type = "button";
    btn.innerHTML = `
      <img src="${ICON_URL}" style="width: 16px; height: 16px;" />
      <span>Import Backstory from Archivist</span>
    `;
    btn.title = "Fetch backstory/notes from your Archivist campaign and insert here";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await handleInlineBackstoryImport(textarea);
    });

    textarea.parentElement?.insertBefore(btn, textarea);
  }

  async function handleInlineBackstoryImport(textarea: HTMLTextAreaElement) {
    try {
      const stored = await chrome.storage.sync.get(["archivistApiKey"]);
      if (!stored.archivistApiKey) {
        showToast("⚠️ Please configure your API key in the Archives Beyond extension popup.", "error");
        return;
      }

      const client = new ArchivistClient({ apiKey: stored.archivistApiKey });
      const charId = extractCharacterId(window.location.href);
      if (!charId) return;

      showToast("🔮 Fetching character backstory from Archivist...", "info");
      const char = await fetchCharacterById(charId);

      // Search all campaigns if not already matched
      if (!matchedEntity) {
        if (cachedCampaigns.length === 0) {
          const { data: camps } = await client.campaigns.list({ size: 100 });
          cachedCampaigns = camps || [];
        }

        const results = await Promise.all(
          cachedCampaigns.map((c) =>
            client.characters
              .list({ campaign_id: c.id, size: 100 })
              .then((res) => ({ campaign: c, characters: (res.data || []) as Character[] }))
              .catch(() => ({ campaign: c, characters: [] as Character[] }))
          )
        );

        for (const res of results) {
          const found = res.characters.find(
            (c) =>
              c.character_name.toLowerCase() === char.name.toLowerCase() ||
              c.character_aliases?.some((a) => a.toLowerCase() === char.name.toLowerCase())
          );
          if (found) {
            matchedEntity = { campaign: res.campaign, entity: found };
            break;
          }
        }
      }

      if (!matchedEntity) {
        showToast(`No matching character "${char.name}" found in any of your Archivist campaigns.`, "error");
        return;
      }

      const fresh = await client.characters.get(matchedEntity.entity.id, { with_links: true });

      let userNotes = extractUserNotesFromDescription(fresh.description || "", "### Stat Block");
      if (!userNotes) userNotes = fresh.backstory || "";

      if (!userNotes) {
        showToast("The character in Archivist does not have any custom notes or backstory yet.", "error");
        return;
      }

      setReactInputValue(textarea, userNotes);
      await navigator.clipboard.writeText(userNotes).catch(() => {});
      showToast(`✨ Backstory updated from "${matchedEntity.campaign.title}"!`, "success");
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`, "error");
    }
  }

  // 12. Message Listener from Popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "UPDATE_BACKSTORY") {
      const backstory = message.backstory;
      navigator.clipboard.writeText(backstory).catch(() => {});

      let textarea = (document.querySelector("textarea.ct-note-pane__textarea") ||
        document.querySelector("textarea[name=\"backstory\"]") ||
        document.querySelector("textarea[name=\"notes.backstory\"]") ||
        document.querySelector(".ct-note-pane textarea") ||
        document.querySelector(".ct-sidebar textarea")) as HTMLTextAreaElement | null;

      if (textarea) {
        setReactInputValue(textarea, backstory);
        showToast("✨ Backstory updated directly from Archivist!", "success");
        sendResponse({ success: true, message: "Backstory updated directly in D&D Beyond editor!" });
        return true;
      }

      const tabs = Array.from(document.querySelectorAll(".ct-primary-box__tab, button, a"));
      const notesTab = tabs.find((el) => el.textContent?.trim().toLowerCase() === "notes") as HTMLElement | null;

      if (notesTab) {
        notesTab.click();
        setTimeout(() => {
          const items = Array.from(document.querySelectorAll(".ct-notes__item, .ct-notes__section, div, span"));
          const backstoryItem = items.find((el) => el.textContent?.trim().toLowerCase() === "backstory") as HTMLElement | null;
          if (backstoryItem) backstoryItem.click();

          setTimeout(() => {
            textarea = (document.querySelector("textarea.ct-note-pane__textarea") ||
              document.querySelector("textarea[name=\"backstory\"]") ||
              document.querySelector(".ct-note-pane textarea") ||
              document.querySelector(".ct-sidebar textarea")) as HTMLTextAreaElement | null;

            if (textarea) {
              setReactInputValue(textarea, backstory);
              showToast("✨ Backstory updated directly from Archivist!", "success");
              sendResponse({ success: true, message: "Opened Notes pane and updated backstory!" });
            } else {
              showToast("📋 Backstory copied to clipboard (paste into Backstory field)!", "info");
              sendResponse({ success: true, message: "Backstory copied to clipboard! Open the Backstory field to paste." });
            }
          }, 350);
        }, 250);
        return true;
      }

      showToast("📋 Backstory copied to clipboard (paste into Backstory field)!", "info");
      sendResponse({ success: true, message: "Backstory copied to clipboard! Paste it into your D&D Beyond Backstory field." });
      return true;
    }
  });

  // 13. Initialization and DOM Observer
  function checkAndInjectAll() {
    const entity = getDndBeyondEntity();
    if (!entity) {
      removeInjectedElements();
      return;
    }
    injectFloatingAction();
    injectInlineHeader();
    checkAndInjectBackstoryHelper();
  }

  injectStyles();
  checkAndInjectAll();

  // SPA navigation support
  window.addEventListener("popstate", checkAndInjectAll);
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    const res = origPushState.apply(this, args);
    checkAndInjectAll();
    return res;
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplaceState.apply(this, args);
    checkAndInjectAll();
    return res;
  };

  const observer = new MutationObserver(() => {
    checkAndInjectAll();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
