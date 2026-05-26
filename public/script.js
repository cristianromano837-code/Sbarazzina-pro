const socket = io();

socket.on("connect", () => {
    console.log("Collegato al server multiplayer:", socket.id);
});

let codiceStanza = "";
let nomePlayer = "";
let mioPlayerIndex = null;
let statoConnessioneStanza = "fuori";

let giocatoriStanza = [];
let squadreStanza = null;
let compagnoScelto = null;
let partitaOnlineAvviata = false;

/*
    Flusso stanza:
    - il giocatore scrive prima il proprio nome.
    - il campo stanza parte vuoto.
    - chi apre la partita scrive il nome stanza e clicca Crea stanza.
    - chi si unisce scrive lo stesso nome stanza e clicca Partecipa a stanza.
    - quando la stanza arriva a 4 giocatori, il server manda "partita-iniziata".
    - tutti vedono i nomi dei giocatori.
    - P1 può scegliere il compagno.
    - il piantino viene mandato a tutti i giocatori della stanza.
*/

function normalizzaNomeStanza(valore) {
    return (valore || "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function testoSicuro(valore) {
    return String(valore || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function chiudiMessaggioAttesaStanza() {
    const ov = document.getElementById("overlay-msg");

    if (!ov) {
        return;
    }

    ov.innerHTML = "";
    ov.className = "";
}

function setMessaggioStanza(titolo, testo = "") {
    const ov = document.getElementById("overlay-msg");

    if (!ov) {
        return;
    }

    ov.className = "small-message";
    ov.innerHTML = `
        <h2>${titolo}</h2>
        ${testo ? `<p>${testo}</p>` : ""}
    `;
}

function aggiornaPulsantiStanza(disabilitati) {
    const bottoni = document.querySelectorAll(
        "button[onclick='creaStanza()'], button[onclick=\"creaStanza()\"], " +
        "button[onclick='entraStanza()'], button[onclick=\"entraStanza()\"], " +
        "button[onclick='partecipaStanza()'], button[onclick=\"partecipaStanza()\"]"
    );

    bottoni.forEach(btn => {
        btn.disabled = disabilitati;
        btn.classList.toggle("disabled-room-btn", disabilitati);
    });
}

function preparaInterfacciaStanza() {
    const inputCodice = document.getElementById("room-code");
    const inputNome = document.getElementById("player-name");

    if (inputCodice) {
        inputCodice.value = "";
        inputCodice.placeholder = "Nome stanza";
        inputCodice.autocomplete = "off";
        inputCodice.addEventListener("input", () => {
            codiceStanza = normalizzaNomeStanza(inputCodice.value);
        });
    }

    if (inputNome) {
        inputNome.placeholder = "Il tuo nome";
        inputNome.autocomplete = "nickname";
        inputNome.addEventListener("input", () => {
            nomePlayer = inputNome.value.trim();
        });
    }
}

function leggiDatiStanza() {
    const inputCodice = document.getElementById("room-code");
    const inputNome = document.getElementById("player-name");

    const codice = normalizzaNomeStanza(inputCodice ? inputCodice.value : "");
    const nome = inputNome ? inputNome.value.trim() : "";

    if (!nome) {
        alert("Inserisci prima il tuo nome giocatore");
        inputNome && inputNome.focus();
        return null;
    }

    if (!codice) {
        alert("Inserisci il nome della stanza");
        inputCodice && inputCodice.focus();
        return null;
    }

    if (codice.length < 2) {
        alert("Il nome stanza deve avere almeno 2 caratteri");
        inputCodice && inputCodice.focus();
        return null;
    }

    return { codice, nome };
}

function creaStanza() {
    const dati = leggiDatiStanza();

    if (!dati || statoConnessioneStanza === "attesa") {
        return;
    }

    codiceStanza = dati.codice;
    nomePlayer = dati.nome;
    statoConnessioneStanza = "attesa";
    partitaOnlineAvviata = false;
    aggiornaPulsantiStanza(true);

    setMessaggioStanza(
        "Creazione stanza...",
        `Stanza: <strong>${testoSicuro(codiceStanza)}</strong>`
    );

    socket.emit("crea-stanza", {
        codice: codiceStanza,
        stanza: codiceStanza,
        room: codiceStanza,
        nome: nomePlayer,
        playerName: nomePlayer
    });
}

function entraStanza() {
    const dati = leggiDatiStanza();

    if (!dati || statoConnessioneStanza === "attesa") {
        return;
    }

    codiceStanza = dati.codice;
    nomePlayer = dati.nome;
    statoConnessioneStanza = "attesa";
    partitaOnlineAvviata = false;
    aggiornaPulsantiStanza(true);

    setMessaggioStanza(
        "Accesso alla stanza...",
        `Stanza: <strong>${testoSicuro(codiceStanza)}</strong>`
    );

    socket.emit("entra-stanza", {
        codice: codiceStanza,
        stanza: codiceStanza,
        room: codiceStanza,
        nome: nomePlayer,
        playerName: nomePlayer
    });
}

// Alias utile se il bottone HTML si chiama "Partecipa a stanza".
function partecipaStanza() {
    entraStanza();
}

function aggiornaDatiStanza(stato = {}) {
    if (stato.codice || stato.stanza || stato.room) {
        codiceStanza = stato.codice || stato.stanza || stato.room;
    }

    if (Array.isArray(stato.giocatori)) {
        giocatoriStanza = stato.giocatori;
    }

    if (stato.squadre) {
        squadreStanza = stato.squadre;
    }

    if (stato.compagnoScelto !== undefined) {
        compagnoScelto = stato.compagnoScelto;
    }
}

function nomeDaIndice(playerIndex) {
    const giocatore = giocatoriStanza.find(g => g.playerIndex === playerIndex);

    if (giocatore && giocatore.nome) {
        return giocatore.nome;
    }

    if (playerIndex === mioPlayerIndex && nomePlayer) {
        return nomePlayer;
    }

    return `P${playerIndex + 1}`;
}

function aggiornaNomiGiocatoriSchermo() {
    const posizioni = ["bottom", "left", "top", "right"];

    for (let i = 0; i < 4; i++) {
        const area = document.getElementById(`pos-${posizioni[i]}`);
        const nameEl = area ? area.querySelector(".name") : null;

        if (!nameEl) {
            continue;
        }

        const nome = nomeDaIndice(i);
        const etichetta = i === mioPlayerIndex ? `${nome} (TU)` : nome;

        let squadraTxt = "";

        if (squadreStanza && Array.isArray(squadreStanza.squadraA) && Array.isArray(squadreStanza.squadraB)) {
            if (squadreStanza.squadraA.includes(i)) {
                squadraTxt = " - Squadra A";
            } else if (squadreStanza.squadraB.includes(i)) {
                squadraTxt = " - Squadra B";
            }
        }

        nameEl.innerText = `${etichetta}${squadraTxt}`;
    }
}

function creaHTMLGiocatoriStanza(stato = {}) {
    const giocatori = Array.isArray(stato.giocatori) ? stato.giocatori : giocatoriStanza;

    if (!giocatori.length) {
        return "<p>Nessun giocatore collegato.</p>";
    }

    return `
        <div class="room-players-list">
            ${giocatori.map(g => {
                const nome = testoSicuro(g.nome || `P${g.playerIndex + 1}`);
                let squadra = "";

                if (squadreStanza && Array.isArray(squadreStanza.squadraA) && squadreStanza.squadraA.includes(g.playerIndex)) {
                    squadra = " - Squadra A";
                } else if (squadreStanza && Array.isArray(squadreStanza.squadraB) && squadreStanza.squadraB.includes(g.playerIndex)) {
                    squadra = " - Squadra B";
                }

                return `<div>P${g.playerIndex + 1}: <strong>${nome}</strong>${squadra}</div>`;
            }).join("")}
        </div>
    `;
}

function creaHTMLSceltaCompagno() {
    if (mioPlayerIndex !== 0) {
        return `<p>In attesa che il creatore scelga il compagno.</p>`;
    }

    const possibili = giocatoriStanza.filter(g => g.playerIndex !== 0);

    if (!possibili.length) {
        return `<p>Quando entrano gli altri giocatori potrai scegliere il compagno.</p>`;
    }

    return `
        <div class="team-picker">
            <p><strong>Scegli il tuo compagno di squadra:</strong></p>
            <div class="team-picker-buttons">
                ${possibili.map(g => {
                    const selezionato = compagnoScelto === g.playerIndex ? "selected-team-btn" : "";
                    return `
                        <button class="${selezionato}" onclick="scegliCompagno(${g.playerIndex})">
                            ${testoSicuro(g.nome || `P${g.playerIndex + 1}`)}
                        </button>
                    `;
                }).join("")}
            </div>
        </div>
    `;
}

function mostraStatoAttesa(stato = {}) {
    if (partitaOnlineAvviata || stato.partitaIniziata) {
        return;
    }

    const nomeStanza = stato.codice || stato.stanza || stato.room || codiceStanza;
    const giocatori = stato.giocatoriConnessi || stato.players || stato.numeroGiocatori || giocatoriStanza.length || 1;
    const massimo = stato.massimoGiocatori || 4;

    setMessaggioStanza(
        `Stanza ${testoSicuro(nomeStanza)}`,
        `
            Giocatori collegati: <strong>${giocatori}/${massimo}</strong>
            ${creaHTMLGiocatoriStanza(stato)}
            ${creaHTMLSceltaCompagno()}
            <p>La partita parte automaticamente quando la stanza arriva a 4 giocatori.</p>
        `
    );
}

function gestisciIngressoRiuscito(stato = {}) {
    statoConnessioneStanza = "dentro";
    aggiornaPulsantiStanza(false);
    aggiornaDatiStanza(stato);

    const nomeStanza = stato.codice || stato.stanza || stato.room || codiceStanza;
    const giocatori = stato.giocatoriConnessi || stato.players || stato.numeroGiocatori || giocatoriStanza.length || 1;

    const roomStatus = document.getElementById("room-status");

    if (roomStatus) {
        roomStatus.innerText = `Stanza ${nomeStanza}: ${giocatori}/4 giocatori`;
    }

    aggiornaNomiGiocatoriSchermo();
    mostraStatoAttesa(stato);
}

function scegliCompagno(playerIndex) {
    if (mioPlayerIndex !== 0) {
        alert("Solo il creatore della stanza può scegliere il compagno.");
        return;
    }

    socket.emit("scegli-compagno", {
        playerIndex: playerIndex,
        compagnoIndex: playerIndex
    });
}

function avviaPartitaOnline(stato = {}) {
    if (partitaOnlineAvviata) {
        return;
    }

    partitaOnlineAvviata = true;
    statoConnessioneStanza = "in-partita";
    aggiornaDatiStanza(stato);
    aggiornaPulsantiStanza(false);
    aggiornaNomiGiocatoriSchermo();
    chiudiMessaggioAttesaStanza();

    const roomStatus = document.getElementById("room-status");

    if (roomStatus) {
        roomStatus.innerText = `Stanza ${codiceStanza}: partita iniziata`;
    }

    inizia();
}

socket.on("stanza-creata", stato => {
    statoConnessioneStanza = "dentro";
    aggiornaPulsantiStanza(false);
    aggiornaDatiStanza(stato);

    const nomeStanza = stato?.codice || stato?.stanza || stato?.room || codiceStanza;

    setMessaggioStanza(
        "Stanza creata",
        `
            Nome stanza: <strong>${testoSicuro(nomeStanza)}</strong><br>
            Condividi questo nome con chi vuole giocare con te.
        `
    );

    aggiornaNomiGiocatoriSchermo();
});

socket.on("entrato-stanza", gestisciIngressoRiuscito);
socket.on("stanza-unita", gestisciIngressoRiuscito);
socket.on("join-ok", gestisciIngressoRiuscito);

socket.on("assegna-player", playerIndex => {
    mioPlayerIndex = playerIndex;
    aggiornaNomiGiocatoriSchermo();
    alert("Sei il giocatore P" + (playerIndex + 1));
});

socket.on("stato-stanza", stato => {
    statoConnessioneStanza = stato.partitaIniziata ? "in-partita" : "dentro";
    aggiornaPulsantiStanza(false);
    aggiornaDatiStanza(stato);

    const nomeStanza = stato.codice || stato.stanza || stato.room || codiceStanza;
    const giocatori = stato.giocatoriConnessi || stato.players || stato.numeroGiocatori || giocatoriStanza.length || 1;

    const roomStatus = document.getElementById("room-status");

    if (roomStatus) {
        roomStatus.innerText = stato.partitaIniziata
            ? `Stanza ${nomeStanza}: partita iniziata`
            : `Stanza ${nomeStanza}: ${giocatori}/4 giocatori`;
    }

    aggiornaNomiGiocatoriSchermo();

    if (stato.partitaIniziata) {
        chiudiMessaggioAttesaStanza();
    } else {
        mostraStatoAttesa(stato);
    }
});

socket.on("squadre-aggiornate", stato => {
    aggiornaDatiStanza(stato);
    aggiornaNomiGiocatoriSchermo();

    if (!partitaOnlineAvviata) {
        mostraStatoAttesa(stato);
    }
});

socket.on("partita-iniziata", stato => {
    avviaPartitaOnline(stato);
});

socket.on("start-partita", stato => {
    avviaPartitaOnline(stato);
});

socket.on("game-started", stato => {
    avviaPartitaOnline(stato);
});

socket.on("mostra-piantino", dati => {
    mostraPiantinoLocale(dati);
});

socket.on("errore", msg => {
    if (statoConnessioneStanza === "attesa") {
        statoConnessioneStanza = "fuori";
    }

    aggiornaPulsantiStanza(false);
    alert(msg);
});

socket.on("connect_error", () => {
    statoConnessioneStanza = "fuori";
    aggiornaPulsantiStanza(false);
    alert("Connessione al server non riuscita. Riprova tra poco.");
});

let mazzo = [], tavola = [], mani = [[], [], [], []];
let mazziPrese = [[], []], sbarazzine = [0, 0], ultimoAPrendere = -1;
let turnoCorrente = 0, staAnimando = false, selezioneAttiva = false;
let carteSelezionate = [], cartaInSospeso = null;
let partenzaCartaInSospeso = null;

// Punteggio totale della partita fino a 31
let puntiPartita = [0, 0];

// Primo giocatore che tira nella mano corrente.
// 0 = Tu, 1 = P2, 2 = P3, 3 = P4
let primoDiMano = 0;

// Serve per il buon gioco: chi accusa tiene le carte scoperte fino a fine smazzata.
let buonGiocoScoperto = [false, false, false, false];

// Dimensioni singola carta nello sheet
const CW = 66;
const CH = 102;
const PUNTI_VITTORIA = 31;

const DECK_W = CW * 10;
const DECK_H = CH * 4;

function scalaCarte() {
    const valore = getComputedStyle(document.documentElement).getPropertyValue("--card-scale");
    const n = parseFloat(valore);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function larghezzaCarta() {
    return CW * scalaCarte();
}

function altezzaCarta() {
    return CH * scalaCarte();
}

function posizioneSfondoCarta(carta) {
    const semiIndice = {
        'Oro': 0,
        'Coppe': 1,
        'Spade': 2,
        'Bastoni': 3
    };

    const scala = scalaCarte();
    const px = (carta.v - 1) * -CW * scala;
    const py = semiIndice[carta.s] * -CH * scala;

    return { px, py };
}

function aggiornaScalaCarte() {
    const larghezza = window.innerWidth || document.documentElement.clientWidth || 1024;
    const altezza = window.innerHeight || document.documentElement.clientHeight || 720;

    let scala = 1;

    if (larghezza <= 360) {
        scala = 0.56;
    } else if (larghezza <= 480) {
        scala = 0.62;
    } else if (larghezza <= 768) {
        scala = 0.72;
    } else if (altezza <= 680) {
        scala = 0.82;
    }

    document.documentElement.style.setProperty("--card-scale", String(scala));
}

function applicaFixLayout() {
    if (document.getElementById("fix-layout-carte-js")) {
        return;
    }

    aggiornaScalaCarte();

    const style = document.createElement("style");
    style.id = "fix-layout-carte-js";
    style.textContent = `
        :root {
            --card-scale: 1;
            --card-w: calc(${CW}px * var(--card-scale));
            --card-h: calc(${CH}px * var(--card-scale));
            --card-gap: clamp(4px, 1.2vw, 10px);
        }

        #center-area {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: min(92vw, 620px);
            min-height: min(42vh, 330px);
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: clamp(8px, 2vw, 18px);
            overflow: visible;
        }

        #tavolo-carte {
            width: 100%;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            align-content: center;
            justify-content: center;
            gap: var(--card-gap);
            margin: 0 auto;
            max-height: 48vh;
            overflow: visible;
        }

        #tavolo-carte.table-many-cards {
            max-height: 52vh;
            overflow-y: auto;
            padding: 4px;
        }

        .hand-row,
        [id^="hand-"] {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--card-gap);
            flex-wrap: nowrap;
        }

        [id^="hand-"].hand-many-cards {
            flex-wrap: wrap;
            max-width: min(96vw, 520px);
        }

        .card {
            width: var(--card-w) !important;
            height: var(--card-h) !important;
            min-width: var(--card-w);
            min-height: var(--card-h);
            background-size: calc(${DECK_W}px * var(--card-scale)) calc(${DECK_H}px * var(--card-scale)) !important;
            box-sizing: border-box;
            flex: 0 0 auto;
        }

        .flying-card {
            position: fixed !important;
            z-index: 9999;
            pointer-events: none;
            transition: left 520ms ease, top 520ms ease, transform 520ms ease, opacity 520ms ease;
        }

        .room-players-list {
            text-align: left;
            margin: 10px auto;
            max-width: 280px;
            line-height: 1.45;
        }

        .team-picker {
            margin-top: 12px;
        }

        .team-picker-buttons {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 6px;
            margin-top: 8px;
        }

        .team-picker-buttons button {
            cursor: pointer;
            padding: 6px 10px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.35);
        }

        .selected-team-btn {
            outline: 3px solid yellow;
            font-weight: bold;
        }

        .piantino-label {
            position: fixed;
            left: 50%;
            top: calc(50% + 74px);
            transform: translateX(-50%);
            z-index: 10000;
            color: white;
            background: rgba(0, 0, 0, 0.7);
            padding: 6px 12px;
            border-radius: 999px;
            font-weight: bold;
            pointer-events: none;
        }

        @media (max-width: 768px) {
            body {
                overflow-x: hidden;
            }

            #center-area {
                width: 96vw;
                min-height: 38vh;
                padding: 6px;
            }

            #tavolo-carte {
                max-height: 44vh;
                gap: 5px;
            }

            .player-area {
                max-width: 100vw;
                box-sizing: border-box;
            }

            #pos-bottom {
                left: 50% !important;
                transform: translateX(-50%);
                width: 100vw;
            }
        }

        @media (max-width: 480px) {
            #center-area {
                top: 49%;
                min-height: 34vh;
            }

            #tavolo-carte.table-many-cards {
                max-height: 40vh;
            }

            [id^="hand-"] {
                gap: 4px;
            }
        }
    `;

    document.head.appendChild(style);
    window.addEventListener("resize", () => {
        aggiornaScalaCarte();
        render();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    preparaInterfacciaStanza();
    applicaFixLayout();
    aggiornaNomiGiocatoriSchermo();
});

function inizia() {
    chiudiMessaggioAttesaStanza();

    puntiPartita = [0, 0];
    primoDiMano = 0;
    preparaNuovaMano();
}

function preparaNuovaMano() {
    chiudiMessaggioAttesaStanza();

    mazzo = [];
    tavola = [];
    mani = [[], [], [], []];
    mazziPrese = [[], []];
    sbarazzine = [0, 0];
    ultimoAPrendere = -1;

    // Qui è la modifica importante:
    // il turno iniziale della mano è deciso da primoDiMano.
    turnoCorrente = primoDiMano;

    staAnimando = false;
    selezioneAttiva = false;
    carteSelezionate = [];
    cartaInSospeso = null;
    partenzaCartaInSospeso = null;
    buonGiocoScoperto = [false, false, false, false];

    const semi = ['Oro', 'Coppe', 'Spade', 'Bastoni'];

    for (let s of semi) {
        for (let v = 1; v <= 10; v++) {
            mazzo.push({ v, s });
        }
    }

    mazzo.sort(() => Math.random() - 0.5);

    tavola = mazzo.splice(0, 4);

    // Se tra le prime 4 carte c'è un asso, si rimescola
    while (tavola.some(c => c.v === 1)) {
        mazzo.push(...tavola);
        mazzo.sort(() => Math.random() - 0.5);
        tavola = mazzo.splice(0, 4);
    }

    const startBtn = document.getElementById('start-btn');

    if (startBtn) {
        startBtn.style.display = 'none';
    }

    aggiornaNomiGiocatoriSchermo();
    render();
    nuovaSmazzata();
}

async function prossimaMano() {
    // Finita una mano completa, il primo a tirare slitta di un posto.
    primoDiMano = (primoDiMano + 1) % 4;
    preparaNuovaMano();
}

async function nuovaSmazzata() {
    // Ogni nuova smazzata da 3 carte resetta il buon gioco scoperto
    buonGiocoScoperto = [false, false, false, false];

    for (let i = 0; i < 4; i++) {
        mani[i] = mazzo.splice(0, 3);
        await controllaAccusi(mani[i], i);
    }

    render();

    if (turnoCorrente !== 0) {
        gestisciTurniIA();
    }
}

async function controllaAccusi(mano, pIdx) {
    let squadra = squadraDi(pIdx);
    let v = mano.map(c => c.v).sort((a, b) => a - b);
    let somma = v[0] + v[1] + v[2];

    let pts = 0;
    let nome = "";

    if (v[0] === v[1] && v[1] === v[2]) {
        if (v[0] === 1) {
            pts = 11;
            nome = "3 ASSI";
        } else {
            pts = 7;
            nome = "TRIS";
        }
    } else if (somma <= 9) {
        if (v[0] === v[1] || v[1] === v[2]) {
            pts = 3;
            nome = "COPPIA SOTTO 9";
        } else {
            pts = 2;
            nome = "3 DIVERSE SOTTO 9";
        }
    }

    if (pts > 0) {
        buonGiocoScoperto[pIdx] = true;

        sbarazzine[squadra] += pts;
        aggiornaPunteggioSchermo();

        const ov = document.getElementById('overlay-msg');

        if (!ov) {
            return;
        }

        ov.className = "small-message";

        ov.innerHTML =
            `<h2 style="color:yellow">${nome}! (+${pts})</h2><div class="hand-row">` +
            mano.map(c => renderCartaHTML(c)).join('') +
            `</div>`;

        await aspetta(2300);

        ov.innerHTML = "";
        ov.className = "";

        render();
    }
}

function squadraDi(pIdx) {
    if (squadreStanza && Array.isArray(squadreStanza.squadraA) && Array.isArray(squadreStanza.squadraB)) {
        if (squadreStanza.squadraA.includes(pIdx)) {
            return 0;
        }

        if (squadreStanza.squadraB.includes(pIdx)) {
            return 1;
        }
    }

    return (pIdx === 0 || pIdx === 2) ? 0 : 1;
}

function nomeGiocatore(pIdx) {
    return nomeDaIndice(pIdx);
}

function aspetta(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function renderCartaHTML(c, extraClass = "") {
    const pos = posizioneSfondoCarta(c);

    return `<div class="card ${extraClass}" style="background-position: ${pos.px}px ${pos.py}px"></div>`;
}

function impostaGraficaCarta(el, carta) {
    const pos = posizioneSfondoCarta(carta);
    el.style.backgroundPosition = `${pos.px}px ${pos.py}px`;
}

function rectDaElemento(el) {
    const r = el.getBoundingClientRect();

    return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height
    };
}

function render() {
    aggiornaScalaCarte();
    aggiornaNomiGiocatoriSchermo();

    const tDiv = document.getElementById('tavolo-carte');

    if (!tDiv) {
        return;
    }

    tDiv.classList.toggle('table-many-cards', tavola.length > 8);

    // Le carte sul tavolo sono sempre scoperte
    tDiv.innerHTML = tavola.map((c, i) => {
        let selClass = selezioneAttiva ? 'selectable' : '';
        return renderCartaHTML(c, `${selClass} t-card-${i}`);
    }).join('');

    if (selezioneAttiva) {
        tavola.forEach((c, i) => {
            let el = document.querySelector(`.t-card-${i}`);
            if (el) {
                el.onclick = () => gestisciClickTavolo(c, el);
            }
        });
    }

    for (let i = 0; i < 4; i++) {
        const area = document.getElementById(`pos-${['bottom', 'left', 'top', 'right'][i]}`);
        const hDiv = document.getElementById(`hand-${i}`);

        if (!area || !hDiv) {
            continue;
        }

        area.className = `player-area ${turnoCorrente === i ? 'active' : ''}`;
        hDiv.classList.toggle('hand-many-cards', mani[i].length > 3);
        hDiv.innerHTML = '';

        mani[i].forEach((c, idx) => {
            let cardHTML = document.createElement('div');

            // Tu vedi sempre le tue carte.
            // Gli altri giocatori mostrano le carte solo se hanno fatto buon gioco.
            if (i === 0 || buonGiocoScoperto[i]) {
                cardHTML.className = 'card';
                impostaGraficaCarta(cardHTML, c);

                if (i === 0) {
                    cardHTML.onclick = () => tentaGiocata(idx, cardHTML);
                }
            } else {
                cardHTML.className = 'card back';
            }

            hDiv.appendChild(cardHTML);
        });
    }

    aggiornaPunteggioSchermo();
}

function aggiornaPunteggioSchermo() {
    // Durante la mano mostriamo il totale partita + i punti fatti nella mano corrente.
    const pA = document.getElementById('pA');
    const pB = document.getElementById('pB');

    if (pA) {
        pA.innerText = puntiPartita[0] + sbarazzine[0];
    }

    if (pB) {
        pB.innerText = puntiPartita[1] + sbarazzine[1];
    }
}

async function tentaGiocata(idx, cartaEl) {
    if (turnoCorrente !== 0 || staAnimando || selezioneAttiva) {
        return;
    }

    partenzaCartaInSospeso = rectDaElemento(cartaEl);

    cartaInSospeso = mani[0].splice(idx, 1)[0];

    let combos = trovaTutteLeCombinazioni(tavola, cartaInSospeso.v);

    if (combos.length > 1) {
        selezioneAttiva = true;
        carteSelezionate = [];
        render();
    } else {
        render();

        await giocaCartaConAnimazione(
            cartaInSospeso,
            combos.length === 1 ? combos[0] : [],
            0,
            partenzaCartaInSospeso
        );

        cartaInSospeso = null;
        partenzaCartaInSospeso = null;
        concludiMossa();
    }
}

async function gestisciClickTavolo(carta, el) {
    if (staAnimando) {
        return;
    }

    if (carteSelezionate.includes(carta)) {
        carteSelezionate = carteSelezionate.filter(c => c !== carta);
        el.classList.remove('selected');
    } else {
        carteSelezionate.push(carta);
        el.classList.add('selected');
    }

    let sommaSelezionata = carteSelezionate.reduce((a, b) => a + b.v, 0);

    if (sommaSelezionata === cartaInSospeso.v) {
        selezioneAttiva = false;

        await giocaCartaConAnimazione(
            cartaInSospeso,
            [...carteSelezionate],
            0,
            partenzaCartaInSospeso
        );

        carteSelezionate = [];
        cartaInSospeso = null;
        partenzaCartaInSospeso = null;
        concludiMossa();
    }
}

async function gestisciTurniIA() {
    if (turnoCorrente === 0 || staAnimando) {
        return;
    }

    staAnimando = true;

    await aspetta(900);

    const hDiv = document.getElementById(`hand-${turnoCorrente}`);
    const cartaEl = hDiv ? hDiv.querySelector('.card') : null;

    let rectPartenza = cartaEl ? rectDaElemento(cartaEl) : rettangoloPartenzaGiocatore(turnoCorrente);

    let c = mani[turnoCorrente].splice(0, 1)[0];

    let combos = trovaTutteLeCombinazioni(tavola, c.v);

    render();

    await giocaCartaConAnimazione(
        c,
        combos.length > 0 ? combos[0] : [],
        turnoCorrente,
        rectPartenza
    );

    concludiMossa();
}

async function giocaCartaConAnimazione(carta, prese, pIdx, rectPartenza) {
    staAnimando = true;

    let preseEffettive = prese;

    if (carta.v === 1 && prese.length === 0 && tavola.length > 0) {
        preseEffettive = [...tavola];
    }

    await animaLancioCarta(carta, pIdx, rectPartenza);

    if (preseEffettive.length > 0) {
        await animaPrese(carta, preseEffettive, pIdx);
    }

    eseguiLogica(carta, prese, pIdx);
}

function rettangoloPartenzaGiocatore(pIdx) {
    const posizioni = ['bottom', 'left', 'top', 'right'];
    const area = document.getElementById(`pos-${posizioni[pIdx]}`);
    const r = area.getBoundingClientRect();

    return {
        left: r.left + r.width / 2 - larghezzaCarta() / 2,
        top: r.top + r.height / 2 - altezzaCarta() / 2,
        width: larghezzaCarta(),
        height: altezzaCarta()
    };
}

function rettangoloCentroTavolo() {
    const area = document.getElementById('center-area');
    const r = area.getBoundingClientRect();

    return {
        left: r.left + r.width / 2 - larghezzaCarta() / 2,
        top: r.top + r.height / 2 - altezzaCarta() / 2,
        width: larghezzaCarta(),
        height: altezzaCarta()
    };
}

function creaCartaVolante(carta, rect, classExtra = "") {
    let el = document.createElement('div');
    el.className = `card flying-card ${classExtra}`;
    impostaGraficaCarta(el, carta);

    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    el.style.width = larghezzaCarta() + "px";
    el.style.height = altezzaCarta() + "px";

    document.body.appendChild(el);
    return el;
}

async function animaLancioCarta(carta, pIdx, rectPartenza) {
    const startRect = rectPartenza || rettangoloPartenzaGiocatore(pIdx);
    const endRect = rettangoloCentroTavolo();

    const volante = creaCartaVolante(carta, startRect, "throwing");

    await aspetta(30);

    volante.style.left = endRect.left + "px";
    volante.style.top = endRect.top + "px";
    volante.style.transform = "rotate(360deg) scale(1.08)";

    await aspetta(520);

    volante.remove();
}

async function animaPrese(cartaGiocata, prese, pIdx) {
    const squadra = squadraDi(pIdx);
    const destinazione = document.getElementById(squadra === 0 ? 'pos-bottom' : 'pos-right');
    const destRectOriginale = destinazione.getBoundingClientRect();

    const destRect = {
        left: destRectOriginale.left + destRectOriginale.width / 2 - larghezzaCarta() / 2,
        top: destRectOriginale.top + destRectOriginale.height / 2 - altezzaCarta() / 2,
        width: larghezzaCarta(),
        height: altezzaCarta()
    };

    let carteDaAnimare = [];

    carteDaAnimare.push({
        carta: cartaGiocata,
        rect: rettangoloCentroTavolo()
    });

    prese.forEach(cartaPresa => {
        let idx = tavola.indexOf(cartaPresa);
        let el = document.querySelector(`.t-card-${idx}`);

        if (el) {
            carteDaAnimare.push({
                carta: cartaPresa,
                rect: rectDaElemento(el)
            });
        }
    });

    let volanti = carteDaAnimare.map((item, i) => {
        let el = creaCartaVolante(item.carta, item.rect, "taking");
        el.style.transitionDelay = `${i * 60}ms`;
        return el;
    });

    await aspetta(40);

    volanti.forEach((el, i) => {
        el.style.left = destRect.left + "px";
        el.style.top = destRect.top + "px";
        el.style.transform = `scale(0.25) rotate(${i % 2 === 0 ? -25 : 25}deg)`;
        el.style.opacity = "0";
    });

    await aspetta(680);

    volanti.forEach(el => el.remove());
}

function concludiMossa() {
    staAnimando = false;

    turnoCorrente = (turnoCorrente + 1) % 4;

    render();

    if (mani.every(m => m.length === 0)) {
        if (mazzo.length > 0) {
            nuovaSmazzata();
        } else {
            calcolaPuntiFinali();
        }
    } else {
        if (turnoCorrente !== 0) {
            gestisciTurniIA();
        }
    }
}

function eseguiLogica(carta, prese, pIdx) {
    let squadra = squadraDi(pIdx);

    if (carta.v === 1 && prese.length === 0 && tavola.length > 0) {
        prese = [...tavola];

        mazziPrese[squadra].push(carta, ...prese);

        tavola = [];

        ultimoAPrendere = squadra;

        sbarazzine[squadra]++;
        aggiornaPunteggioSchermo();
    }

    else if (prese.length > 0) {
        tavola = tavola.filter(c => !prese.includes(c));

        mazziPrese[squadra].push(carta, ...prese);

        ultimoAPrendere = squadra;

        if (tavola.length === 0) {
            sbarazzine[squadra]++;
            aggiornaPunteggioSchermo();
        }
    }

    else {
        tavola.push(carta);
    }
}

function trovaTutteLeCombinazioni(cards, target) {
    let singola = cards.find(c => c.v === target);

    if (singola) {
        return [[singola]];
    }

    let ris = [];

    const f = (s, t, c) => {
        if (t === 0) {
            ris.push(c);
            return;
        }

        for (let i = s; i < cards.length; i++) {
            if (cards[i].v <= t) {
                f(i + 1, t - cards[i].v, [...c, cards[i]]);
            }
        }
    };

    f(0, target, []);

    return ris;
}

function valorePrimiera(carta) {
    if (carta.v === 7) return 21;
    if (carta.v === 6) return 18;
    if (carta.v === 1) return 16;
    if (carta.v === 5) return 15;
    if (carta.v === 4) return 14;
    if (carta.v === 3) return 13;
    if (carta.v === 2) return 12;
    return 10;
}

function calcolaPrimiera(manoPrese) {
    const semi = ['Oro', 'Coppe', 'Spade', 'Bastoni'];
    let totale = 0;

    for (let seme of semi) {
        let carteDelSeme = manoPrese.filter(c => c.s === seme);

        if (carteDelSeme.length === 0) {
            return 0;
        }

        let migliorValore = Math.max(...carteDelSeme.map(c => valorePrimiera(c)));
        totale += migliorValore;
    }

    return totale;
}

function aggiungiRiga(righe, voce, squadraA, squadraB) {
    righe.push({
        voce,
        squadraA,
        squadraB
    });
}

function calcolaPuntiFinali() {
    if (tavola.length > 0 && ultimoAPrendere !== -1) {
        mazziPrese[ultimoAPrendere].push(...tavola);
        tavola = [];
    }

    let puntiMano = [sbarazzine[0], sbarazzine[1]];

    let carteSquadraA = mazziPrese[0];
    let carteSquadraB = mazziPrese[1];

    let denariA = carteSquadraA.filter(c => c.s === 'Oro').length;
    let denariB = carteSquadraB.filter(c => c.s === 'Oro').length;

    let numeroCarteA = carteSquadraA.length;
    let numeroCarteB = carteSquadraB.length;

    let primieraA = calcolaPrimiera(carteSquadraA);
    let primieraB = calcolaPrimiera(carteSquadraB);

    let righe = [];

    aggiungiRiga(righe, "Carte prese", numeroCarteA, numeroCarteB);
    aggiungiRiga(righe, "Denari presi", denariA, denariB);
    aggiungiRiga(righe, "Primiera", primieraA, primieraB);
    aggiungiRiga(righe, "Sbarazzine / accusi", sbarazzine[0], sbarazzine[1]);

    let dieciDenariA = carteSquadraA.some(c => c.v === 10 && c.s === 'Oro') ? 1 : 0;
    let dieciDenariB = carteSquadraB.some(c => c.v === 10 && c.s === 'Oro') ? 1 : 0;

    puntiMano[0] += dieciDenariA;
    puntiMano[1] += dieciDenariB;

    aggiungiRiga(righe, "10 di denari", dieciDenariA ? "+1" : "0", dieciDenariB ? "+1" : "0");

    let setteDenariA = carteSquadraA.some(c => c.v === 7 && c.s === 'Oro') ? 1 : 0;
    let setteDenariB = carteSquadraB.some(c => c.v === 7 && c.s === 'Oro') ? 1 : 0;

    puntiMano[0] += setteDenariA;
    puntiMano[1] += setteDenariB;

    aggiungiRiga(righe, "7 di denari", setteDenariA ? "+1" : "0", setteDenariB ? "+1" : "0");

    let puntoDenariA = 0;
    let puntoDenariB = 0;

    if (denariA > 5) {
        puntoDenariA = 1;
        puntiMano[0]++;
    } else if (denariB > 5) {
        puntoDenariB = 1;
        puntiMano[1]++;
    }

    aggiungiRiga(
        righe,
        "Maggioranza denari",
        puntoDenariA ? `+1 (${denariA})` : "0",
        puntoDenariB ? `+1 (${denariB})` : "0"
    );

    let puntoCarteA = 0;
    let puntoCarteB = 0;

    if (numeroCarteA > 20) {
        puntoCarteA = 1;
        puntiMano[0]++;
    } else if (numeroCarteB > 20) {
        puntoCarteB = 1;
        puntiMano[1]++;
    }

    aggiungiRiga(
        righe,
        "Maggioranza carte",
        puntoCarteA ? `+1 (${numeroCarteA})` : "0",
        puntoCarteB ? `+1 (${numeroCarteB})` : "0"
    );

    let puntoPrimieraA = 0;
    let puntoPrimieraB = 0;

    if (primieraA > primieraB) {
        puntoPrimieraA = 1;
        puntiMano[0]++;
    } else if (primieraB > primieraA) {
        puntoPrimieraB = 1;
        puntiMano[1]++;
    }

    aggiungiRiga(
        righe,
        "Punto primiera",
        puntoPrimieraA ? `+1 (${primieraA})` : "0",
        puntoPrimieraB ? `+1 (${primieraB})` : "0"
    );

    let dueCoppeA = carteSquadraA.some(c => c.v === 2 && c.s === 'Coppe') ? -5 : 0;
    let dueCoppeB = carteSquadraB.some(c => c.v === 2 && c.s === 'Coppe') ? -5 : 0;

    puntiMano[0] += dueCoppeA;
    puntiMano[1] += dueCoppeB;

    aggiungiRiga(righe, "2 di coppe", dueCoppeA ? "-5" : "0", dueCoppeB ? "-5" : "0");

    aggiungiRiga(righe, "Punti mano", puntiMano[0], puntiMano[1]);

    puntiPartita[0] += puntiMano[0];
    puntiPartita[1] += puntiMano[1];

    aggiungiRiga(righe, "Totale partita", puntiPartita[0], puntiPartita[1]);

    aggiornaPunteggioSchermo();
    mostraTabellaFinale(righe, puntiMano);
}

function mostraTabellaFinale(righe, puntiMano) {
    const ov = document.getElementById('overlay-msg');
    ov.className = "results-overlay";

    let partitaFinita = puntiPartita[0] >= PUNTI_VITTORIA || puntiPartita[1] >= PUNTI_VITTORIA;

    let titolo = "Fine mano";
    let sottotitolo = `Prossimo primo a tirare: ${nomeGiocatore((primoDiMano + 1) % 4)}`;

    if (partitaFinita) {
        titolo = "Partita finita";

        if (puntiPartita[0] > puntiPartita[1]) {
            sottotitolo = "Vince Squadra A";
        } else if (puntiPartita[1] > puntiPartita[0]) {
            sottotitolo = "Vince Squadra B";
        } else {
            sottotitolo = "Pareggio";
        }
    }

    let righeHTML = righe.map(r => {
        let isTotale = r.voce === "Totale partita";

        return `
            <tr class="${isTotale ? 'total-row' : ''}">
                <td>${r.voce}</td>
                <td>${r.squadraA}</td>
                <td>${r.squadraB}</td>
            </tr>
        `;
    }).join('');

    let bottoneFinale = "";

    if (partitaFinita) {
        bottoneFinale = `<button class="close-results-btn" onclick="inizia()">Nuova partita</button>`;
    } else {
        bottoneFinale = `<button class="close-results-btn" onclick="prossimaMano()">Prossima mano</button>`;
    }

    ov.innerHTML = `
        <div class="results-card">
            <h1>${titolo}</h1>
            <h2>${sottotitolo}</h2>

            <table class="results-table">
                <thead>
                    <tr>
                        <th>Voce</th>
                        <th>Squadra A<br><span>Tu + Compagno</span></th>
                        <th>Squadra B<br><span>Avversari</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${righeHTML}
                </tbody>
            </table>

            ${bottoneFinale}
        </div>
    `;
}

function mostraPiantino() {
    if (statoConnessioneStanza === "dentro" || statoConnessioneStanza === "in-partita") {
        socket.emit("piantino");
        return;
    }

    mostraPiantinoLocale({
        nome: nomePlayer || "Giocatore"
    });
}

function mostraPiantinoLocale(dati = {}) {
    const piantino = document.createElement("div");
    piantino.className = "piantino-emoji";
    piantino.innerText = "😭";

    const label = document.createElement("div");
    label.className = "piantino-label";
    label.innerText = `${dati.nome || "Giocatore"} ha fatto piantino`;

    document.body.appendChild(piantino);
    document.body.appendChild(label);

    setTimeout(() => {
        piantino.remove();
        label.remove();
    }, 1800);
}
