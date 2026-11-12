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
  const chapterField = byId('shop-edit-chapter');
  const activateForm = byId('chapter-activate-form');
  const activateSelect = byId('chapter-activate-select');
  const createForm = byId('chapter-create-form');
  const chapterName = byId('chapter-name');
  const chapterStatus = byId('chapter-status');
  const currentLabel = byId('shop-current-chapter');

  let chapters = [];
  let currentChapter = null;
  let changingChapter = false;
  const feedback = byId('shop-admin-status');

  let items = [];
  let account = null;
  let isMJ = false;
  let request = 0;
  let saving = false;
  let draftItemId = null;

  function showItems() {
    const visible = items.filter(item => item.active &&
      (item.chapter_id === null || item.chapter_id === currentChapter));
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
    chapterField.value = item?.chapter_id == null ? '' : String(item.chapter_id);
    feedback.textContent = '';
  }

  function updateOptions() {
    const selected = select.value;
    select.replaceChildren(new Option('Nouvel objet', ''));
    for (const item of items) {
      const chapter = chapters.find(chapter => chapter.id === item.chapter_id);
      const suffix = chapter ? ' · ' + chapter.name : '';
      select.add(new Option(item.name + suffix + (item.active ? '' : ' (masqué)'), item.id));
    }
    select.value = selected;
    if (select.selectedIndex < 0) {
      select.value = '';
      resetFields();
    }
  }

  function updateChapterOptions() {
    const selectedChapter = chapterField.value;
    const selectedActivation = activateSelect.value;
    chapterField.replaceChildren(new Option('Tous les chapitres', ''));
    activateSelect.replaceChildren();
    for (const chapter of chapters) {
      chapterField.add(new Option(chapter.name, chapter.id));
      activateSelect.add(new Option(chapter.name, chapter.id));
    }
    chapterField.value = selectedChapter;
    if (chapterField.selectedIndex < 0) chapterField.value = '';
    activateSelect.value = selectedActivation || String(currentChapter);
    if (activateSelect.selectedIndex < 0) activateSelect.value = String(currentChapter);
  }

  async function refresh(nextAccount, nextIsMJ) {
    if (account !== nextAccount || isMJ !== nextIsMJ) {
      account = nextAccount;
      isMJ = nextIsMJ;
      items = [];
      showItems();
      chapterStatus.textContent = '';
      select.value = '';
      resetFields();
    }
    panel.hidden = !isMJ;
    const currentRequest = ++request;

    try {
      const [catalogResult, chaptersResult, stateResult] = await Promise.all([
        client.from('shop_catalog').select('id,name,icon,price,active,chapter_id').order('id'),
        client.from('shop_chapters').select('id,name').order('id'),
        client.from('shop_chapter_state').select('chapter_id').eq('singleton', true).single()
      ]);
      if (currentRequest !== request) return;
      const error = catalogResult.error || chaptersResult.error || stateResult.error;
      if (error) throw error;

      items = catalogResult.data;
      chapters = chaptersResult.data;
      currentChapter = stateResult.data.chapter_id;
      const chapter = chapters.find(chapter => chapter.id === currentChapter);
      currentLabel.textContent = chapter ? 'Chapitre actif · ' + chapter.name : '';
      showItems();
      if (isMJ) {
        updateChapterOptions();
        updateOptions();
      }
    } catch {
      if (currentRequest !== request) return;
      items = [];
      showItems();
      currentLabel.textContent = '';
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
      active: active.checked,
      chapter_id: chapterField.value ? Number(chapterField.value) : null
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

  async function changeChapter(write, onSuccess, message) {
    if (!isMJ || changingChapter) return;
    const author = account;
    changingChapter = true;
    const buttons = [activateForm, createForm].map(form => form.querySelector('button'));
    for (const button of buttons) button.disabled = true;
    try {
      const { data, error } = await write;
      if (error) throw error;
      if (account !== author || !isMJ) return;
      await refresh(author, true);
      if (account !== author || !isMJ) return;
      onSuccess(data);
      chapterStatus.textContent = message;
    } catch (error) {
      if (account === author && isMJ) {
        chapterStatus.textContent = 'Modification impossible. ' + (error.message || '');
      }
    } finally {
      changingChapter = false;
      for (const button of buttons) button.disabled = false;
    }
  }

  activateForm.onsubmit = event => {
    event.preventDefault();
    const chapterId = Number(activateSelect.value);
    if (!isMJ || !chapterId) return;
    changeChapter(client.from('shop_chapter_state').update({ chapter_id: chapterId })
      .eq('singleton', true).select('chapter_id').single(), () => {}, 'Chapitre activé.');
  };

  createForm.onsubmit = event => {
    event.preventDefault();
    const title = chapterName.value.trim();
    if (!isMJ || !title) return;
    changeChapter(client.from('shop_chapters').insert({ name: title }).select('id').single(),
      chapter => {
        chapterName.value = '';
        activateSelect.value = String(chapter.id);
      }, 'Chapitre créé. Tu peux préparer ses objets avant de l’activer.');
  };

  return refresh;
}
