export function connectScenes(client) {
  const $ = id => document.getElementById(id);
  const bucket = client.storage.from('scene-backgrounds');
  const status = $('scene-status');
  const dossierStatus = $('scene-dossier-status');
  const select = $('scene-select');
  const dossierSelect = $('scene-dossier-select');
  let account = null;
  let isMJ = false;
  let revision = 0;
  let loading = false;
  let busy = false;
  let presets = [];
  let dossiers = [];
  let active = null;
  let preview = null;
  let rendered = '';
  let renderRequest = 0;
  const imageUrls = new Map();

  async function render() {
    const scene = preview || active;
    const current = ++renderRequest;
    let url;
    if (scene?.image_path) {
      const saved = imageUrls.get(scene.image_path);
      if (saved?.expires > Date.now()) {
        url = saved.url;
      } else {
        try {
          const { data, error } = await bucket.createSignedUrl(scene.image_path, 120);
          if (current !== renderRequest) return;
          if (error) throw error;
          url = data.signedUrl;
          imageUrls.set(scene.image_path, { url, expires: Date.now() + 90000 });
        } catch {
          if (current !== renderRequest) return;
          document.body.dataset.scene = 'astral';
          document.body.style.removeProperty('--scene-image');
          $('scene-banner').hidden = false;
          $('scene-banner').textContent = scene.name + ' · Image indisponible';
          rendered = '';
          return;
        }
      }
    }
    const key = scene ? scene.id + ':' + Boolean(preview) + ':' + (url ?? '') : '';
    if (key === rendered) return;
    rendered = key;
    document.body.dataset.scene = scene?.theme ?? 'astral';
    document.body.style.removeProperty('--scene-image');
    if (url) document.body.style.setProperty('--scene-image', 'url(' + JSON.stringify(url) + ')');
    const banner = $('scene-banner');
    banner.hidden = !preview && (!scene || scene.theme === 'astral');
    banner.textContent = (preview ? 'Aperçu MJ · ' : '') + (scene?.name ?? '');
  }

  function replaceOptions(field, rows, placeholder) {
    const selected = field.value;
    field.replaceChildren(new Option(placeholder, ''));
    for (const row of rows) field.add(new Option(row.name, row.id));
    if (rows.some(row => row.id === selected)) field.value = selected;
  }

  function renderDossiers(rows) {
    if (JSON.stringify(rows) === JSON.stringify(dossiers)) return;
    dossiers = rows;
    replaceOptions(dossierSelect, rows, 'Nouvelle fiche');
    for (const [kind, target] of [['pnj', 'scene-npcs'], ['enemy', 'scene-enemies']]) {
      const cards = rows.filter(row => row.kind === kind).map(row => {
        const details = document.createElement('details');
        const title = document.createElement('summary');
        const notes = document.createElement('p');
        title.textContent = row.name;
        notes.textContent = row.notes;
        notes.style.whiteSpace = 'pre-wrap';
        details.append(title, notes);
        return details;
      });
      $(target).replaceChildren(...cards);
    }
  }

  async function refresh(nextAccount, nextIsMJ) {
    if (account !== nextAccount || isMJ !== nextIsMJ) {
      account = nextAccount;
      isMJ = nextIsMJ;
      revision++;
      loading = false;
      active = null;
      preview = null;
      presets = [];
      imageUrls.clear();
      select.replaceChildren();
      renderDossiers([]);
      $('scene-dossier-form').reset();
      $('scene-upload').reset();
      $('scene-live').textContent = '';
      status.textContent = '';
      dossierStatus.textContent = '';
      $('scene-tab').hidden = !isMJ;
      if (!isMJ && $('scene-tab').classList.contains('active')) {
        document.querySelector('nav button[data-page="accueil"]').click();
      }
      render();
    }
    if (!account || loading) return;
    const expected = revision;
    loading = true;
    try {
      const [state, choices, notes] = await Promise.all([
        client.from('scene_state').select('scene_id').eq('singleton', true).single(),
        client.from('scene_presets').select('id,name,theme,image_path').order('name'),
        isMJ ? client.from('scene_dossiers').select('id,kind,name,notes').order('name') : { data: [] }
      ]);
      if (expected !== revision) return;
      const error = state.error || choices.error || notes.error;
      if (error) throw error;
      active = choices.data.find(scene => scene.id === state.data.scene_id) ?? null;
      if (JSON.stringify(presets) !== JSON.stringify(choices.data)) {
        presets = choices.data;
        replaceOptions(select, presets, 'Choisir un décor');
        if (!select.value && active) select.value = active.id;
      }
      if (isMJ) {
        $('scene-live').textContent = 'Décor diffusé · ' + (active?.name ?? 'Chargement…');
        renderDossiers(notes.data);
      }
      await render();
    } catch {
      if (expected === revision && isMJ) status.textContent = 'Régie indisponible. Nouvelle tentative automatique.';
    } finally {
      if (expected === revision) loading = false;
    }
  }

  async function mutate(button, target, work) {
    if (!isMJ || busy) return;
    const expected = revision;
    busy = true;
    button.disabled = true;
    try {
      await work(() => expected === revision);
    } catch (error) {
      if (expected === revision) target.textContent = error.message || 'Action impossible.';
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  $('scene-preview').onclick = () => {
    if (!isMJ) return;
    const scene = presets.find(preset => preset.id === select.value);
    if (!scene) return;
    preview = scene;
    render();
  };
  $('scene-stop-preview').onclick = () => {
    preview = null;
    render();
  };
  $('scene-activate').onclick = event => {
    const scene = presets.find(preset => preset.id === select.value);
    if (!scene) return;
    mutate(event.currentTarget, status, async current => {
      const { error } = await client.from('scene_state').update({ scene_id: scene.id })
        .eq('singleton', true).select('scene_id').single();
      if (error) throw error;
      if (!current()) return;
      preview = null;
      active = scene;
      $('scene-live').textContent = 'Décor diffusé · ' + scene.name;
      status.textContent = 'Décor activé pour les joueurs.';
      await render();
    });
  };

  $('scene-upload').onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = $('scene-file').files[0];
    const name = $('scene-name').value.trim();
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const extension = extensions[file?.type];
    if (!name || !extension || file.size > 6291456) {
      status.textContent = 'Choisis une image JPG, PNG ou WebP de 6 Mo maximum et saisis un nom.';
      return;
    }
    mutate(form.querySelector('button'), status, async current => {
      const path = crypto.randomUUID() + '.' + extension;
      const uploaded = await bucket.upload(path, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      if (!current()) return;
      const { data, error } = await client.from('scene_presets')
        .insert({ name, theme: 'custom', image_path: path })
        .select('id,name,theme,image_path').single();
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) await bucket.remove([path]);
        throw error;
      }
      if (!current()) return;
      presets = [...presets.filter(preset => preset.id !== data.id), data];
      replaceOptions(select, presets, 'Choisir un décor');
      select.value = data.id;
      form.reset();
      status.textContent = 'Décor ajouté. Tu peux le prévisualiser avant de l’activer.';
    });
  };

  dossierSelect.onchange = () => {
    const row = dossiers.find(dossier => dossier.id === dossierSelect.value);
    $('scene-dossier-kind').value = row?.kind ?? 'pnj';
    $('scene-dossier-name').value = row?.name ?? '';
    $('scene-dossier-notes').value = row?.notes ?? '';
  };
  $('scene-dossier-form').onsubmit = event => {
    event.preventDefault();
    const id = dossierSelect.value;
    const values = {
      kind: $('scene-dossier-kind').value,
      name: $('scene-dossier-name').value.trim(),
      notes: $('scene-dossier-notes').value.trim()
    };
    if (!values.name || !values.notes) return;
    mutate(event.currentTarget.querySelector('button'), dossierStatus, async current => {
      const table = client.from('scene_dossiers');
      const query = id ? table.update(values).eq('id', id) : table.insert(values);
      const { data, error } = await query.select('id,kind,name,notes').single();
      if (error) throw error;
      if (!current()) return;
      renderDossiers([...dossiers.filter(row => row.id !== data.id), data]);
      dossierSelect.value = data.id;
      dossierStatus.textContent = 'Fiche enregistrée.';
    });
  };
  return refresh;
}
