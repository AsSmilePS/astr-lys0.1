export function connectCatalog(client) {
  const byId = id => document.getElementById(id);
  const status = byId('catalog-status');
  const panel = byId('shop-admin');
  const form = byId('shop-admin-form');
  const select = byId('shop-edit-item');
  const name = byId('shop-edit-name');
  const icon = byId('shop-edit-icon');
  const price = byId('shop-edit-price');
  const active = byId('shop-edit-active');
  const save = byId('shop-save');
  const feedback = byId('shop-admin-status');

  let items = [];
  let account = null;
  let isMJ = false;
  let request = 0;
  let saving = false;
  let draftItemId = null;

  function showItems() {
    const visible = items.filter(item => item.active);
    document.dispatchEvent(new CustomEvent('astrelys:catalog', { detail: visible }));
    status.textContent = visible.length ? '' : 'Aucun objet disponible.';
  }

  function resetFields() {
    const item = items.find(item => String(item.id) === select.value);
    draftItemId = item?.id ?? null;
    name.value = item?.name ?? '';
    icon.value = item?.icon ?? '';
    price.value = item?.price ?? '';
    active.checked = item?.active ?? true;
    feedback.textContent = '';
  }

  function updateOptions() {
    const selected = select.value;
    select.replaceChildren(new Option('Nouvel objet', ''));
    for (const item of items) {
      select.add(new Option(item.name + (item.active ? '' : ' (masqué)'), item.id));
    }
    select.value = selected;
    if (select.selectedIndex < 0) {
      select.value = '';
      resetFields();
    }
  }

  async function refresh(nextAccount, nextIsMJ) {
    if (account !== nextAccount || isMJ !== nextIsMJ) {
      account = nextAccount;
      isMJ = nextIsMJ;
      items = items.filter(item => item.active);
      select.value = '';
      resetFields();
    }
    panel.hidden = !isMJ;
    const currentRequest = ++request;

    try {
      const { data, error } = await client.from('shop_catalog')
        .select('id,name,icon,price,active').order('id');
      if (currentRequest !== request) return;
      if (error) throw error;

      items = data;
      showItems();
      if (isMJ) updateOptions();
    } catch {
      if (currentRequest !== request) return;
      items = [];
      showItems();
      status.textContent = 'Catalogue indisponible. Nouvelle tentative automatique.';
    }
  }

  select.onchange = resetFields;
  form.onsubmit = async event => {
    event.preventDefault();
    if (!isMJ || saving) return;

    const values = {
      name: name.value.trim(),
      icon: icon.value.trim() || '✦',
      price: price.valueAsNumber,
      active: active.checked
    };
    if (!values.name || !Number.isInteger(values.price) ||
        values.price < 1 || values.price > 999999) {
      feedback.textContent = 'Entre un nom et un prix entier de 1 à 999 999 pièces.';
      return;
    }

    const editing = draftItemId;
    const author = account;
    saving = true;
    save.disabled = true;
    select.disabled = true;
    try {
      const table = client.from('shop_catalog');
      const write = editing === null ? table.insert(values) : table.update(values).eq('id', editing);
      const { data, error } = await write.select('id').single();
      if (error) throw error;
      if (account !== author || !isMJ) return;
      await refresh(author, true);
      if (account !== author || !isMJ) return;
      updateOptions();
      select.value = items.some(item => item.id === data.id) ? String(data.id) : '';
      resetFields();
      feedback.textContent = 'Objet enregistré.';
    } catch (error) {
      if (account === author && isMJ) {
        feedback.textContent = 'Enregistrement impossible. ' + (error.message || '');
      }
    } finally {
      saving = false;
      save.disabled = false;
      select.disabled = false;
    }
  };

  return refresh;
}
