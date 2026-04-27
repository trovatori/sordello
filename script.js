let xmlDoc = null;
const NS = "http://www.tei-c.org/ns/1.0";
let currentSideView = 'translation';

// Caricamento del file XML
fetch('edizione.xml')
    .then(response => response.text())
    .then(data => {
        const parser = new DOMParser();
        xmlDoc = parser.parseFromString(data, "text/xml");
        console.log("XML caricato con successo:", xmlDoc);
        initEdition();
    })
    .catch(error => console.error("Errore fatale nel caricamento XML:", error));

/**
 * Funzione robusta per trovare i tag TEI gestendo i namespace e i tag custom
 */
function getTEI(tag, parent = xmlDoc) {
    if (!parent) return [];
    let el = parent.getElementsByTagNameNS(NS, tag);
    if (el.length === 0) el = parent.getElementsByTagName(tag);
    if (el.length === 0) el = Array.from(parent.querySelectorAll('*')).filter(e => e.localName === tag || e.nodeName === tag);
    return Array.from(el);
}

function initEdition() {
    // --- 1. Estrazione Titolo e Autore ---
    const mainTitleEl = document.getElementById('main-title');
    if (mainTitleEl) {
        const title = getTEI('title')[0]?.textContent || getTEI('titolo')[0]?.textContent || "Edizione Digitale";
        const author = getTEI('author')[0]?.textContent || getTEI('autore')[0]?.textContent || "Autore Anonimo";
        mainTitleEl.innerHTML = `${author} – <em>${title}</em>`;
    }

    // --- 2. Controllo Visibilità Pannelli ---
    const hasTranslation = getTEI('translation').length > 0 || getTEI('traduzione').length > 0 || getTEI('div').some(d => d.getAttribute('type') === 'translation');
    // Controllo specifico per <surface>
    const surfaces = getTEI('surface');
    const hasFacsimile = surfaces.length > 0 || getTEI('facsimile').length > 0 || getTEI('facsimili').length > 0 || getTEI('graphic').length > 0;
    
    const hasVariants = getTEI('app').length > 0;
    const hasWitnesses = getTEI('listWit').length > 0 || getTEI('witness').length > 0 || getTEI('testimoni').length > 0 || getTEI('testimone').length > 0;

    const btnTranslation = document.getElementById('btn-translation');
    const btnFacsimile = document.getElementById('btn-facsimile');
    const btnApparatus = document.getElementById('btn-apparatus');
    const appControls = document.getElementById('apparatus-controls');

    if (btnTranslation && !hasTranslation) btnTranslation.style.display = 'none';
    if (btnFacsimile && !hasFacsimile) btnFacsimile.style.display = 'none';
    
    if (!hasVariants) {
        if (btnApparatus) btnApparatus.style.display = 'none';
        if (appControls) appControls.style.display = 'none';
        if (currentSideView === 'apparatus') {
            currentSideView = hasTranslation ? 'translation' : (hasFacsimile ? 'facsimile' : '');
        }
    }

    const infoSection = document.querySelector('.info-section');
    const filterWitnessContainer = document.getElementById('filterWitness')?.parentElement;
    if (!hasWitnesses) {
        if (infoSection) infoSection.style.display = 'none';
        if (filterWitnessContainer) filterWitnessContainer.style.display = 'none';
    }

    // --- 3. Caricamento Dati Testimoni ---
    if (hasWitnesses) {
        const witnesses = getTEI('witness').length > 0 ? getTEI('witness') : getTEI('testimone');
        const wList = document.getElementById('witness-list');
        const wSelect = document.getElementById('filterWitness');
        
        if (wSelect) {
            wSelect.innerHTML = '<option value="all">Testo Critico</option>';
            witnesses.forEach(w => {
                const id = (w.getAttribute('xml:id') || w.getAttribute('id') || "").trim();
                if (id) {
                    if (wList) {
                        const li = document.createElement('li');
                        li.innerHTML = `<strong>${id}</strong>: ${w.textContent}`;
                        wList.appendChild(li);
                    }
                    let opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = `MS ${id}`;
                    wSelect.appendChild(opt);
                }
            });
        }
    }

    // --- 4. Caricamento Introduzione ---
    const introDiv = getTEI('introduzione')[0] || getTEI('div').find(d => ['intro', 'introduction'].includes(d.getAttribute('type')));
    const introTarget = document.getElementById('intro-text');
    if (introTarget && introDiv) {
        introTarget.innerHTML = introDiv.innerHTML;
    }

    renderText();
    
    if (currentSideView) {
        setSideView(currentSideView);
    } else {
        const rightCol = document.querySelector('.right-col');
        if (rightCol) rightCol.style.display = 'none';
    }
}

function renderText() {
    if (!xmlDoc) return;
    const witFilter = document.getElementById('filterWitness')?.value || "all";
    const typeFilter = document.getElementById('filterType')?.value || "all";
    const textBody = getTEI('testo')[0] || getTEI('body')[0] || getTEI('text')[0];
    if (!textBody) return;

    let htmlOutput = "";
    let apparatusList = "";
    const lines = getTEI('l', textBody);

    lines.forEach((line, index) => {
        const lineNum = line.getAttribute('n') || (index + 1);
        let lineHTML = `<div class="line"><strong>${lineNum}</strong><span>`;
        
        line.childNodes.forEach(node => {
            const nodeName = node.localName || node.nodeName;
            if (node.nodeType === 3) { 
                lineHTML += node.textContent;
            } 
            else if (nodeName === 'app') {
                const lem = getTEI('lem', node)[0];
                const rdgs = getTEI('rdg', node);
                let detectedType = "substantive"; 
                const lemType = lem?.getAttribute('type');
                if (lemType) detectedType = lemType;
                
                const hasOrthographicRdg = rdgs.some(r => {
                    const t = r.getAttribute('type') || "";
                    return t.toLowerCase().includes('ortho') || t.toLowerCase().includes('orto');
                });
                
                if (hasOrthographicRdg) detectedType = "orthographic";
                const normalizedType = (detectedType.toLowerCase().includes('ortho') || detectedType.toLowerCase().includes('orto')) ? "ortografica" : "sostanziale";

                let textToShow = lem ? lem.textContent : "";
                let appEntry = `<strong>${lineNum}</strong> <em>${textToShow}</em>] `;

                rdgs.forEach((r, i) => {
                    const witRaw = r.getAttribute('wit') || "";
                    const witClean = witRaw.replace('#', '').trim();
                    appEntry += `${r.textContent} (${witClean})${i < rdgs.length - 1 ? '; ' : ''}`;
                    if (witFilter !== "all" && (witClean === witFilter || witRaw === "#" + witFilter)) {
                        textToShow = r.textContent;
                    }
                });

                if (typeFilter === "all" || typeFilter === normalizedType) {
                    lineHTML += `<span class="variant" title="Vedi apparato">${textToShow}</span>`;
                    apparatusList += `<div class="app-list-item">${appEntry}</div>`;
                } else {
                    lineHTML += textToShow;
                }
            }
        });
        htmlOutput += lineHTML + "</span></div>";
    });

    const textContainer = document.getElementById('text-container');
    if (textContainer) textContainer.innerHTML = htmlOutput;
    window.lastApparatusContent = apparatusList;
    if (currentSideView === 'apparatus') updateSideContent();
}

function setSideView(view) {
    if (!view) return;
    currentSideView = view;
    const controls = document.getElementById('apparatus-controls');
    if (controls) controls.style.display = (view === 'apparatus') ? 'flex' : 'none';
    
    document.querySelectorAll('.nav-side-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById('btn-' + view);
    if (targetBtn) targetBtn.classList.add('active');
    
    updateSideContent();
}

/**
 * Cambia l'immagine visualizzata
 */
function changeFacsimile(url, caption) {
    const imgEl = document.getElementById('facs-img-side');
    const capEl = document.getElementById('facs-caption');
    if (imgEl) imgEl.src = url;
    if (capEl) capEl.textContent = caption;
}

function updateSideContent() {
    const container = document.getElementById('side-content');
    if (!container) return;

    if (currentSideView === 'translation') {
        const transDiv = getTEI('traduzione')[0] || getTEI('div').find(d => d.getAttribute('type') === 'translation');
        container.innerHTML = transDiv ? transDiv.innerHTML : "<p>Traduzione non disponibile.</p>";
    } else if (currentSideView === 'apparatus') {
        container.innerHTML = `<h3>Apparato Critico</h3>` + (window.lastApparatusContent || "<p>Nessuna variante disponibile.</p>");
    } else if (currentSideView === 'facsimile') {
        // --- NUOVA LOGICA: Selettore basato su <surface xml:id="..."> ---
        const surfaces = getTEI('surface');
        
        let selectHTML = "";
        if (surfaces.length > 1) {
            selectHTML = `<div style="margin-bottom: 15px;">
                <label style="font-size: 0.8rem; display: block; margin-bottom: 5px; color: #666;">Seleziona Foglio (surface):</label>
                <select onchange="changeFacsimile(this.value, this.options[this.selectedIndex].dataset.caption)" style="width: 100%; padding: 5px; border-radius: 4px; border: 1px solid #ddd;">`;
            
            surfaces.forEach((surf) => {
                const id = surf.getAttribute('xml:id') || surf.getAttribute('id') || "Folia";
                const graphic = getTEI('graphic', surf)[0];
                const url = graphic ? graphic.getAttribute('url') : "";
                const desc = getTEI('desc', surf)[0]?.textContent || id;
                selectHTML += `<option value="${url}" data-caption="${desc}">${id}</option>`;
            });
            selectHTML += `</select></div>`;
        }

        const firstSurf = surfaces[0];
        const firstGraphic = firstSurf ? getTEI('graphic', firstSurf)[0] : null;
        const initialUrl = firstGraphic ? firstGraphic.getAttribute('url') : "";
        const initialCaption = firstSurf ? (getTEI('desc', firstSurf)[0]?.textContent || firstSurf.getAttribute('xml:id') || "") : "";

        container.innerHTML = `
            <h3>Facsimile</h3>
            ${selectHTML}
            <div class="img-zoom-container">
                <img id="facs-img-side" src="${initialUrl}" alt="Manoscritto" onclick="toggleZoom(this)">
            </div>
            <p id="facs-caption" style="font-size: 0.85rem; color: #555; margin-top: 10px; font-style: italic;">${initialCaption}</p>
        `;
    }
}

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.main-nav button').forEach(b => b.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
        target.style.display = 'block';
        if (id === 'edizione') renderText();
    }
    const btn = Array.from(document.querySelectorAll('.main-nav button')).find(b => b.getAttribute('onclick')?.includes(id));
    if (btn) btn.classList.add('active');
}

function toggleZoom(img) { img.classList.toggle('zoom'); }
