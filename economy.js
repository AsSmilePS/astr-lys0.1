export function connectEconomy(client) {
  const $ = id => document.getElementById(id);
  let account = null;
  let isMJ = false;
  let snapshot = null;
  let catalog = [];
  let playersKey = '';
  let loading = false;
  let busy = false;
  let revision = 0;

  function line(text) {
    const node = document.createElement('div');
    node.className = 'log';
    node.textContent = text;
    return node;
  }

  function renderShop() {
    const cards = catalog.map(item => {
      const card = document.createElement('div');
      card.className = 'holo-panel';
      const title = document.createElement('h3');
      title.textContent = item.icon + ' ' + item.name;
      const price = document.createElement('p');
      price.textContent = item.price + ' ◈';
      const buy = document.createElement('button');
      buy.textContent = 'Acheter';
      buy.disabled = busy || !snapshot || snapshot.balance < item.price;
      buy.onclick = () => apply(
        { p_kind: 'purchase', p_item: item.id, p_amount: item.price },
        $('shop-status'), item.name + ' ajouté à ton inventaire.'
      );
      card.append(title, price, buy);
      return card;
    });
    $('shop-items').replaceChildren(...cards);
    $('shop-coins').textContent = snapshot?.balance ?? '—';
  }

  function renderSnapshot() {
    const entries = snapshot?.entries ?? [];
    $('shop-history').replaceChildren(...entries.map(entry => {
      const amount = entry.delta > 0 ? '+' + entry.delta : entry.delta;
      const coins = entry.kind === 'opening' ? 100 + entry.delta : amount;
      return line(entry.label + ' · ' + coins + ' ◈ · ' + new Date(entry.date).toLocaleString('fr-FR'));
    }));
    $('online-inventory').replaceChildren(...entries.flatMap(entry => entry.items).map(line));
    $('online-inventory-status').textContent = snapshot
      ? ($('online-inventory').childElementCount ? '' : 'Aucun objet synchronisé.')
      : 'Inventaire en ligne indisponible.';
    renderShop();
  }

  async function loadSnapshot() {
    if (!account || loading) return;
    const expected = revision;
    loading = true;
    try {
      const { data, error } = await client.rpc('economy_snapshot');
      if (expected !== revision) return;
      if (error) throw error;
      if (!snapshot) $('shop-status').textContent = '';
      if (JSON.stringify(snapshot) !== JSON.stringify(data)) {
        snapshot = data;
        renderSnapshot();
      }
    } catch {
      if (expected === revision) {
        snapshot = null;
        renderSnapshot();
        $('shop-status').textContent = 'Bourse indisponible. Nouvelle tentative automatique.';
      }
    } finally {
      if (expected === revision) loading = false;
    }
  }

  function selectedPlayers() {
    return [...$('reward-options').querySelectorAll('input:checked')].map(input => input.value);
  }

  function showTotal() {
    const count = selectedPlayers().length;
    const amount = $('reward-amount').valueAsNumber;
    $('reward-total').textContent = count && amount > 0
      ? count + ' × ' + amount + ' pièces = ' + count * amount + ' pièces'
      : '';
  }

  function renderPlayers(profiles) {
    const key = JSON.stringify(profiles);
    if (key === playersKey) return;
    playersKey = key;
    const selected = selectedPlayers();
    const openingPlayer = $('opening-player').value;
    $('opening-player').replaceChildren(new Option('Choisir un joueur', ''));
    $('reward-options').replaceChildren();
    for (const profile of profiles) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = profile.id;
      input.checked = selected.includes(profile.id);
      label.append(input, ' ' + profile.display_name + ' ');
      $('reward-options').append(label);
      $('opening-player').add(new Option(profile.display_name, profile.id));
    }
    if (profiles.some(profile => profile.id === openingPlayer)) $('opening-player').value = openingPlayer;
    showTotal();
  }

  function setBusy(value) {
    busy = value;
    for (const id of ['reward-form', 'opening-form']) {
      $(id).querySelector('button[type=submit]').disabled = value;
    }
    renderShop();
  }

  async function apply(values, status, success, onSuccess) {
    if (!account || busy) return;
    const actor = account;
    const key = 'astrelys-v08-request:' + actor + ':' + JSON.stringify(values);
    setBusy(true);
    try {
      const request = localStorage.getItem(key) || crypto.randomUUID();
      localStorage.setItem(key, request);
      const { error } = await client.rpc('economy_apply', { ...values, p_request: request });
      if (error) {
        // Une réponse SQL explicite signifie que l'écriture a été annulée.
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) localStorage.removeItem(key);
        throw error;
      }
      localStorage.removeItem(key);
      if (account !== actor) return;
      // Ignore un rafraîchissement commencé avant la transaction.
      revision++;
      loading = false;
      await loadSnapshot();
      if (account !== actor) return;
      status.textContent = success;
      onSuccess?.();
    } catch (error) {
      if (account === actor) {
        status.textContent = error.code === 'P0001' ? error.message
          : 'Résultat non confirmé. Réessaie avec les mêmes valeurs.';
      }
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener('astrelys:catalog', ({ detail }) => {
    if (JSON.stringify(catalog) === JSON.stringify(detail)) return;
    catalog = detail;
    renderShop();
  });
  $('reward-form').oninput = showTotal;
  $('reward-form').onsubmit = event => {
    event.preventDefault();
    if (!isMJ) return;
    const players = selectedPlayers().sort();
    const label = $('reward-reason').value.trim();
    if (!players.length || !label) {
      $('reward-status').textContent = 'Choisis au moins un joueur et indique un motif.';
      return;
    }
    apply({ p_kind: 'reward', p_players: players, p_amount: $('reward-amount').valueAsNumber, p_label: label },
      $('reward-status'), 'Récompense distribuée à ' + players.length + ' joueur(s).', () => {
        $('reward-form').reset();
        for (const input of $('reward-options').querySelectorAll('input')) input.checked = false;
        showTotal();
      });
  };
  $('opening-form').onsubmit = event => {
    event.preventDefault();
    if (!isMJ) return;
    const items = $('opening-items').value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    apply({ p_kind: 'opening', p_players: [$('opening-player').value],
      p_amount: $('opening-balance').valueAsNumber, p_items: items },
    $('reward-status'), 'Bourse et objets repris.', () => $('opening-form').reset());
  };

  return function refresh(nextAccount, nextIsMJ, profiles = []) {
    if (account !== nextAccount || isMJ !== nextIsMJ) {
      account = nextAccount;
      isMJ = nextIsMJ;
      snapshot = null;
      revision++;
      loading = false;
      $('reward-form').reset();
      $('opening-form').reset();
      $('reward-status').textContent = '';
      $('shop-status').textContent = account ? 'Chargement de ta bourse…'
        : 'Connecte-toi dans Réseau pour accéder à ta bourse.';
      renderSnapshot();
    }
    $('reward-panel').hidden = !isMJ;
    renderPlayers(isMJ ? profiles : []);
    loadSnapshot();
  };
}
