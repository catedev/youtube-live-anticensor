(() => {
  const marks = new Map(); // message id -> { kind, at }
  const authors = new Map(); // message id -> channel id, for recent messages
  const MAX_AUTHORS = 1000;
  const banned = new Set(); // channel ids banned or timed out
  let statsEl;

  const LABELS = {
    mod: 'removed by moderator',
    ban: 'author banned / timed out',
    self: 'retracted by author',
  };

  function mark(id, kind) {
    // don't downgrade mod marks
    if (marks.get(id)?.kind === 'mod') return;
    marks.set(id, { kind, at: new Date() });
    paint(id);
  }

  function remember(item) {
    const msg = item && Object.values(item)[0];
    if (!msg?.id || !msg.authorExternalChannelId) return;
    authors.set(msg.id, msg.authorExternalChannelId);
    if (authors.size > MAX_AUTHORS) authors.delete(authors.keys().next().value);
  }

  function markAuthor(channelId) {
    banned.add(channelId);
    for (const [id, ch] of authors) {
      if (ch === channelId) mark(id, 'ban');
    }
    for (const el of document.querySelectorAll('yt-live-chat-item-list-renderer #items > [id]')) {
      if (el.data?.authorExternalChannelId === channelId) mark(el.id, 'ban');
    }
  }

  function deletedText(a) {
    return (a.deletedStateMessage?.runs || []).map(r => r.text).join('');
  }

  // Returns true if the action should be dropped.
  function handle(a) {
    if (a.addChatItemAction) {
      remember(a.addChatItemAction.item);
      return false;
    }
    if (a.markChatItemAsDeletedAction) {
      const d = a.markChatItemAsDeletedAction;
      // "[message retracted]" = author deleted it, "[message deleted]" = mod.
      // deletion type detection isnt implemented in non-english languages, so im pretty sure those will just get marked as mod-deleted
      mark(d.targetItemId, /retract/i.test(deletedText(d)) ? 'self' : 'mod');
      return true;
    }
    if (a.removeChatItemAction) {
      mark(a.removeChatItemAction.targetItemId, 'mod');
      return true;
    }
    if (a.markChatItemsByAuthorAsDeletedAction) {
      markAuthor(a.markChatItemsByAuthorAsDeletedAction.externalChannelId);
      return true;
    }
    if (a.removeChatItemByAuthorAction) {
      markAuthor(a.removeChatItemByAuthorAction.externalChannelId);
      return true;
    }
    return false;
  }

  function filter(actions) {
    let dropped = false;
    const kept = actions.filter(a => {
      if (a.replayChatItemAction) {
        const inner = a.replayChatItemAction.actions.filter(x => !handle(x));
        if (inner.length !== a.replayChatItemAction.actions.length) dropped = true;
        a.replayChatItemAction.actions = inner;
        return inner.length > 0;
      }
      if (handle(a)) { dropped = true; return false; }
      return true;
    });
    return dropped ? kept : null;
  }

  function paint(id, tries = 20) {
    const el = document.getElementById(id);
    if (!el) {
      // not yet rendered
      if (tries > 0) setTimeout(() => paint(id, tries - 1), 250);
      return;
    }
    const m = marks.get(id);
    el.dataset.ylac = m.kind;
    el.title = `${LABELS[m.kind]} at ${m.at.toLocaleTimeString()}`;
  }

  function renderStats() {
    const header = document.querySelector('yt-live-chat-header-renderer #primary-content');
    if (!header) return;
    if (!statsEl?.isConnected) {
      statsEl = document.createElement('span');
      statsEl.id = 'ylac-stats';
      header.appendChild(statsEl);
    }
    const n = { mod: 0, ban: 0, self: 0 };
    for (const m of marks.values()) n[m.kind]++;
    statsEl.textContent = `${n.mod} removed · ${banned.size} banned · ${n.self} retracted`;
    statsEl.title = [
      `${n.mod} messages removed by moderators`,
      `${banned.size} users banned or timed out (${n.ban} of their messages kept)`,
      `${n.self} messages retracted by their authors`,
    ].join('\n');
    statsEl.classList.toggle('ylac-active', n.mod + banned.size > 0);
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    if (!url.includes('/live_chat/get_live_chat')) return res;

    let json;
    try {
      json = await res.clone().json();
    } catch {
      return res;
    }
    const cont = json?.continuationContents?.liveChatContinuation;
    if (!cont?.actions) return res;

    const kept = filter(cont.actions);
    if (!kept) return res;
    cont.actions = kept;
    renderStats();

    const out = new Response(JSON.stringify(json), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
    Object.defineProperty(out, 'url', { value: res.url });
    return out;
  };

// youtubes top chat feature filters some things server-side, so only live chat gets a mostly uncensored stream
  function useLiveChat(tries = 40) {
    const menu = document.querySelector('yt-sort-filter-sub-menu-renderer');
    const items = menu?.data?.subMenuItems;
    const links = menu?.querySelectorAll('tp-yt-paper-listbox a');
    if (!items || items.length < 2 || links.length !== items.length) {
      if (tries > 0) setTimeout(() => useLiveChat(tries - 1), 250);
      return;
    }
    // this order doesnt change across localities (probably)
    if (items[0].selected) links[1].click();
  }
  window.addEventListener('load', () => {
    useLiveChat();
    renderStats();
  }, { once: true });

  // youtube re-rendering the chat breaks deleted message logging
  new MutationObserver(muts => {
    if (statsEl && !statsEl.isConnected) renderStats();
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.id && marks.has(n.id)) paint(n.id);
      }
    }
  }).observe(document, { childList: true, subtree: true });
})();
