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
 * Funzione robusta per trovare i tag TEI gestendo i namespace
 */
function getTEI(tag, parent = xmlDoc) {
    if (!parent) return [];
    let el = parent.getElementsByTagNameNS(NS, tag);
    if (el.length === 0) el = parent.getElementsByTagName(tag);
    if (el.length === 0) el = Array.from(parent.querySelectorAll('*')).filter(e => e.localName === tag);
    return Array.from(el);
}

function initEdition() {
    // --- Estrazione Titolo e Autore dal teiHeader ---
    const titleStmt = getTEI('titleStmt')[0];
    if (titleStmt) {
        const teiTitle = getTEI('title', titleStmt)[0]?.textContent || "";
        const teiAuthor = getTEI('author', titleStmt)[0]?.textContent || "";
        const mainTitleEl = document.getElementById('main-title');
        
        if (mainTitleEl) {
            mainTitleEl.innerHTML = `${teiAuthor} – <em>${teiTitle}</em>`;
        }
    }

    // --- Controllo presenza elementi per nascondere pulsanti ---
    const hasTranslation = getTEI('div').some(d => d.getAttribute('type') === 'translation');
    const hasFacsimile = getTEI('facsimile').length > 0 || getTEI('graphic').length > 0;

    const btnTranslation = document.getElementById('btn-translation');
    const btnFacsimile = document.getElementById('btn-facsimile');

    if (btnTranslation && !hasTranslation) {
        btnTranslation.style.display = 'none';
        // Se la traduzione manca, imposta l'apparato come vista predefinita
        currentSideView = 'apparatus';
    }

    if (btnFacsimile && !hasFacsimile) {
        btnFacsimile.style.display = 'none';
    }

    // 1. Estrazione Introduzione/Testo preliminare
    const introDiv = getTEI('div').find(d => 
        ['intro', 'poem', 'introduction'].includes(d.getAttribute('type'))
    );
    const introTarget = document.getElementById('intro-text');
    if (introTarget) {
        introTarget.innerHTML = introDiv ? introDiv.innerHTML : "Benvenuti nell'edizione digitale.";
    }

    // 2. Gestione Testimoni dal teiHeader
    const witnesses = getTEI('witness');
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

    renderText();
    setSideView(currentSideView);
}

function renderText() {
    if (!xmlDoc) return;
    
    const witFilter = document.getElementById('filterWitness')?.value || "all";
    const typeFilter = document.getElementById('filterType')?.value || "all";
    
    const editionDiv = getTEI('div').find(d => 
        ['edition', 'poem', 'text'].includes(d.getAttribute('type'))
    );
    
    if (!editionDiv) return;

    let htmlOutput = "";
    let apparatusList = "";
    const lines = getTEI('l', editionDiv);

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

                const normalizedType = (detectedType.toLowerCase().includes('ortho') || detectedType.toLowerCase().includes('orto')) 
                    ? "ortografica" 
                    : "sostanziale";

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

                const isVisibleByFilter = (typeFilter === "all" || typeFilter === normalizedType);

                if (isVisibleByFilter) {
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
    currentSideView = view;
    const controls = document.getElementById('apparatus-controls');
    if (controls) controls.style.display = (view === 'apparatus') ? 'flex' : 'none';
    
    document.querySelectorAll('.nav-side-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById('btn-' + view);
    if (targetBtn) targetBtn.classList.add('active');
    
    updateSideContent();
}

function updateSideContent() {
    const container = document.getElementById('side-content');
    if (!container) return;

    if (currentSideView === 'translation') {
        const transDiv = getTEI('div').find(d => d.getAttribute('type') === 'translation');
        container.innerHTML = transDiv ? transDiv.innerHTML : "<p>Traduzione non disponibile per questa sezione.</p>";
    } else if (currentSideView === 'apparatus') {
        container.innerHTML = `<h3>Apparato Critico</h3>` + (window.lastApparatusContent || "<p>Nessuna variante disponibile con i filtri attuali.</p>");
    } else if (currentSideView === 'facsimile') {
        container.innerHTML = `<h3>Facsimile</h3><div class="img-zoom-container"><img id="facs-img-side" src="https://digi.vatlib.it/iiif/MSS_Vat.lat.5232/canvas/p331/full/800,/0/default.jpg" alt="Manoscritto" onclick="toggleZoom(this)"></div>`;
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